<?php

use App\Models\JournalAudit;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use PragmaRX\Google2FA\Google2FA;

/*
|--------------------------------------------------------------------------
| 2FA TOTP (CAHIER § 6.1, § 13) : initialiser → activer (codes de secours) → vérifier ; obligatoire pour /admin.
|--------------------------------------------------------------------------
*/

function codeTotp(string $secret): string
{
    return app(Google2FA::class)->getCurrentOtp($secret);
}

/** Code de la fenêtre suivante (accepté grâce à la tolérance ± 30 s, et « plus récent » pour l'anti-rejeu). */
function codeTotpSuivant(string $secret, int $decalage = 1): string
{
    $g = app(Google2FA::class);

    return $g->oathTotp($secret, $g->getTimestamp() + $decalage);
}

it('initialise puis active la 2FA : secret chiffré en base, QR SVG, 8 codes de secours renvoyés une seule fois', function () {
    $user = User::factory()->create();

    $init = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->assertOk()
        ->assertJsonStructure(['secret', 'otpauth_url', 'qr_svg'])
        ->assertHeader('Cache-Control', 'no-store, private');

    $secret = $init->json('secret');
    expect($secret)->toHaveLength(32)
        ->and($init->json('otpauth_url'))->toStartWith('otpauth://totp/')->toContain(rawurlencode($user->email))->toContain('secret='.$secret)
        ->and($init->json('qr_svg'))->toStartWith('<?xml')->toContain('<svg');

    // Secret chiffré en base (jamais en clair), pas encore actif.
    expect(DB::table('users')->where('id', $user->id)->value('two_factor_secret'))->toStartWith('v1:')->not->toContain($secret)
        ->and($user->fresh()->deuxFaActive())->toBeFalse();
    $this->getJson('/api/v1/moi')->assertJsonPath('utilisateur.deux_fa', ['active' => false, 'requise' => false, 'validee' => false]);

    // Mauvais code → 422, puis bon code → actif + codes de secours.
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => '000000'])->assertStatus(422)->assertJsonPath('code', 'CODE_INVALIDE');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => 'abc'])->assertStatus(422)->assertJsonValidationErrors(['code']);

    $activation = $this->postJson('/api/v1/auth/2fa/activer', ['code' => codeTotp($secret)])->assertOk()
        ->assertJsonCount(8, 'codes_secours')
        ->assertJsonPath('deux_fa', ['active' => true, 'requise' => false, 'validee' => true]);

    foreach ($activation->json('codes_secours') as $code) {
        expect($code)->toMatch('/^[A-Z2-9]{4}-[A-Z2-9]{4}$/');
    }

    // Codes hachés et chiffrés en base : aucun code en clair.
    $brut = DB::table('users')->where('id', $user->id)->value('two_factor_recovery_codes');
    expect($brut)->toStartWith('v1:');
    foreach ($activation->json('codes_secours') as $code) {
        expect($user->fresh()->two_factor_recovery_codes)->not->toContain(str_replace('-', '', $code));
    }

    // Ré-initialiser une 2FA active est refusé ; /moi n'expose jamais le secret.
    $this->postJson('/api/v1/auth/2fa/initialiser')->assertStatus(409)->assertJsonPath('code', 'DEUX_FA_DEJA_ACTIVE');
    $moi = $this->getJson('/api/v1/moi')->assertOk();
    expect($moi->getContent())->not->toContain($secret)->not->toContain('two_factor');

    expect(JournalAudit::query()->where('action', 'auth.2fa_activee')->count())->toBe(1);
});

it('vérifie le code après connexion (TOTP ou code de secours à usage unique, anti-rejeu) et marque la session', function () {
    $user = User::factory()->create();
    $secret = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->json('secret');
    $codes = $this->postJson('/api/v1/auth/2fa/activer', ['code' => codeTotp($secret)])->json('codes_secours');

    // Nouvelle connexion : la 2FA n'est plus validée dans cette session.
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => $user->email, 'password' => MDP_TEST])->assertOk()
        ->assertJsonPath('utilisateur.deux_fa', ['active' => true, 'requise' => false, 'validee' => false]);

    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => '123456'])->assertStatus(422)->assertJsonPath('code', 'CODE_INVALIDE');

    // Limite de 5 / min : on avance d'une minute (le cache anti-rejeu, lui, dure 3 min).
    $this->travel(61)->seconds();

    // Le code de l'activation (même fenêtre de 30 s) a déjà servi : anti-rejeu.
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => codeTotp($secret)])->assertStatus(422)->assertJsonPath('code', 'CODE_INVALIDE');

    $code = codeTotpSuivant($secret);
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => $code])->assertOk()
        ->assertJsonPath('utilisateur.ulid', $user->ulid)
        ->assertJsonPath('utilisateur.deux_fa.validee', true)->assertJsonPath('methode', 'totp')->assertJsonPath('codes_secours_restants', 8);
    $this->getJson('/api/v1/moi')->assertJsonPath('utilisateur.deux_fa.validee', true);

    // Rejeu du même code : refusé.
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => $code])->assertStatus(422)->assertJsonPath('code', 'CODE_INVALIDE');

    $this->travel(61)->seconds();

    // Code de secours : accepté une seule fois (avec ou sans tiret, minuscules tolérées).
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => strtolower($codes[0])])->assertOk()->assertJsonPath('methode', 'secours')->assertJsonPath('codes_secours_restants', 7);
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => $codes[0]])->assertStatus(422);
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => str_replace('-', '', $codes[1])])->assertOk()->assertJsonPath('codes_secours_restants', 6);

    expect(JournalAudit::query()->where('action', 'auth.2fa_echec')->count())->toBe(4)
        ->and(JournalAudit::query()->where('action', 'auth.2fa_verifiee')->count())->toBe(3);

    // Un compte sans 2FA ne peut pas « vérifier ».
    $autre = User::factory()->create();
    connecte($autre)->postJson('/api/v1/auth/2fa/verifier', ['code' => '123456'])->assertStatus(409)->assertJsonPath('code', 'DEUX_FA_INACTIVE');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => '123456'])->assertStatus(409)->assertJsonPath('code', 'DEUX_FA_NON_INITIALISEE');
});

it('désactive la 2FA avec le mot de passe revérifié, et limite les tentatives à 5 par minute', function () {
    $user = User::factory()->create();
    $secret = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->json('secret');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => codeTotp($secret)])->assertOk();

    $this->deleteJson('/api/v1/auth/2fa', ['password' => 'mauvais'])->assertStatus(422)->assertJsonValidationErrors(['password']);
    expect($user->fresh()->deuxFaActive())->toBeTrue();

    $this->deleteJson('/api/v1/auth/2fa', ['password' => MDP_TEST])->assertNoContent();
    $u = $user->fresh();
    expect($u->deuxFaActive())->toBeFalse()->and($u->two_factor_secret)->toBeNull()->and($u->two_factor_recovery_codes)->toBeNull();
    $this->getJson('/api/v1/moi')->assertJsonPath('utilisateur.deux_fa.active', false);
    expect(JournalAudit::query()->where('action', 'auth.2fa_desactivee')->count())->toBe(1);

    // 5 requêtes 2FA par minute (déjà 4 consommées ci-dessus) : la 6e est bloquée.
    $this->postJson('/api/v1/auth/2fa/initialiser')->assertOk();
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => '000000'])->assertStatus(429)->assertJsonPath('code', 'TROP_DE_TENTATIVES');

    // Sans session : 401.
    app('auth')->forgetGuards();
    $this->flushSession();
    $this->postJson('/api/v1/auth/2fa/initialiser')->assertUnauthorized();
});

it('impose la 2FA au super-admin sur toute la console, jamais sur les routes 2FA elles-mêmes', function () {
    $admin = User::factory()->superAdmin()->create();

    connecte($admin)->getJson('/api/v1/moi')->assertOk()->assertJsonPath('utilisateur.deux_fa', ['active' => false, 'requise' => true, 'validee' => false]);

    foreach (['admin/boutiques', 'admin/sante', 'admin/journal', 'admin/statistiques', 'admin/audio/matrice'] as $chemin) {
        $this->getJson("/api/v1/{$chemin}")->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');
    }
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [1]])->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');

    $secret = $this->postJson('/api/v1/auth/2fa/initialiser')->assertOk()->json('secret');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => codeTotp($secret)])->assertOk()->assertJsonPath('deux_fa.requise', true);

    // Activée dans cette session → console accessible.
    $this->getJson('/api/v1/admin/statistiques')->assertOk();

    // Reconnexion : active mais à vérifier.
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => $admin->email, 'password' => MDP_TEST])->assertOk();
    $this->getJson('/api/v1/admin/statistiques')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE')->assertJsonPath('etape', 'verifier');
    $this->postJson('/api/v1/auth/2fa/verifier', ['code' => codeTotpSuivant($secret)])->assertOk()->assertJsonPath('utilisateur.deux_fa', ['active' => true, 'requise' => true, 'validee' => true]);
    $this->getJson('/api/v1/admin/statistiques')->assertOk();

    // Un propriétaire avec 2FA n'entre jamais dans la console.
    ['user' => $proprio] = boutiqueAvec('proprietaire');
    $s = connecte($proprio)->postJson('/api/v1/auth/2fa/initialiser')->json('secret');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => codeTotp($s)])->assertOk();
    $this->getJson('/api/v1/admin/statistiques')->assertForbidden()->assertJsonPath('code', 'INTERDIT');
});

it('SUPERADMIN_2FA_OBLIGATOIRE=false suspend la 2FA du super-admin (console sans code), jamais pour un propriétaire', function () {
    config(['satspoint.deux_fa_super_admin' => false]);
    $admin = User::factory()->superAdmin()->create();

    connecte($admin)->getJson('/api/v1/moi')->assertOk()->assertJsonPath('utilisateur.deux_fa', ['active' => false, 'requise' => false, 'validee' => false]);
    $this->getJson('/api/v1/admin/statistiques')->assertOk();
    $this->getJson('/api/v1/admin/audio/matrice')->assertOk();

    // Le rôle reste vérifié : un propriétaire n'entre toujours pas dans la console.
    ['user' => $proprio] = boutiqueAvec('proprietaire');
    connecte($proprio)->getJson('/api/v1/admin/statistiques')->assertForbidden()->assertJsonPath('code', 'INTERDIT');

    // Remise en service : de nouveau exigée.
    config(['satspoint.deux_fa_super_admin' => true]);
    connecte($admin)->getJson('/api/v1/admin/statistiques')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');
});

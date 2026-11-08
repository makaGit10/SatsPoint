<?php

use App\Http\Middleware\VerifierSessionRevoquee;
use App\Models\JournalAudit;
use App\Models\User;

it('connecte par e-mail ou téléphone et met à jour derniere_connexion_at', function () {
    $user = User::factory()->create(['email' => 'awa@example.com', 'telephone' => '+221771234567']);

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'AWA@example.com', 'password' => MDP_TEST])
        ->assertOk()
        ->assertJsonPath('utilisateur.ulid', $user->ulid)
        ->assertJsonMissingPath('utilisateur.password');

    expect($user->fresh()->derniere_connexion_at)->not->toBeNull();

    $journal = JournalAudit::query()->where('action', 'auth.connexion')->latest('id')->first();
    expect($journal)->not->toBeNull()
        ->and($journal->user_id)->toBe($user->id)
        ->and($journal->ip)->not->toBeNull()
        ->and(json_encode($journal->details))->not->toContain(MDP_TEST);

    $this->postJson('/api/v1/auth/deconnexion')->assertNoContent();

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => '77 123 45 67', 'password' => MDP_TEST, 'se_souvenir' => true])
        ->assertOk()->assertJsonPath('utilisateur.ulid', $user->ulid);
});

it('renvoie un message générique en cas d\'échec (compte inconnu ou mauvais mot de passe) et journalise sans mot de passe', function () {
    User::factory()->create(['email' => 'awa@example.com']);

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa@example.com', 'password' => 'mauvais-mot-de-passe'])
        ->assertStatus(401)->assertJson(['message' => 'Identifiants incorrects.', 'code' => 'IDENTIFIANTS_INCORRECTS']);

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'inconnu@example.com', 'password' => 'mauvais-mot-de-passe'])
        ->assertStatus(401)->assertJson(['message' => 'Identifiants incorrects.', 'code' => 'IDENTIFIANTS_INCORRECTS']);

    $this->assertGuest('web');

    $echecs = JournalAudit::query()->where('action', 'auth.echec')->get();
    expect($echecs)->toHaveCount(2);
    foreach ($echecs as $echec) {
        expect(json_encode($echec->details))->not->toContain('mauvais-mot-de-passe')->not->toContain('awa@example.com');
    }
});

it('verrouille après 5 tentatives par identifiant (429)', function () {
    User::factory()->create(['email' => 'awa@example.com']);

    for ($i = 0; $i < 5; $i++) {
        $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa@example.com', 'password' => 'mauvais'])->assertStatus(401);
    }

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa@example.com', 'password' => MDP_TEST])
        ->assertStatus(429)
        ->assertJsonPath('code', 'TROP_DE_TENTATIVES')
        ->assertHeader('Retry-After');
});

it('déconnecte (204) puis refuse /moi (401)', function () {
    $user = User::factory()->create();

    connecte($user)->getJson('/api/v1/moi')->assertOk();

    $this->postJson('/api/v1/auth/deconnexion')->assertNoContent();
    $this->assertGuest('web');

    $this->getJson('/api/v1/moi')->assertStatus(401)->assertJsonPath('code', 'NON_AUTHENTIFIE');
});

it('déconnecte partout : toutes les sessions antérieures sont révoquées', function () {
    $user = User::factory()->create();

    connecte($user)->postJson('/api/v1/auth/deconnexion-partout')->assertNoContent();

    $user = $user->fresh();
    expect($user->sessions_revoquees_at)->not->toBeNull();

    // Une session ouverte AVANT la révocation (empreinte ancienne) est rejetée…
    connecte($user)->withSession([VerifierSessionRevoquee::CLE_SESSION => '0'])
        ->getJson('/api/v1/moi')->assertStatus(401)->assertJsonPath('code', 'SESSION_REVOQUEE');

    // … une connexion APRÈS la révocation fonctionne.
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => $user->email, 'password' => MDP_TEST])->assertOk();
    $this->getJson('/api/v1/moi')->assertOk();
});

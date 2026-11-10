<?php

use App\Events\DonneesModifiees;
use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\User;
use Illuminate\Support\Facades\Event;

/*
|--------------------------------------------------------------------------
| Console plateforme — compléments : 2FA sur toutes les méthodes, signal de suspension,
| canal temps réel coupé, statistiques à vide, pagination du journal, validation des filtres.
|--------------------------------------------------------------------------
*/

it('exige la 2FA vérifiée sur chaque route /admin, quelle que soit la méthode HTTP', function () {
    $admin = User::factory()->superAdmin()->create();
    $admin->forceFill(['two_factor_secret' => 'JBSWY3DPEHPK3PXP', 'two_factor_confirmed_at' => now()])->save();
    ['boutique' => $b] = boutiqueAvec('proprietaire');
    connecte($admin);

    $appels = [
        ['get', '/api/v1/admin/audio/matrice'],
        ['post', '/api/v1/admin/audio'],
        ['post', '/api/v1/admin/audio/publier'],
        ['get', '/api/v1/admin/audio/1'],
        ['get', '/api/v1/admin/audio/1/ecouter'],
        ['delete', '/api/v1/admin/audio/1'],
        ['get', '/api/v1/admin/boutiques'],
        ['patch', "/api/v1/admin/boutiques/{$b->ulid}"],
        ['get', '/api/v1/admin/sante'],
        ['get', '/api/v1/admin/journal'],
        ['get', '/api/v1/admin/statistiques'],
    ];

    foreach ($appels as [$methode, $uri]) {
        $this->json($methode, $uri, ['statut' => 'suspendue'])->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE')->assertJsonPath('etape', 'verifier');
    }

    expect($b->fresh()->statut)->toBe('active');
});

it('la suspension prévient les écrans ouverts de la boutique (rubrique parametres) et coupe son canal temps réel', function () {
    $admin = adminConsole();
    ['boutique' => $a, 'user' => $proprio] = boutiquePrete();

    Event::fake([DonneesModifiees::class]);
    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'suspendue'])->assertOk();

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-boutique.'.$a->ulid && $e->rubrique === 'parametres' && $e->auteur === $admin->ulid);

    connecte($proprio)->postJson('/api/v1/auth/connexion', ['identifiant' => $proprio->email, 'password' => MDP_TEST])->assertOk();

    // Toutes les écritures sont refusées, la déconnexion reste possible.
    $this->patchJson('/api/v1/boutique', ['nom' => 'Pirate'])->assertForbidden()->assertJsonPath('code', 'BOUTIQUE_SUSPENDUE');
    $this->postJson('/api/v1/articles', ['nom' => 'X', 'prix_xof' => 1])->assertForbidden();
    $this->getJson('/api/v1/recherche?q=pain')->assertForbidden();
    $this->getJson('/api/v1/exports/ventes')->assertForbidden();
    $this->postJson('/api/v1/auth/deconnexion')->assertSuccessful();
    expect(Boutique::query()->whereKey($a->id)->value('nom'))->not->toBe('Pirate');
});

it('suspendre deux fois ne journalise qu\'une fois ; réactiver une boutique active ne fait rien', function () {
    adminConsole();
    ['boutique' => $a] = boutiqueAvec('proprietaire');

    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'suspendue'])->assertOk();
    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'suspendue'])->assertOk()->assertJsonPath('boutique.statut', 'suspendue');
    expect(JournalAudit::query()->where('action', 'plateforme.boutique_suspendue')->count())->toBe(1);

    ['boutique' => $b] = boutiqueAvec('proprietaire');
    $this->patchJson("/api/v1/admin/boutiques/{$b->ulid}", ['statut' => 'active'])->assertOk();
    expect(JournalAudit::query()->where('action', 'plateforme.boutique_reactivee')->count())->toBe(0);
    $this->patchJson("/api/v1/admin/boutiques/{$b->ulid}", [])->assertStatus(422);
});

it('renvoie des statistiques à zéro sur une plateforme vide (aucune division par zéro)', function () {
    adminConsole();

    $r = $this->getJson('/api/v1/admin/statistiques')->assertOk()
        ->assertJsonPath('commercants_actifs_semaine', 0)
        ->assertJsonPath('delai_median_confirmation_ms', null)
        ->assertJsonPath('part_sats_pct', 0)
        ->assertJsonPath('part_mobile_money_pct', 0)
        ->assertJsonPath('couverture_audio', ['wo' => 0, 'srr' => 0, 'ff' => 0, 'dyo' => 0, 'fr' => 0]);

    expect($r->json('paiements_par_commercant_semaine'))->toEqual(0)
        ->and(array_slice(array_keys($r->json()), 0, 6))->toBe(['commercants_actifs_semaine', 'paiements_par_commercant_semaine', 'delai_median_confirmation_ms', 'part_sats_pct', 'part_mobile_money_pct', 'paiements_reussis_30j']);
});

it('pagine le journal par numéro de page sans doublon ni trou, le plus récent d\'abord', function () {
    $admin = adminConsole();
    foreach (range(1, 25) as $i) {
        JournalAudit::query()->forceCreate(['action' => 'test.action', 'user_id' => $admin->id, 'ip' => '127.0.0.1', 'details' => ['n' => $i], 'created_at' => now()->subMinutes(30 - $i)]);
    }

    $vus = [];
    foreach ([1 => 10, 2 => 10, 3 => 5] as $numero => $attendu) {
        $r = $this->getJson("/api/v1/admin/journal?action=test.action&par_page=10&page={$numero}")->assertOk()
            ->assertJsonCount($attendu, 'entrees')
            ->assertJsonPath('pagination', ['page' => $numero, 'par_page' => 10, 'total' => 25, 'pages' => 3]);
        $vus = array_merge($vus, array_column(array_column($r->json('entrees'), 'details'), 'n'));
    }

    expect($vus)->toBe(range(25, 1));
    // Au-delà de la dernière page : liste vide, total exact (le client revient à la dernière page).
    $this->getJson('/api/v1/admin/journal?action=test.action&par_page=10&page=9')->assertOk()->assertJsonCount(0, 'entrees')
        ->assertJsonPath('pagination', ['page' => 9, 'par_page' => 10, 'total' => 25, 'pages' => 3]);
    // Ancien paramètre de curseur : ignoré (première page).
    $this->getJson('/api/v1/admin/journal?action=test.action&par_page=10&curseur=pas-un-curseur')->assertOk()->assertJsonPath('pagination.page', 1);
    foreach (['page=0', 'page=x', 'page=10001', 'par_page=0', 'par_page=9', 'par_page=101'] as $mauvais) {
        $this->getJson("/api/v1/admin/journal?{$mauvais}")->assertStatus(422);
    }
    $this->getJson('/api/v1/admin/journal?du=2026-13-45')->assertStatus(422);
});

it('valide les filtres de la liste des boutiques', function () {
    adminConsole();

    $this->getJson('/api/v1/admin/boutiques?par_page=500')->assertStatus(422);
    $this->getJson('/api/v1/admin/boutiques?par_page=5')->assertStatus(422);
    $this->getJson('/api/v1/admin/boutiques?page=0')->assertStatus(422);
    $this->getJson('/api/v1/admin/boutiques?q='.str_repeat('x', 200))->assertStatus(422);
    $this->getJson("/api/v1/admin/boutiques?q=' OR 1=1 --")->assertOk()->assertJsonPath('boutiques', []);
});

it('la santé détaillée ne révèle aucune configuration sensible', function () {
    adminConsole();

    $contenu = strtolower($this->getJson('/api/v1/admin/sante')->assertOk()->getContent());

    foreach (['password', 'secret', 'app_key', 'redis://', 'pgsql', 'hmac', 'nostr+walletconnect'] as $interdit) {
        expect($contenu)->not->toContain($interdit);
    }
});

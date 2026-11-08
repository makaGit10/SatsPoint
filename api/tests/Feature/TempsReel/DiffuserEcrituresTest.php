<?php

use App\Events\DonneesModifiees;
use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\User;
use App\Services\Diffuseur;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;

it('émet un signal « parametres » sur le canal privé de la boutique après une écriture métier', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');

    connecte($proprio)->patchJson('/api/v1/boutique', ['nom' => 'Renommée'])->assertOk();

    Event::assertDispatched(DonneesModifiees::class, function (DonneesModifiees $e) use ($boutique, $proprio) {
        return $e->rubrique === 'parametres'
            && $e->canal instanceof PrivateChannel
            && $e->canal->name === 'private-boutique.'.$boutique->ulid
            && $e->auteur === $proprio->ulid
            && $e->broadcastAs() === 'donnees.modifiees'
            && array_keys($e->broadcastWith()) === ['rubrique', 'auteur', 'horodatage'];
    });
    Event::assertDispatchedTimes(DonneesModifiees::class, 1);
});

it('émet « equipe » une seule fois même si plusieurs lignes sont écrites', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    connecte($proprio)->postJson('/api/v1/equipe/invitations', ['contact' => 'a@example.com', 'role' => 'caissier'])->assertCreated();

    Event::assertDispatched(DonneesModifiees::class, fn (DonneesModifiees $e) => $e->rubrique === 'equipe');
    Event::assertDispatchedTimes(DonneesModifiees::class, 1);
});

it('n\'émet rien après une lecture, même en POST', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    Route::post('/api/v1/_test/lecture', fn () => ['n' => Boutique::query()->count()])->middleware(['api', 'auth:sanctum']);

    connecte($proprio)->getJson('/api/v1/boutique')->assertOk();
    $this->getJson('/api/v1/equipe')->assertOk();
    $this->postJson('/api/v1/_test/lecture')->assertOk();

    Event::assertNotDispatched(DonneesModifiees::class);
});

it('n\'émet rien après une écriture technique (journal d\'audit, sessions, cache)', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    Route::post('/api/v1/_test/technique', function () {
        DB::table('journal_audit')->insert(['action' => 'test', 'created_at' => now()]);
        DB::table('cache')->insert(['key' => 'k', 'value' => 'v', 'expiration' => time() + 60]);
        DB::table('sessions')->insert(['id' => 'abc', 'payload' => '', 'last_activity' => time()]);

        return ['ok' => true];
    })->middleware(['api', 'auth:sanctum']);

    connecte($proprio)->postJson('/api/v1/_test/technique')->assertOk();
    expect(JournalAudit::query()->where('action', 'test')->exists())->toBeTrue();

    Event::assertNotDispatched(DonneesModifiees::class);
});

it('n\'émet rien pour un échec de connexion (seul le journal d\'audit est écrit)', function () {
    Event::fake([DonneesModifiees::class]);
    User::factory()->create(['email' => 'awa@example.com']);

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa@example.com', 'password' => 'faux'])->assertStatus(401);

    Event::assertNotDispatched(DonneesModifiees::class);
});

it('n\'émet rien si la transaction est annulée', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');

    Route::post('/api/v1/_test/rollback', function () use ($boutique) {
        try {
            DB::transaction(function () use ($boutique) {
                DB::table('articles')->insert(['ulid' => str_repeat('0', 26), 'boutique_id' => $boutique->id, 'nom' => 'x', 'prix_xof' => 1, 'created_at' => now(), 'updated_at' => now()]);
                throw new RuntimeException('annulé');
            });
        } catch (RuntimeException) {
        }

        return ['ok' => true];
    })->middleware(['api', 'auth:sanctum']);

    connecte($proprio)->postJson('/api/v1/_test/rollback')->assertOk();

    Event::assertNotDispatched(DonneesModifiees::class);
});

it('le service Diffuseur est réutilisable par les jobs et n\'échoue jamais', function () {
    Event::fake([DonneesModifiees::class]);
    $boutique = Boutique::factory()->create();
    $user = User::factory()->create();

    app(Diffuseur::class)->rubrique($boutique, 'paiements');
    app(Diffuseur::class)->utilisateur($user, 'preferences', $user);
    app(Diffuseur::class)->plateforme('audios');
    app(Diffuseur::class)->admin('boutiques');

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-boutique.'.$boutique->ulid && $e->rubrique === 'paiements' && $e->auteur === null);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-user.'.$user->ulid && $e->auteur === $user->ulid);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'plateforme');
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-admin');
});

it('autorise le canal privé de la boutique aux membres actifs seulement', function () {
    // Le pilote « null » des tests n'authentifie rien : on utilise le vrai pilote Reverb (aucun appel réseau pour l'autorisation).
    config()->set('broadcasting.default', 'reverb');
    require base_path('routes/channels.php'); // les canaux sont enregistrés sur le pilote courant : on les rattache au pilote Reverb
    ['user' => $membre, 'boutique' => $boutique] = boutiqueAvec('caissier');
    ['user' => $etranger] = boutiqueAvec('proprietaire');
    ['user' => $inactif, 'membre' => $m] = boutiqueAvec('caissier', $boutique);
    $m->forceFill(['actif' => false])->save();

    $this->post('/broadcasting/auth', ['channel_name' => 'private-boutique.'.$boutique->ulid, 'socket_id' => '1234.5678'])->assertForbidden();
    connecte($membre)->post('/broadcasting/auth', ['channel_name' => 'private-boutique.'.$boutique->ulid, 'socket_id' => '1234.5678'])->assertOk();
    connecte($etranger)->post('/broadcasting/auth', ['channel_name' => 'private-boutique.'.$boutique->ulid, 'socket_id' => '1234.5678'])->assertForbidden();
    connecte($inactif)->post('/broadcasting/auth', ['channel_name' => 'private-boutique.'.$boutique->ulid, 'socket_id' => '1234.5678'])->assertForbidden();

    connecte($membre)->post('/broadcasting/auth', ['channel_name' => 'private-user.'.$membre->ulid, 'socket_id' => '1234.5678'])->assertOk();
    connecte($membre)->post('/broadcasting/auth', ['channel_name' => 'private-user.'.$etranger->ulid, 'socket_id' => '1234.5678'])->assertForbidden();
    connecte($membre)->post('/broadcasting/auth', ['channel_name' => 'private-admin', 'socket_id' => '1234.5678'])->assertForbidden();
    connecte(User::factory()->superAdmin()->create())->post('/broadcasting/auth', ['channel_name' => 'private-admin', 'socket_id' => '1234.5678'])->assertOk();
});

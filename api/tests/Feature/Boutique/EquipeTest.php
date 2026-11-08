<?php

use App\Http\Middleware\VerifierSessionRevoquee;
use App\Models\Invitation;
use App\Models\JournalAudit;
use App\Models\Membre;
use App\Models\User;
use App\Notifications\InvitationEquipe;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;

it('liste l\'équipe pour un propriétaire ou un gérant, jamais pour un caissier', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);

    connecte($proprio)->getJson('/api/v1/equipe')->assertOk()
        ->assertJsonCount(3, 'membres')
        ->assertJsonPath('membres.0.role', 'proprietaire')
        ->assertJsonPath('membres.0.est_moi', true)
        ->assertJsonPath('membres.0.contact', $proprio->email)
        ->assertJsonPath('membres.1.est_moi', false)
        ->assertJsonStructure(['membres' => [['ulid', 'nom', 'contact', 'role', 'actif', 'derniere_connexion_le', 'est_moi']], 'invitations']);

    connecte($gerant)->getJson('/api/v1/equipe')->assertOk();
    connecte($caissier)->getJson('/api/v1/equipe')->assertForbidden();
});

it('invite par e-mail (jeton haché, 72 h, mail) et journalise', function () {
    Notification::fake();
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    $reponse = connecte($proprio)->postJson('/api/v1/equipe/invitations', ['contact' => 'Moussa@Example.com', 'role' => 'caissier'])
        ->assertCreated()
        ->assertJsonPath('invitation.contact', 'moussa@example.com')
        ->assertJsonPath('invitation.role', 'caissier')
        ->assertJsonStructure(['invitation' => ['ulid', 'contact', 'role', 'expire_le']])
        ->assertJsonMissingPath('invitation.lien')
        ->assertJsonMissingPath('invitation.jeton_hash');

    $invitation = Invitation::toutesBoutiques()->first();

    // Visible dans l'équipe (forme du contrat) ; un caissier ne peut pas l'annuler, le propriétaire si (204).
    $this->getJson('/api/v1/equipe')->assertOk()->assertJsonCount(1, 'invitations')
        ->assertJsonPath('invitations.0', ['ulid' => $invitation->ulid, 'contact' => 'moussa@example.com', 'role' => 'caissier', 'expire_le' => $invitation->expire_at->toIso8601String()]);
    expect($invitation->expire_at->diffInHours(now()->addHours(72), true))->toBeLessThan(1)
        ->and(strlen($invitation->jeton_hash))->toBe(64);

    Notification::assertSentTo(new AnonymousNotifiable, InvitationEquipe::class, function (InvitationEquipe $n, array $canaux, AnonymousNotifiable $notifiable) use ($invitation) {
        return $notifiable->routes['mail'] === 'moussa@example.com'
            && Invitation::hacher($n->jeton) === $invitation->jeton_hash
            && str_starts_with(InvitationEquipe::lien($n->jeton), config('satspoint.frontend_url').'/invitation/');
    });

    expect(JournalAudit::query()->where('action', 'equipe.invitation_creee')->first()->details)->toMatchArray(['role' => 'caissier', 'canal' => 'email'])
        ->and(json_encode(JournalAudit::query()->where('action', 'equipe.invitation_creee')->first()->details))->not->toContain('moussa@example.com');
});

it('annule une invitation en attente (propriétaire ou gérant), jamais un caissier', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);

    $invitation = avecBoutique($boutique, function () use ($proprio) {
        $inv = new Invitation(['contact' => 'x@example.com', 'role' => 'caissier', 'expire_at' => now()->addDay()]);
        $inv->forceFill(['jeton_hash' => Invitation::hacher(str_repeat('d', 48)), 'invite_par' => $proprio->id])->save();

        return $inv;
    });

    connecte($caissier)->deleteJson("/api/v1/equipe/invitations/{$invitation->ulid}")->assertForbidden();
    connecte($proprio)->deleteJson("/api/v1/equipe/invitations/{$invitation->ulid}")->assertNoContent();

    expect(Invitation::toutesBoutiques()->count())->toBe(0)
        ->and(JournalAudit::query()->where('action', 'equipe.invitation_annulee')->exists())->toBeTrue();

    connecte($proprio)->deleteJson("/api/v1/equipe/invitations/{$invitation->ulid}")->assertNotFound();
});

it('invite par téléphone : le lien est renvoyé au responsable (pas de SMS en P0)', function () {
    Notification::fake();
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    connecte($proprio)->postJson('/api/v1/equipe/invitations', ['contact' => '77 123 45 67', 'role' => 'gerant'])
        ->assertCreated()
        ->assertJsonPath('invitation.contact', '+221771234567')
        ->assertJsonPath('invitation.lien', fn ($lien) => str_starts_with($lien, config('satspoint.frontend_url').'/invitation/'));

    Notification::assertNothingSent();
});

it('interdit à un gérant d\'inviter un propriétaire, et à un caissier d\'inviter', function () {
    ['user' => $gerant, 'boutique' => $boutique] = boutiqueAvec('gerant');
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);

    connecte($gerant)->postJson('/api/v1/equipe/invitations', ['contact' => 'x@example.com', 'role' => 'proprietaire'])->assertForbidden();
    connecte($gerant)->postJson('/api/v1/equipe/invitations', ['contact' => 'x@example.com', 'role' => 'caissier'])->assertCreated();
    connecte($caissier)->postJson('/api/v1/equipe/invitations', ['contact' => 'y@example.com', 'role' => 'caissier'])->assertForbidden();
    connecte($gerant)->postJson('/api/v1/equipe/invitations', ['contact' => 'x@example.com', 'role' => 'patron'])->assertStatus(422);
});

it('accepte une invitation valide dont le contact correspond au compte connecté', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    $jeton = str_repeat('a', 48);

    avecBoutique($boutique, function () use ($jeton, $proprio) {
        $inv = new Invitation(['contact' => 'moussa@example.com', 'role' => 'caissier', 'expire_at' => now()->addHours(72)]);
        $inv->forceFill(['jeton_hash' => Invitation::hacher($jeton), 'invite_par' => $proprio->id])->save();
    });

    $moussa = User::factory()->create(['email' => 'moussa@example.com']);

    connecte($moussa)->postJson("/api/v1/invitations/{$jeton}/accepter")
        ->assertOk()
        ->assertJsonPath('utilisateur.boutique.ulid', $boutique->ulid)
        ->assertJsonPath('utilisateur.boutique.role', 'caissier');

    expect(Invitation::toutesBoutiques()->first()->acceptee_at)->not->toBeNull();
    expect(Membre::toutesBoutiques()->where('user_id', $moussa->id)->where('boutique_id', $boutique->id)->exists())->toBeTrue();

    // Usage unique.
    connecte($moussa)->postJson("/api/v1/invitations/{$jeton}/accepter")->assertStatus(410);
});

it('refuse une invitation périmée, inconnue ou destinée à un autre contact', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    $perime = str_repeat('b', 48);
    $autre = str_repeat('c', 48);

    avecBoutique($boutique, function () use ($perime, $autre, $proprio) {
        (new Invitation(['contact' => 'moussa@example.com', 'role' => 'caissier', 'expire_at' => now()->subMinute()]))
            ->forceFill(['jeton_hash' => Invitation::hacher($perime), 'invite_par' => $proprio->id])->save();
        (new Invitation(['contact' => 'quelquun-dautre@example.com', 'role' => 'caissier', 'expire_at' => now()->addHour()]))
            ->forceFill(['jeton_hash' => Invitation::hacher($autre), 'invite_par' => $proprio->id])->save();
    });

    // Sans session : 401 (avant toute connexion, car actingAs persiste dans le test).
    $this->postJson("/api/v1/invitations/{$autre}/accepter")->assertStatus(401);

    $moussa = User::factory()->create(['email' => 'moussa@example.com']);

    connecte($moussa)->postJson("/api/v1/invitations/{$perime}/accepter")->assertStatus(410);
    connecte($moussa)->postJson('/api/v1/invitations/'.str_repeat('z', 48).'/accepter')->assertNotFound();
    connecte($moussa)->postJson("/api/v1/invitations/{$autre}/accepter")->assertForbidden();
});

it('change le rôle d\'un membre ; un gérant ne touche pas aux propriétaires ni ne promeut propriétaire', function () {
    ['user' => $proprio, 'boutique' => $boutique, 'membre' => $membreProprio] = boutiqueAvec('proprietaire');
    ['user' => $gerant, 'membre' => $membreGerant] = boutiqueAvec('gerant', $boutique);
    ['membre' => $membreCaissier] = boutiqueAvec('caissier', $boutique);

    connecte($gerant)->patchJson("/api/v1/equipe/{$membreProprio->ulid}", ['role' => 'caissier'])->assertForbidden();
    connecte($gerant)->patchJson("/api/v1/equipe/{$membreCaissier->ulid}", ['role' => 'proprietaire'])->assertForbidden();
    connecte($gerant)->patchJson("/api/v1/equipe/{$membreCaissier->ulid}", ['role' => 'gerant'])->assertOk()->assertJsonPath('membre.role', 'gerant');

    connecte($proprio)->patchJson("/api/v1/equipe/{$membreGerant->ulid}", ['role' => 'proprietaire'])->assertOk()->assertJsonPath('membre.role', 'proprietaire');
    connecte($proprio)->patchJson("/api/v1/equipe/{$membreCaissier->ulid}", [])->assertStatus(422);
    connecte($proprio)->patchJson("/api/v1/equipe/{$membreCaissier->ulid}", ['role' => 'roi'])->assertStatus(422);

    expect(JournalAudit::query()->where('action', 'equipe.membre_modifie')->count())->toBe(2);
});

it('empêche le dernier propriétaire de se rétrograder, de se désactiver ou de partir', function () {
    ['user' => $proprio, 'membre' => $membre] = boutiqueAvec('proprietaire');

    connecte($proprio)->patchJson("/api/v1/equipe/{$membre->ulid}", ['role' => 'gerant'])->assertStatus(409);
    connecte($proprio)->patchJson("/api/v1/equipe/{$membre->ulid}", ['actif' => false])->assertStatus(409);
    connecte($proprio)->deleteJson("/api/v1/equipe/{$membre->ulid}")->assertStatus(409);

    expect($membre->fresh()->role)->toBe('proprietaire')->and($membre->fresh()->actif)->toBeTrue();
});

it('désactive un membre : accès coupé immédiatement, sessions révoquées, journal', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $caissier, 'membre' => $membreCaissier] = boutiqueAvec('caissier', $boutique);

    // Le caissier a une session ouverte (empreinte « jamais révoqué »).
    connecte($caissier)->withSession([VerifierSessionRevoquee::CLE_SESSION => '0'])->getJson('/api/v1/boutique')->assertOk();

    connecte($proprio)->patchJson("/api/v1/equipe/{$membreCaissier->ulid}", ['actif' => false])->assertOk()->assertJsonPath('membre.actif', false);

    expect($caissier->fresh()->sessions_revoquees_at)->not->toBeNull();
    expect(JournalAudit::query()->where('action', 'equipe.membre_desactive')->exists())->toBeTrue();

    connecte($caissier->fresh())->withSession([VerifierSessionRevoquee::CLE_SESSION => '0'])
        ->getJson('/api/v1/boutique')->assertStatus(401)->assertJsonPath('code', 'SESSION_REVOQUEE');
});

it('retire un membre (204) et révoque ses sessions', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $gerant, 'membre' => $membreGerant] = boutiqueAvec('gerant', $boutique);

    connecte($proprio)->deleteJson("/api/v1/equipe/{$membreGerant->ulid}")->assertNoContent();

    expect(Membre::toutesBoutiques()->whereKey($membreGerant->id)->exists())->toBeFalse()
        ->and($gerant->fresh()->sessions_revoquees_at)->not->toBeNull()
        ->and(JournalAudit::query()->where('action', 'equipe.membre_retire')->exists())->toBeTrue();
});

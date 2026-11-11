<?php

use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\Membre;
use App\Models\User;

it('crée une boutique et rend l\'utilisateur propriétaire', function () {
    $user = User::factory()->create();

    connecte($user)->postJson('/api/v1/boutique', ['nom' => 'Chez Awa', 'ville' => 'Dakar', 'telephone' => '77 123 45 67'])
        ->assertCreated()
        ->assertJsonPath('boutique.nom', 'Chez Awa')
        ->assertJsonPath('boutique.telephone', '+221771234567')
        ->assertJsonPath('boutique.devise', 'XOF')
        ->assertJsonPath('boutique.fuseau', 'Africa/Dakar')
        ->assertJsonPath('boutique.statut', 'active')
        ->assertJsonPath('boutique.mon_role', 'proprietaire')
        ->assertJsonPath('boutique.reglages', ['expiration_facture_min' => 5, 'montant_max_xof' => 2000000, 'moyens' => ['lightning' => true, 'paytech' => false, 'wave_manuel' => false], 'message_recu' => null, 'wave_lien' => null])
        ->assertJsonPath('boutique.configuration', ['wallet' => false, 'paytech' => false, 'paiement_test' => false])
        ->assertJsonPath('boutique.paytech', ['configure' => false, 'environnement' => 'test'])
        ->assertJsonMissingPath('boutique.reglages.paiement_test')
        // CONTRAT_API § 8 : la nouvelle forme de GET /moi est renvoyée avec la boutique.
        ->assertJsonPath('utilisateur.ulid', $user->ulid)
        ->assertJsonPath('utilisateur.boutique.role', 'proprietaire')
        ->assertJsonPath('utilisateur.boutique.nom', 'Chez Awa');

    expect(Membre::toutesBoutiques()->where('user_id', $user->id)->where('role', 'proprietaire')->exists())->toBeTrue();
    expect(JournalAudit::query()->where('action', 'boutique.creee')->exists())->toBeTrue();

    $this->getJson('/api/v1/moi')->assertJsonPath('utilisateur.boutique.role', 'proprietaire');

    // Une seule boutique par compte (P0).
    $this->postJson('/api/v1/boutique', ['nom' => 'Autre', 'ville' => 'Thiès'])->assertForbidden();
});

it('valide la création', function () {
    connecte(User::factory()->create())->postJson('/api/v1/boutique', ['nom' => 'A', 'ville' => '', 'telephone' => 'abc'])
        ->assertStatus(422)->assertJsonValidationErrors(['nom', 'ville', 'telephone']);
});

it('renvoie 404 BOUTIQUE_ABSENTE à un utilisateur sans boutique', function () {
    connecte(User::factory()->create())->getJson('/api/v1/boutique')->assertNotFound()->assertJsonPath('code', 'BOUTIQUE_ABSENTE');
});

it('lit la boutique pour tout membre actif', function () {
    ['user' => $caissier, 'boutique' => $boutique] = boutiqueAvec('caissier');

    connecte($caissier)->getJson('/api/v1/boutique')->assertOk()->assertJsonPath('boutique.ulid', $boutique->ulid)->assertJsonPath('boutique.mon_role', 'caissier');
});

it('refuse un membre désactivé', function () {
    ['user' => $user, 'membre' => $membre] = boutiqueAvec('gerant');
    $membre->forceFill(['actif' => false])->save();

    connecte($user)->getJson('/api/v1/boutique')->assertNotFound()->assertJsonPath('code', 'BOUTIQUE_ABSENTE');
});

it('modifie les réglages dans les bornes (propriétaire et gérant) et journalise', function (string $role) {
    ['user' => $user] = boutiqueAvec($role);

    connecte($user)->patchJson('/api/v1/boutique', [
        'nom' => 'Nouveau nom',
        'reglages' => ['expiration_facture_min' => 10, 'montant_max_xof' => 500000, 'moyens' => ['wave_manuel' => true], 'message_recu' => 'Merci !', 'wave_lien' => 'https://pay.wave.com/m/M_abc123/c/sn/'],
    ])->assertOk()
        ->assertJsonPath('boutique.nom', 'Nouveau nom')
        ->assertJsonPath('boutique.reglages', ['expiration_facture_min' => 10, 'montant_max_xof' => 500000, 'moyens' => ['lightning' => true, 'paytech' => false, 'wave_manuel' => true], 'message_recu' => 'Merci !', 'wave_lien' => 'https://pay.wave.com/m/M_abc123/c/sn/']);

    // Champ partiel : marquer le démarrage terminé.
    $this->patchJson('/api/v1/boutique', ['paiement_test' => true])->assertOk()->assertJsonPath('boutique.configuration.paiement_test', true);

    $journal = JournalAudit::query()->where('action', 'boutique.reglages_modifies')->first();
    expect($journal)->not->toBeNull()->and($journal->details['apres']['reglages']['expiration_facture_min'])->toBe(10);
})->with(['proprietaire', 'gerant']);

it('refuse les réglages hors bornes', function (array $reglages, string $champ) {
    ['user' => $user] = boutiqueAvec('proprietaire');

    connecte($user)->patchJson('/api/v1/boutique', ['reglages' => $reglages])->assertStatus(422)->assertJsonValidationErrors([$champ]);
})->with([
    [['expiration_facture_min' => 1], 'reglages.expiration_facture_min'],
    [['expiration_facture_min' => 16], 'reglages.expiration_facture_min'],
    [['montant_max_xof' => 99], 'reglages.montant_max_xof'],
    [['montant_max_xof' => 50000001], 'reglages.montant_max_xof'],
    [['moyens' => ['bitcoin_on_chain' => true]], 'reglages.moyens'],
    [['moyens' => ['lightning' => false]], 'reglages.moyens'],
    [['moyens' => ['lightning' => 'oui']], 'reglages.moyens.lightning'],
    [['message_recu' => str_repeat('a', 201)], 'reglages.message_recu'],
    [['wave_lien' => 'http://pay.wave.com/x'], 'reglages.wave_lien'],
    [['wave_lien' => 'https://evil.example/pay.wave.com'], 'reglages.wave_lien'],
    [['inconnu' => 1], 'reglages'],
]);

it('interdit la modification à un caissier (403)', function () {
    ['user' => $caissier] = boutiqueAvec('caissier');

    connecte($caissier)->patchJson('/api/v1/boutique', ['nom' => 'Pirate'])->assertForbidden()->assertJsonPath('code', 'INTERDIT');
});

it('interdit au super-admin l\'accès aux données d\'une boutique', function () {
    $admin = User::factory()->superAdmin()->create();
    Boutique::factory()->create();

    connecte($admin)->getJson('/api/v1/boutique')->assertNotFound();
});

it('le super-admin peut créer SA boutique et n\'accède toujours qu\'à elle', function () {
    $admin = User::factory()->superAdmin()->create();
    $autre = Boutique::factory()->create();

    connecte($admin)->postJson('/api/v1/boutique', ['nom' => 'Boutique de la plateforme', 'ville' => 'Dakar'])
        ->assertCreated()
        ->assertJsonPath('boutique.mon_role', 'proprietaire')
        ->assertJsonPath('utilisateur.role_plateforme', 'super_admin');

    // Même processus de test : la ressource garde « wasRecentlyCreated » (201) ; seul le contenu compte ici.
    $this->getJson('/api/v1/boutique')->assertSuccessful()->assertJsonPath('boutique.nom', 'Boutique de la plateforme');
    expect($this->getJson('/api/v1/boutique')->json('boutique.ulid'))->not->toBe($autre->ulid);
    // Une seule boutique par compte, super-admin compris.
    $this->postJson('/api/v1/boutique', ['nom' => 'Deuxième', 'ville' => 'Thiès'])->assertForbidden();
});

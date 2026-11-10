<?php

use App\Events\DonneesModifiees;
use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\MoyenPaiementBoutique;
use App\Models\Paiement;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Support\Facades\Event;

/*
|--------------------------------------------------------------------------
| Moyens de paiement du pays côté boutique (CONTRAT_API § 14.3 et 14.4) : configuration (propriétaire / gérant),
| anti-IDOR (moyen d'un autre pays), cloisonnement, pays de la boutique, caisse et confirmation manuelle.
|--------------------------------------------------------------------------
*/

it('liste les moyens du pays de la boutique, les active avec un numéro validé et normalisé (audit sans la valeur)', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    $boutique->forceFill(['pays' => 'CI'])->save();
    $om = moyenCatalogue('CI', 'Orange Money');

    connecte($proprio)->getJson('/api/v1/boutique/moyens-pays')->assertOk()
        ->assertJsonPath('pays', 'CI')
        ->assertJsonCount(4, 'moyens')
        ->assertJsonPath('moyens.1', [
            'ulid' => $om->ulid, 'nom' => 'Orange Money', 'type' => 'numero', 'couleur' => 'orange',
            'instructions_fr' => $om->instructions_fr, 'instructions_en' => $om->instructions_en, 'active' => false, 'valeur' => null,
        ]);

    // Activer sans numéro : refusé.
    $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true])->assertStatus(422)->assertJsonValidationErrors(['valeur']);
    // Numéros invalides.
    foreach (['abc', '12', '+0123456789', '+22507 0102 0304 0506 07', '<script>'] as $faux) {
        $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => $faux])->assertStatus(422)->assertJsonValidationErrors(['valeur']);
    }

    Event::fake([DonneesModifiees::class]);
    $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '+225 07.01-02 03 04'])->assertOk()
        ->assertJsonPath('moyen.active', true)->assertJsonPath('moyen.valeur', '+2250701020304');
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'parametres' && $e->canal->name === 'private-boutique.'.$boutique->ulid);

    // Code marchand court accepté ; GET /boutique expose les moyens ACTIVÉS seulement.
    $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '458712'])->assertOk()->assertJsonPath('moyen.valeur', '458712');
    $this->getJson('/api/v1/boutique')->assertOk()->assertJsonPath('boutique.pays', 'CI')
        ->assertJsonCount(1, 'boutique.moyens_pays')->assertJsonPath('boutique.moyens_pays.0.nom', 'Orange Money')->assertJsonPath('boutique.moyens_pays.0.valeur', '458712');

    $journal = JournalAudit::query()->where('action', 'boutique.moyen_pays_modifie')->latest('id')->first();
    expect($journal->details)->toBe(['moyen' => $om->ulid, 'nom' => 'Orange Money', 'active' => true, 'valeur_modifiee' => true])
        ->and(json_encode($journal->details))->not->toContain('458712');

    // Désactiver garde le numéro ; la caisse ne le propose plus.
    $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => false])->assertOk()->assertJsonPath('moyen.valeur', '458712');
    $this->getJson('/api/v1/boutique')->assertJsonCount(0, 'boutique.moyens_pays');
});

it('valide un lien marchand https pour un moyen de type lien', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    $boutique->forceFill(['pays' => 'CI'])->save();
    $wave = moyenCatalogue('CI', 'Wave');

    connecte($proprio);
    foreach (['http://pay.wave.com/m/M_ci', 'javascript:alert(1)', 'pay.wave.com/m/x', 'https://exemple.com/a b'] as $faux) {
        $this->putJson("/api/v1/boutique/moyens-pays/{$wave->ulid}", ['active' => true, 'valeur' => $faux])->assertStatus(422)->assertJsonValidationErrors(['valeur']);
    }
    $this->putJson("/api/v1/boutique/moyens-pays/{$wave->ulid}", ['active' => true, 'valeur' => 'https://pay.wave.com/m/M_ci_test/c/ci/'])->assertOk()
        ->assertJsonPath('moyen.valeur', 'https://pay.wave.com/m/M_ci_test/c/ci/');
});

it('anti-IDOR : un moyen d\'un autre pays, inactif ou inconnu donne le même 404, quel que soit le corps', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire'); // SN
    $omCi = moyenCatalogue('CI', 'Orange Money');
    $flooz = moyenCatalogue('TG', 'Flooz');

    connecte($proprio);
    $this->putJson("/api/v1/boutique/moyens-pays/{$omCi->ulid}", ['active' => true, 'valeur' => '+2250701020304'])->assertNotFound()->assertJsonPath('code', 'INTROUVABLE');
    $this->putJson("/api/v1/boutique/moyens-pays/{$flooz->ulid}", [])->assertNotFound();
    $this->putJson('/api/v1/boutique/moyens-pays/01ARZ3NDEKTSV4RRFFQ69G5FAV', ['active' => true])->assertNotFound();
    $this->getJson('/api/v1/boutique/moyens-pays')->assertOk()->assertJsonPath('pays', 'SN')->assertJsonCount(0, 'moyens');

    // Inactif au catalogue : introuvable aussi pour une boutique du bon pays.
    $boutique->forceFill(['pays' => 'CI'])->save();
    $omCi->update(['actif' => false]);
    connecte($proprio)->putJson("/api/v1/boutique/moyens-pays/{$omCi->ulid}", ['active' => true, 'valeur' => '+2250701020304'])->assertNotFound();

    expect(MoyenPaiementBoutique::toutesBoutiques()->count())->toBe(0);
});

it('réserve la configuration au propriétaire et au gérant ; isole chaque boutique', function () {
    ['boutique' => $a, 'user' => $proprioA] = boutiqueAvec('proprietaire');
    ['user' => $gerantA] = boutiqueAvec('gerant', $a);
    ['user' => $caissierA] = boutiqueAvec('caissier', $a);
    ['boutique' => $b, 'user' => $proprioB] = boutiqueAvec('proprietaire');
    $a->forceFill(['pays' => 'ML'])->save();
    $b->forceFill(['pays' => 'ML'])->save();
    $om = moyenCatalogue('ML', 'Orange Money');

    connecte($caissierA)->getJson('/api/v1/boutique/moyens-pays')->assertForbidden();
    connecte($caissierA)->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '+22370000000'])->assertForbidden();

    connecte($gerantA)->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '+22370000000'])->assertOk();

    // La boutique B (même pays) ne voit pas la configuration de A et a la sienne.
    connecte($proprioB)->getJson('/api/v1/boutique/moyens-pays')->assertOk()->assertJsonPath('moyens.0.nom', 'Orange Money')
        ->assertJsonPath('moyens.0.active', false)->assertJsonPath('moyens.0.valeur', null);
    $this->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '+22376543210'])->assertOk();

    expect(MoyenPaiementBoutique::pourBoutique($a)->value('valeur'))->toBe('+22370000000')
        ->and(MoyenPaiementBoutique::pourBoutique($b)->value('valeur'))->toBe('+22376543210');
    connecte($proprioA)->getJson('/api/v1/boutique')->assertJsonPath('boutique.moyens_pays.0.valeur', '+22370000000');
});

it('change le pays de la boutique (propriétaire seulement) et désactive les moyens de l\'ancien pays', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);
    activerMoyenPays($boutique, moyenCatalogue('CI', 'Orange Money'));

    connecte($gerant)->patchJson('/api/v1/boutique', ['pays' => 'BJ'])->assertForbidden();
    connecte($proprio)->patchJson('/api/v1/boutique', ['pays' => 'FR'])->assertStatus(422)->assertJsonValidationErrors(['pays']);

    connecte($proprio)->patchJson('/api/v1/boutique', ['pays' => 'BJ'])->assertOk()->assertJsonPath('boutique.pays', 'BJ')->assertJsonCount(0, 'boutique.moyens_pays');

    expect($boutique->fresh()->pays)->toBe('BJ')
        ->and(MoyenPaiementBoutique::pourBoutique($boutique)->value('active'))->toBeFalse()
        ->and(MoyenPaiementBoutique::pourBoutique($boutique)->value('valeur'))->toBe('+2250701020304')
        ->and(JournalAudit::query()->where('action', 'boutique.pays_modifie')->sole()->details)->toBe(['avant' => 'CI', 'apres' => 'BJ']);

    // Le gérant garde la main sur le reste des réglages.
    connecte($gerant)->patchJson('/api/v1/boutique', ['nom' => 'Cotonou Shop'])->assertOk();
});

it('crée une boutique dans le pays choisi au démarrage guidé (SN par défaut)', function () {
    $u1 = User::factory()->create();
    connecte($u1)->postJson('/api/v1/boutique', ['nom' => 'Dakar Shop', 'ville' => 'Dakar'])->assertCreated()->assertJsonPath('boutique.pays', 'SN');

    $u2 = User::factory()->create();
    connecte($u2)->postJson('/api/v1/boutique', ['nom' => 'Lomé Shop', 'ville' => 'Lomé', 'pays' => 'TG'])->assertCreated()->assertJsonPath('boutique.pays', 'TG');
    expect(Boutique::query()->where('nom', 'Lomé Shop')->value('pays'))->toBe('TG');
});

it('encaisse avec un moyen du pays : photographie, aucune expiration, confirmation manuelle, reçu et statistiques', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);
    $om = moyenCatalogue('CI', 'Orange Money');
    activerMoyenPays($boutique, $om, '+2250701020304');

    // Moyen absent : refusé.
    connecte($caissier)->postJson('/api/v1/ventes', ['montant_xof' => 2500, 'methode' => 'moyen_pays'])->assertStatus(422)->assertJsonValidationErrors(['moyen']);

    $r = connecte($caissier)->postJson('/api/v1/ventes', ['montant_xof' => 2500, 'methode' => 'moyen_pays', 'moyen' => $om->ulid])->assertCreated()
        ->assertJsonPath('vente.paiements.0.methode', 'moyen_pays')
        ->assertJsonPath('vente.paiements.0.operateur', null)
        ->assertJsonPath('vente.paiements.0.expire_le', null)
        ->assertJsonPath('vente.paiements.0.simule', false)
        ->assertJsonPath('vente.paiements.0.moyen', [
            'ulid' => $om->ulid, 'nom' => 'Orange Money', 'type' => 'numero', 'couleur' => 'orange', 'valeur' => '+2250701020304',
            'instructions_fr' => $om->instructions_fr, 'instructions_en' => $om->instructions_en,
        ]);
    $paiementUlid = $r->json('vente.paiements.0.ulid');
    $venteUlid = $r->json('vente.ulid');

    // Photographie : changer le numéro ensuite ne modifie pas la tentative en cours.
    connecte($proprio)->putJson("/api/v1/boutique/moyens-pays/{$om->ulid}", ['active' => true, 'valeur' => '+2250799999999'])->assertOk();
    $this->getJson("/api/v1/paiements/{$paiementUlid}")->assertOk()->assertJsonPath('paiement.moyen.valeur', '+2250701020304');

    // Jamais expirée automatiquement.
    $this->travel(2)->hours();
    $this->artisan('paiements:expirer')->assertSuccessful();
    expect(Paiement::toutesBoutiques()->where('ulid', $paiementUlid)->value('statut'))->toBe('en_attente');

    // Confirmation : caissier refusé, simulation impossible, propriétaire accepté.
    connecte($caissier)->postJson("/api/v1/paiements/{$paiementUlid}/confirmer-manuellement", ['confirmation' => true])->assertForbidden();
    connecte($caissier)->postJson("/api/v1/paiements/{$paiementUlid}/simuler")->assertNotFound();
    connecte($proprio)->postJson("/api/v1/paiements/{$paiementUlid}/confirmer-manuellement", [])->assertStatus(422);
    connecte($proprio)->postJson("/api/v1/paiements/{$paiementUlid}/confirmer-manuellement", ['confirmation' => true])->assertOk()
        ->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('paiement.operateur', null)->assertJsonPath('vente.statut', 'payee');

    $journal = JournalAudit::query()->where('action', 'paiement.confirme_manuellement')->sole();
    expect($journal->details['methode'])->toBe('moyen_pays')->and($journal->details['moyen'])->toBe('Orange Money');

    // Liste et filtre des ventes, nom du moyen.
    $this->getJson('/api/v1/ventes?periode=7j&methode=moyen_pays')->assertOk()->assertJsonCount(1, 'ventes')
        ->assertJsonPath('ventes.0.methode_reussie', 'moyen_pays')->assertJsonPath('ventes.0.moyen_reussi', 'Orange Money');

    // Reçu public : nom du moyen.
    $jeton = Vente::toutesBoutiques()->where('ulid', $venteUlid)->value('recu_jeton');
    $this->getJson("/r/{$jeton}")->assertOk()->assertJsonPath('methode', 'moyen_pays')->assertJsonPath('moyen', 'Orange Money');

    // Tableau de bord : rangé dans « mobile money ».
    $this->getJson('/api/v1/tableau-de-bord?periode=7j')->assertOk()
        ->assertJsonPath('repartition.mobile_money', ['nombre' => 1, 'montant_xof' => 2500])
        ->assertJsonPath('repartition.lightning.nombre', 0);
});

it('refuse MOYEN_INACTIF pour un moyen non activé, désactivé, d\'un autre pays ou inactif au catalogue (rien n\'est créé)', function () {
    coursDisponible();
    passerelleFake();
    ['boutique' => $boutique, 'user' => $proprio] = boutiquePrete();
    $omCi = moyenCatalogue('CI', 'Orange Money');
    $mtnCi = moyenCatalogue('CI', 'MTN MoMo');
    $omMl = moyenCatalogue('ML', 'Orange Money');
    activerMoyenPays($boutique, $omCi);
    avecBoutique($boutique, fn () => MoyenPaiementBoutique::create(['moyen_paiement_id' => $mtnCi->id, 'valeur' => '+2250500000000', 'active' => false]));

    connecte($proprio);
    foreach ([$mtnCi->ulid, $omMl->ulid, '01ARZ3NDEKTSV4RRFFQ69G5FAV'] as $ulid) {
        $this->postJson('/api/v1/ventes', ['montant_xof' => 1000, 'methode' => 'moyen_pays', 'moyen' => $ulid])->assertStatus(409)->assertJsonPath('code', 'MOYEN_INACTIF');
    }

    $omCi->update(['actif' => false]);
    $this->postJson('/api/v1/ventes', ['montant_xof' => 1000, 'methode' => 'moyen_pays', 'moyen' => $omCi->ulid])->assertStatus(409)->assertJsonPath('code', 'MOYEN_INACTIF');

    expect(Vente::pourBoutique($boutique)->count())->toBe(0);

    // Nouvelle tentative sur une vente existante avec un moyen du pays (après réactivation au catalogue).
    $omCi->update(['actif' => true]);
    ['vente' => $vente] = venteAvecTentative($boutique, $proprio, 'wave_manuel');
    connecte($proprio)->postJson("/api/v1/ventes/{$vente->ulid}/paiements", ['methode' => 'moyen_pays', 'moyen' => $omCi->ulid])->assertCreated()
        ->assertJsonPath('paiement.methode', 'moyen_pays')->assertJsonPath('paiement.moyen.nom', 'Orange Money');
    $this->postJson("/api/v1/ventes/{$vente->ulid}/paiements", ['methode' => 'moyen_pays', 'moyen' => $omMl->ulid])->assertStatus(409)->assertJsonPath('code', 'MOYEN_INACTIF');
});

<?php

use App\Events\DonneesModifiees;
use App\Models\Audio;
use App\Models\Boutique;
use App\Models\CleAudio;
use App\Models\JournalAudit;
use App\Models\Langue;
use App\Models\MoyenPaiement;
use App\Models\Pays;
use App\Models\User;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Event;

/*
|--------------------------------------------------------------------------
| Catalogues de la plateforme (CONTRAT_API § 14) : graines, lecture publique, console super-admin
| (pays, langues, moyens de paiement), droits, validation, journal d'audit, signal temps réel.
|--------------------------------------------------------------------------
*/

it('insère les graines : 8 pays XOF (SN d\'abord), 5 langues, moyens par pays, aucun pour SN ; boutiques existantes en SN', function () {
    expect(Pays::query()->orderBy('ordre')->pluck('code')->all())->toBe(['SN', 'BJ', 'BF', 'CI', 'GW', 'ML', 'NE', 'TG'])
        ->and(Pays::query()->where('devise', '!=', 'XOF')->count())->toBe(0)
        ->and(Langue::query()->orderBy('ordre')->pluck('code')->all())->toBe(['wo', 'srr', 'ff', 'dyo', 'fr'])
        ->and(Langue::query()->where('code', 'fr')->first()->pays)->toBe([])
        ->and(Langue::query()->where('code', 'wo')->first()->pays)->toBe(['SN']);

    $parPays = MoyenPaiement::query()->get()->groupBy('pays')->map->count()->all();
    expect($parPays)->toMatchArray(['CI' => 4, 'ML' => 3, 'BF' => 2, 'NE' => 2, 'TG' => 2, 'BJ' => 2, 'GW' => 2])
        ->and(array_key_exists('SN', $parPays))->toBeFalse()
        ->and(moyenCatalogue('CI', 'Wave')->type)->toBe('lien')
        ->and(moyenCatalogue('CI', 'Orange Money')->type)->toBe('numero')
        ->and(MoyenPaiement::query()->whereNotIn('couleur', MoyenPaiement::COULEURS)->count())->toBe(0);

    $boutique = Boutique::factory()->create();
    expect($boutique->fresh()->pays)->toBe('SN');
});

it('expose dans /config les pays et langues actifs seulement, et le relit après une modification', function () {
    $r = $this->getJson('/api/v1/config')->assertOk();
    expect(array_column($r->json('langues'), 'code'))->toBe(['wo', 'srr', 'ff', 'dyo', 'fr'])
        ->and(array_keys($r->json('langues.0')))->toBe(['code', 'nom_local', 'nom_fr', 'nom_en', 'pays', 'ordre'])
        ->and(array_keys($r->json('pays.0')))->toBe(['code', 'nom_fr', 'nom_en', 'indicatif']);

    Langue::query()->where('code', 'dyo')->first()->update(['actif' => false]);
    Pays::query()->find('GW')->update(['actif' => false]);

    $r = $this->getJson('/api/v1/config')->assertOk();
    expect(array_column($r->json('langues'), 'code'))->toBe(['wo', 'srr', 'ff', 'fr'])
        ->and(array_column($r->json('langues_audio'), 'code'))->toBe(['wo', 'srr', 'ff', 'fr'])
        ->and(array_column($r->json('pays'), 'code'))->not->toContain('GW');
});

it('réserve chaque route de catalogue au super-admin avec 2FA vérifiée (403 avant toute validation)', function () {
    ['user' => $proprio] = boutiqueAvec('proprietaire');
    ['user' => $caissier] = boutiqueAvec('caissier');
    $moyen = moyenCatalogue();

    $appels = [
        ['get', '/api/v1/admin/pays'],
        ['patch', '/api/v1/admin/pays/CI'],
        ['get', '/api/v1/admin/langues'],
        ['post', '/api/v1/admin/langues'],
        ['patch', '/api/v1/admin/langues/wo'],
        ['delete', '/api/v1/admin/langues/dyo'],
        ['get', '/api/v1/admin/moyens-paiement'],
        ['post', '/api/v1/admin/moyens-paiement'],
        ['patch', "/api/v1/admin/moyens-paiement/{$moyen->ulid}"],
        ['delete', "/api/v1/admin/moyens-paiement/{$moyen->ulid}"],
    ];

    // Sans session d'abord (aucun utilisateur connecté dans ce test à ce stade).
    foreach ($appels as [$methode, $uri]) {
        $this->json($methode, $uri, ['actif' => false])->assertUnauthorized();
    }

    foreach ([$proprio, $caissier] as $membre) {
        foreach ($appels as [$methode, $uri]) {
            connecte($membre)->json($methode, $uri, ['actif' => false])->assertForbidden()->assertJsonPath('code', 'INTERDIT');
        }
    }

    // Super-admin sans 2FA vérifiée dans la session.
    $admin = User::factory()->superAdmin()->create();
    $admin->forceFill(['two_factor_secret' => 'JBSWY3DPEHPK3PXP', 'two_factor_confirmed_at' => now()])->save();
    foreach ($appels as [$methode, $uri]) {
        connecte($admin)->json($methode, $uri, ['actif' => false])->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');
    }

    expect(Langue::query()->where('code', 'dyo')->exists())->toBeTrue()
        ->and(MoyenPaiement::query()->whereKey($moyen->id)->value('actif'))->toBeTrue()
        ->and(Pays::query()->find('CI')->actif)->toBeTrue();
});

it('liste et modifie les pays ; le Sénégal ne se désactive pas ; journal plateforme.pays_modifie', function () {
    adminConsole();
    Boutique::factory()->count(2)->create();

    $r = $this->getJson('/api/v1/admin/pays')->assertOk()->assertJsonCount(8, 'pays');
    expect($r->json('pays.0'))->toBe(['code' => 'SN', 'nom_fr' => 'Sénégal', 'nom_en' => 'Senegal', 'indicatif' => '+221', 'devise' => 'XOF', 'actif' => true, 'ordre' => 1, 'boutiques' => 2]);

    $this->patchJson('/api/v1/admin/pays/SN', ['actif' => false])->assertStatus(409)->assertJsonPath('code', 'PAYS_PROTEGE');
    $this->patchJson('/api/v1/admin/pays/CI', ['indicatif' => '+1'])->assertStatus(422);
    $this->patchJson('/api/v1/admin/pays/XX', ['actif' => false])->assertNotFound();
    $this->patchJson('/api/v1/admin/pays/ci', ['actif' => false])->assertNotFound(); // motif de route : majuscules

    $this->patchJson('/api/v1/admin/pays/CI', ['actif' => false, 'nom_en' => 'Ivory Coast'])->assertOk()
        ->assertJsonPath('pays.actif', false)->assertJsonPath('pays.nom_en', 'Ivory Coast')->assertJsonPath('pays.boutiques', 0);

    $journal = JournalAudit::query()->where('action', 'plateforme.pays_modifie')->sole();
    expect($journal->details['pays'])->toBe('CI')->and(array_keys($journal->details['changements']))->toEqualCanonicalizing(['actif', 'nom_en']);

    // Un pays désactivé n'est plus proposé à la création de boutique.
    $sansBoutique = User::factory()->create();
    connecte($sansBoutique)->postJson('/api/v1/boutique', ['nom' => 'Abidjan Shop', 'ville' => 'Abidjan', 'pays' => 'CI'])->assertStatus(422)->assertJsonValidationErrors(['pays']);
});

it('crée une langue (clé vocale langue.{code}, audit, signal catalogues public), la modifie, la désactive', function () {
    $admin = adminConsole();
    Event::fake([DonneesModifiees::class]);

    $this->postJson('/api/v1/admin/langues', ['code' => 'bm', 'nom_local' => 'Bamanankan', 'nom_fr' => 'Bambara', 'nom_en' => 'Bambara', 'pays' => ['ML', 'BF']])
        ->assertCreated()
        ->assertJsonPath('langue', ['code' => 'bm', 'nom_local' => 'Bamanankan', 'nom_fr' => 'Bambara', 'nom_en' => 'Bambara', 'pays' => ['ML', 'BF'], 'ordre' => 5, 'actif' => true, 'audios_publies' => 0]);

    $cle = CleAudio::query()->where('cle', 'langue.bm')->sole();
    expect($cle->ecran)->toBe('langue')->and($cle->essentielle)->toBeTrue()->and($cle->presente_dans_code)->toBeTrue()
        ->and($cle->texte_fr)->toBe('Bambara');

    expect(JournalAudit::query()->where('action', 'plateforme.langue_creee')->sole()->details['code'])->toBe('bm');

    Event::assertDispatched(DonneesModifiees::class, fn (DonneesModifiees $e) => $e->rubrique === 'catalogues'
        && $e->canal instanceof Channel && ! $e->canal instanceof PrivateChannel && $e->canal->name === 'plateforme'
        && $e->auteur === $admin->ulid);

    // Visible publiquement, puis modifiée et désactivée.
    expect(array_column($this->getJson('/api/v1/config')->json('langues'), 'code'))->toContain('bm');

    $this->patchJson('/api/v1/admin/langues/bm', ['nom_local' => 'Bamanankan kan', 'pays' => ['ML'], 'actif' => false])->assertOk()
        ->assertJsonPath('langue.pays', ['ML'])->assertJsonPath('langue.actif', false);
    $this->patchJson('/api/v1/admin/langues/bm', ['code' => 'xx'])->assertStatus(422)->assertJsonValidationErrors(['code']);

    expect(array_column($this->getJson('/api/v1/config')->json('langues'), 'code'))->not->toContain('bm')
        ->and(JournalAudit::query()->where('action', 'plateforme.langue_modifiee')->count())->toBe(1);
});

it('valide strictement les langues : code, noms, pays, doublon', function () {
    adminConsole();
    $base = ['nom_local' => 'Mooré', 'nom_fr' => 'Mooré', 'nom_en' => 'Mossi', 'pays' => ['BF']];

    foreach (['M', 'mossilangue', 'mo_s', '../x', 'MOS', 'ab-cdef', 'é'] as $code) {
        $this->postJson('/api/v1/admin/langues', ['code' => $code] + $base)->assertStatus(422)->assertJsonValidationErrors(['code']);
    }
    $this->postJson('/api/v1/admin/langues', ['code' => 'wo'] + $base)->assertStatus(422)->assertJsonValidationErrors(['code']);
    $this->postJson('/api/v1/admin/langues', ['code' => 'mos', 'nom_fr' => '<b>Mooré</b>'] + $base)->assertStatus(422)->assertJsonValidationErrors(['nom_fr']);
    $this->postJson('/api/v1/admin/langues', ['code' => 'mos', 'pays' => ['FR']] + $base)->assertStatus(422)->assertJsonValidationErrors(['pays.0']);
    $this->postJson('/api/v1/admin/langues', ['code' => 'mos', 'pays' => ['BF', 'BF']] + $base)->assertStatus(422);
    $this->postJson('/api/v1/admin/langues', ['code' => 'mos', 'ordre' => 1000] + $base)->assertStatus(422)->assertJsonValidationErrors(['ordre']);

    $this->postJson('/api/v1/admin/langues', ['code' => 'ff-ml'] + $base)->assertCreated();
    expect(Langue::query()->where('code', 'ff-ml')->exists())->toBeTrue();
});

it('protège le français et refuse de supprimer une langue qui a des audios (LANGUE_PROTEGEE, LANGUE_UTILISEE)', function () {
    adminConsole();

    $this->patchJson('/api/v1/admin/langues/fr', ['actif' => false])->assertStatus(409)->assertJsonPath('code', 'LANGUE_PROTEGEE');
    $this->deleteJson('/api/v1/admin/langues/fr')->assertStatus(409)->assertJsonPath('code', 'LANGUE_PROTEGEE');

    $cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']);
    Audio::create(['cle_audio_id' => $cle->id, 'langue' => 'srr', 'chemin' => 'audio/srr/caisse.encaisser.aaaaaaaa.mp3', 'empreinte' => str_repeat('a', 64), 'statut' => 'brouillon']);
    $this->deleteJson('/api/v1/admin/langues/srr')->assertStatus(409)->assertJsonPath('code', 'LANGUE_UTILISEE');

    // Sans audio : suppression possible ; la clé vocale du nom est conservée mais signalée « retirée ».
    $this->postJson('/api/v1/admin/langues', ['code' => 'dyu', 'nom_local' => 'Julakan', 'nom_fr' => 'Dioula', 'nom_en' => 'Dyula', 'pays' => ['CI', 'BF']])->assertCreated();
    $this->deleteJson('/api/v1/admin/langues/dyu')->assertNoContent();
    expect(Langue::query()->where('code', 'dyu')->exists())->toBeFalse()
        ->and(CleAudio::query()->where('cle', 'langue.dyu')->value('presente_dans_code'))->toBeFalse()
        ->and(JournalAudit::query()->where('action', 'plateforme.langue_supprimee')->count())->toBe(1);
    $this->deleteJson('/api/v1/admin/langues/dyu')->assertNotFound();
});

it('gère le catalogue des moyens : création, filtre par pays, modification, suppression ou MOYEN_UTILISE', function () {
    adminConsole();

    $this->getJson('/api/v1/admin/moyens-paiement?pays=CI')->assertOk()->assertJsonCount(4, 'moyens')
        ->assertJsonPath('moyens.0.nom', 'Wave')->assertJsonPath('moyens.0.boutiques_actives', 0);

    $r = $this->postJson('/api/v1/admin/moyens-paiement', [
        'pays' => 'TG', 'nom' => 'T-Money', 'type' => 'numero', 'couleur' => 'jaune',
        'instructions_fr' => 'Composez le code T-Money et payez au numéro affiché.', 'instructions_en' => 'Pay to the number shown.',
    ])->assertCreated()->assertJsonPath('moyen.pays', 'TG')->assertJsonPath('moyen.actif', true)->assertJsonPath('moyen.ordre', 3);
    $ulid = $r->json('moyen.ulid');

    $this->patchJson("/api/v1/admin/moyens-paiement/{$ulid}", ['couleur' => 'violet', 'actif' => false])->assertOk()
        ->assertJsonPath('moyen.couleur', 'violet')->assertJsonPath('moyen.actif', false);
    $this->patchJson("/api/v1/admin/moyens-paiement/{$ulid}", ['pays' => 'CI'])->assertStatus(422)->assertJsonValidationErrors(['pays']);
    $this->patchJson("/api/v1/admin/moyens-paiement/{$ulid}", ['type' => 'lien'])->assertStatus(422)->assertJsonValidationErrors(['type']);

    $this->deleteJson("/api/v1/admin/moyens-paiement/{$ulid}")->assertNoContent();
    expect(MoyenPaiement::query()->where('ulid', $ulid)->exists())->toBeFalse();

    // Un moyen activé par une boutique ne se supprime pas : on le désactive.
    ['boutique' => $boutique] = boutiqueAvec('proprietaire');
    $om = moyenCatalogue('CI', 'Orange Money');
    activerMoyenPays($boutique, $om);
    $this->deleteJson("/api/v1/admin/moyens-paiement/{$om->ulid}")->assertStatus(409)->assertJsonPath('code', 'MOYEN_UTILISE');
    $this->getJson('/api/v1/admin/moyens-paiement?pays=CI')->assertJsonPath('moyens.1.nom', 'Orange Money')->assertJsonPath('moyens.1.boutiques_actives', 1);

    expect(JournalAudit::query()->whereIn('action', ['plateforme.moyen_cree', 'plateforme.moyen_modifie', 'plateforme.moyen_supprime'])->pluck('action')->all())
        ->toEqualCanonicalizing(['plateforme.moyen_cree', 'plateforme.moyen_modifie', 'plateforme.moyen_supprime']);
});

it('valide strictement les moyens : HTML ou retour à la ligne dans les instructions, couleur, type, doublon, pays inconnu', function () {
    adminConsole();
    $base = ['pays' => 'BJ', 'nom' => 'Celtiis Cash', 'type' => 'numero', 'couleur' => 'vert'];

    $this->postJson('/api/v1/admin/moyens-paiement', $base + ['instructions_fr' => '<script>alert(1)</script>'])->assertStatus(422)->assertJsonValidationErrors(['instructions_fr']);
    $this->postJson('/api/v1/admin/moyens-paiement', $base + ['instructions_en' => "Ligne 1\nLigne 2"])->assertStatus(422)->assertJsonValidationErrors(['instructions_en']);
    $this->postJson('/api/v1/admin/moyens-paiement', $base + ['instructions_fr' => str_repeat('a', 161)])->assertStatus(422)->assertJsonValidationErrors(['instructions_fr']);
    $this->postJson('/api/v1/admin/moyens-paiement', ['couleur' => '#ff0000'] + $base)->assertStatus(422)->assertJsonValidationErrors(['couleur']);
    $this->postJson('/api/v1/admin/moyens-paiement', ['type' => 'ussd'] + $base)->assertStatus(422)->assertJsonValidationErrors(['type']);
    $this->postJson('/api/v1/admin/moyens-paiement', ['pays' => 'FR'] + $base)->assertStatus(422)->assertJsonValidationErrors(['pays']);
    $this->postJson('/api/v1/admin/moyens-paiement', ['nom' => 'MTN MoMo'] + $base)->assertStatus(422)->assertJsonValidationErrors(['nom']);
    $this->postJson('/api/v1/admin/moyens-paiement', ['nom' => '<i>X</i>'] + $base)->assertStatus(422)->assertJsonValidationErrors(['nom']);

    // Même nom dans un autre pays : autorisé (unicité par pays).
    $this->postJson('/api/v1/admin/moyens-paiement', ['nom' => 'MTN MoMo', 'pays' => 'NE'] + $base)->assertCreated();
    $this->postJson('/api/v1/admin/moyens-paiement', $base + ['instructions_fr' => "Payez au numéro affiché, puis montrez l'écran."])->assertCreated()
        ->assertJsonPath('moyen.instructions_fr', "Payez au numéro affiché, puis montrez l'écran.");
});

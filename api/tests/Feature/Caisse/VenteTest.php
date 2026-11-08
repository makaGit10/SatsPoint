<?php

use App\Models\Article;
use App\Models\Boutique;
use App\Models\ComptePaytech;
use App\Models\ConnexionWallet;
use App\Models\JournalAudit;
use App\Models\SequenceVente;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    coursDisponible();
    passerelleFake();
});

it('crée une vente Lightning : numéro V-000001, facture via la passerelle, cours figé, forme du contrat', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();

    $reponse = connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning', 'note' => 'Table 4'])
        ->assertCreated()
        ->assertJsonPath('vente.numero', 'V-000001')
        ->assertJsonPath('vente.statut', 'en_attente')
        ->assertJsonPath('vente.montant_xof', 100)
        ->assertJsonPath('vente.note', 'Table 4')
        ->assertJsonPath('vente.caissier.ulid', $proprio->ulid)
        ->assertJsonPath('vente.recu_url', null)
        ->assertJsonPath('vente.paiements.0.methode', 'lightning')
        ->assertJsonPath('vente.paiements.0.statut', 'en_attente')
        ->assertJsonPath('vente.paiements.0.montant_sats', 228)
        ->assertJsonPath('vente.paiements.0.cours_xof_par_btc', COURS_TEST)
        ->assertJsonPath('vente.paiements.0.bolt11', 'lnbcrt2280n1testfacture')
        ->assertJsonPath('vente.paiements.0.payment_hash_abrege', 'ab12ab12')
        ->assertJsonPath('vente.paiements.0.simule', true)
        ->assertJsonPath('vente.paiements.0.paytech', null)
        ->assertJsonStructure(['vente' => ['ulid', 'numero', 'montant_xof', 'statut', 'methode_reussie', 'operateur_reussi', 'montant_sats_reussi', 'caissier' => ['ulid', 'nom'], 'note', 'alerte', 'cree_le', 'payee_le', 'lignes', 'paiements', 'paiement_reussi', 'recu_url']]);

    expect($reponse->json('vente.paiements.0'))->not->toHaveKeys(['preimage', 'payment_hash']);

    // Description « SatsPoint · {boutique} · {numero} », montant en msats, expiration = réglage boutique (5 min).
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), "/connexions/{$boutique->ulid}/factures")
        && $r['montant_msats'] === 228_000 && $r['description'] === "SatsPoint · {$boutique->nom} · V-000001" && $r['expiration_s'] === 300);

    $this->postJson('/api/v1/ventes', ['montant_xof' => 2500, 'methode' => 'lightning'])->assertCreated()->assertJsonPath('vente.numero', 'V-000002');
    expect(SequenceVente::query()->where('boutique_id', $boutique->id)->value('dernier_numero'))->toBe(2);
});

it('numérote chaque boutique indépendamment', function () {
    ['user' => $a] = boutiquePrete();
    ['user' => $b] = boutiquePrete();

    connecte($a)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertJsonPath('vente.numero', 'V-000001');
    connecte($b)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertJsonPath('vente.numero', 'V-000001');
    connecte($a)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertJsonPath('vente.numero', 'V-000002');
});

it('accepte des lignes dont la somme égale le montant et résout les articles de la boutique', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    $article = avecBoutique($boutique, fn () => Article::create(['nom' => 'Café Touba', 'prix_xof' => 200]));
    $etranger = Article::factory()->create(); // autre boutique

    connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 700, 'methode' => 'lightning', 'lignes' => [
        ['article_ulid' => $article->ulid, 'libelle' => 'Café Touba', 'quantite' => 2, 'prix_unitaire_xof' => 200],
        ['libelle' => 'Pain', 'quantite' => 1, 'prix_unitaire_xof' => 300],
    ]])->assertCreated()
        ->assertJsonCount(2, 'vente.lignes')
        ->assertJsonPath('vente.lignes.0.article_ulid', $article->ulid)
        ->assertJsonPath('vente.lignes.1.article_ulid', null);

    $this->postJson('/api/v1/ventes', ['montant_xof' => 500, 'methode' => 'lightning', 'lignes' => [['libelle' => 'x', 'quantite' => 1, 'prix_unitaire_xof' => 200]]])
        ->assertStatus(422)->assertJsonValidationErrors(['montant_xof']);

    $this->postJson('/api/v1/ventes', ['montant_xof' => 200, 'methode' => 'lightning', 'lignes' => [['article_ulid' => $etranger->ulid, 'libelle' => 'x', 'quantite' => 1, 'prix_unitaire_xof' => 200]]])
        ->assertStatus(422)->assertJsonPath('code', 'ARTICLE_INTROUVABLE');
});

it('valide les bornes et les listes fermées', function (array $corps, string $champ) {
    ['user' => $proprio] = boutiquePrete(reglages: ['montant_max_xof' => 500_000]);

    connecte($proprio)->postJson('/api/v1/ventes', $corps)->assertStatus(422)->assertJsonValidationErrors([$champ]);
})->with([
    [['montant_xof' => 99, 'methode' => 'lightning'], 'montant_xof'],
    [['montant_xof' => 500_001, 'methode' => 'lightning'], 'montant_xof'],
    [['montant_xof' => 'abc', 'methode' => 'lightning'], 'montant_xof'],
    [['montant_xof' => 100.5, 'methode' => 'lightning'], 'montant_xof'],
    [['montant_xof' => 100, 'methode' => 'bitcoin'], 'methode'],
    [['montant_xof' => 100, 'methode' => 'paytech', 'operateur' => 'mtn'], 'operateur'],
    [['montant_xof' => 100, 'methode' => 'lightning', 'note' => str_repeat('a', 201)], 'note'],
    [['montant_xof' => 100, 'methode' => 'lightning', 'lignes' => [['libelle' => '', 'quantite' => 0, 'prix_unitaire_xof' => -1]]], 'lignes.0.quantite'],
]);

it('bloque Lightning sans cours frais (503) mais laisse le mobile money possible', function () {
    coursDisponible(ageS: 601);
    ['user' => $proprio] = boutiquePrete();

    connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertStatus(503)->assertJsonPath('code', 'COURS_INDISPONIBLE');
    expect(Vente::toutesBoutiques()->count())->toBe(0); // la transaction est annulée : aucune vente orpheline

    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'paytech', 'operateur' => 'wave'])->assertCreated()->assertJsonPath('vente.paiements.0.simule', true);
});

it('refuse un moyen désactivé (409) et Lightning sans portefeuille (409), et n\'enregistre rien si la passerelle échoue', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire'); // moyens par défaut : lightning seul, pas de wallet

    connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'paytech'])->assertStatus(409)->assertJsonPath('code', 'MOYEN_INACTIF');
    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'])->assertStatus(409)->assertJsonPath('code', 'MOYEN_INACTIF');
    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertStatus(409)->assertJsonPath('code', 'WALLET_NON_CONNECTE');

    avecBoutique($boutique, fn () => ConnexionWallet::create(['uri_chiffree' => 'mock://demo', 'statut' => 'active']));
    httpFraiche();
    Http::fake(['*/connexions/*/factures' => Http::response(['erreur' => ['code' => 'PORTEFEUILLE_INJOIGNABLE', 'message' => 'relais muet']], 502)]);

    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertStatus(502)->assertJsonPath('code', 'PORTEFEUILLE_INDISPONIBLE');
    expect(Vente::toutesBoutiques()->count())->toBe(0)->and(SequenceVente::query()->count())->toBe(0);
});

it('crée une tentative PayTech simulée sans clés, et réelle avec les clés de la boutique', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();

    connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 1500, 'methode' => 'paytech', 'operateur' => 'orange_money'])
        ->assertCreated()
        ->assertJsonPath('vente.paiements.0.methode', 'paytech')
        ->assertJsonPath('vente.paiements.0.operateur', 'orange_money')
        ->assertJsonPath('vente.paiements.0.simule', true)
        ->assertJsonPath('vente.paiements.0.montant_sats', null)
        ->assertJsonPath('vente.paiements.0.paytech.redirect_url', config('app.url').'/paiement-simule/'.Vente::toutesBoutiques()->first()->paiements()->first()->ulid);

    avecBoutique($boutique, fn () => ComptePaytech::create(['api_key_chiffree' => 'CLE-TEST', 'api_secret_chiffree' => 'SECRET-TEST', 'environnement' => 'test', 'statut' => 'actif']));
    Http::fake(['paytech.sn/api/payment/request-payment' => Http::response(['success' => 1, 'token' => 'tok_abc', 'redirect_url' => 'https://paytech.sn/payment/checkout/tok_abc'])]);

    $reponse = $this->postJson('/api/v1/ventes', ['montant_xof' => 1500, 'methode' => 'paytech', 'operateur' => 'wave'])
        ->assertCreated()
        ->assertJsonPath('vente.paiements.0.simule', false)
        ->assertJsonPath('vente.paiements.0.paytech', ['redirect_url' => 'https://paytech.sn/payment/checkout/tok_abc', 'token' => 'tok_abc']);

    $ulid = $reponse->json('vente.paiements.0.ulid');

    Http::assertSent(fn (Request $r) => $r->url() === 'https://paytech.sn/api/payment/request-payment'
        && $r->hasHeader('API_KEY', 'CLE-TEST') && $r->hasHeader('API_SECRET', 'SECRET-TEST')
        && $r['item_price'] === 1500 && $r['currency'] === 'XOF' && $r['ref_command'] === $ulid && $r['env'] === 'test'
        && $r['target_payment'] === 'Wave' && $r['ipn_url'] === config('app.url').'/webhooks/paytech/'.$boutique->ulid
        && str_starts_with($r['success_url'], config('satspoint.frontend_url')) && str_starts_with($r['cancel_url'], config('satspoint.frontend_url'))
        && str_contains($r['command_name'], 'V-000002'));

    // Refus PayTech : rien n'est enregistré.
    httpFraiche();
    Http::fake(['paytech.sn/*' => Http::response(['success' => 0, 'message' => 'Invalid API KEY'], 401)]);
    $this->postJson('/api/v1/ventes', ['montant_xof' => 1500, 'methode' => 'paytech'])->assertStatus(502)->assertJsonPath('code', 'PAYTECH_REFUS');
    expect(Vente::toutesBoutiques()->count())->toBe(2);
});

it('crée une tentative Wave direct avec le lien de la boutique et le montant', function () {
    ['user' => $caissier, 'boutique' => $boutique] = boutiqueAvec('caissier', boutiquePrete()['boutique']);

    connecte($caissier)->postJson('/api/v1/ventes', ['montant_xof' => 7500, 'methode' => 'wave_manuel'])
        ->assertCreated()
        ->assertJsonPath('vente.paiements.0.methode', 'wave_manuel')
        ->assertJsonPath('vente.paiements.0.operateur', 'wave')
        ->assertJsonPath('vente.paiements.0.simule', false)
        ->assertJsonPath('vente.paiements.0.expire_le', null)
        ->assertJsonPath('vente.paiements.0.wave_lien', 'https://pay.wave.com/m/M_test/c/sn/?amount=7500');

    $boutique->fill(['reglages' => array_merge($boutique->reglagesComplets(), ['wave_lien' => null])])->save();
    connecte($caissier)->postJson('/api/v1/ventes', ['montant_xof' => 7500, 'methode' => 'wave_manuel'])->assertStatus(409)->assertJsonPath('code', 'WAVE_NON_CONFIGURE');
});

it('ajoute une nouvelle tentative et annule les tentatives en attente', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['vente' => $vente, 'paiement' => $p1] = venteAvecTentative($boutique, $proprio);

    connecte($proprio)->postJson("/api/v1/ventes/{$vente->ulid}/paiements", ['methode' => 'paytech', 'operateur' => 'free_money'])
        ->assertCreated()
        ->assertJsonPath('paiement.methode', 'paytech')
        ->assertJsonPath('paiement.operateur', 'free_money')
        ->assertJsonPath('paiement.statut', 'en_attente');

    expect($p1->fresh()->statut)->toBe('annule');

    $this->getJson("/api/v1/ventes/{$vente->ulid}")->assertOk()->assertJsonCount(2, 'vente.paiements')
        ->assertJsonPath('vente.paiements.0.statut', 'annule')
        ->assertJsonPath('vente.paiements.0.bolt11', null); // facture abandonnée : plus exposée

    // Vente close : plus de tentative.
    avecBoutique($boutique, fn () => $vente->forceFill(['statut' => 'annulee'])->save());
    $this->postJson("/api/v1/ventes/{$vente->ulid}/paiements", ['methode' => 'lightning'])->assertStatus(409)->assertJsonPath('code', 'VENTE_CLOSE');
});

it('annule une vente en attente (caissier : les siennes seulement) et journalise', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);
    ['user' => $autreCaissier] = boutiqueAvec('caissier', $boutique);
    ['vente' => $vente, 'paiement' => $paiement] = venteAvecTentative($boutique, $caissier);

    connecte($autreCaissier)->postJson("/api/v1/ventes/{$vente->ulid}/annuler")->assertForbidden();
    connecte($autreCaissier)->getJson("/api/v1/ventes/{$vente->ulid}")->assertForbidden();

    connecte($caissier)->postJson("/api/v1/ventes/{$vente->ulid}/annuler")->assertOk()
        ->assertJsonPath('vente.statut', 'annulee')
        ->assertJsonPath('vente.paiements.0.statut', 'annule');

    expect($paiement->fresh()->statut)->toBe('annule')
        ->and(JournalAudit::query()->where('action', 'vente.annulee')->where('user_id', $caissier->id)->exists())->toBeTrue();

    connecte($proprio)->postJson("/api/v1/ventes/{$vente->ulid}/annuler")->assertStatus(409)->assertJsonPath('code', 'VENTE_NON_ANNULABLE');
});

it('liste les ventes avec filtres, curseur et totaux ; le caissier ne voit que ses ventes du jour', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);

    $v1 = venteAvecTentative($boutique, $proprio, vente: ['montant_xof' => 1000]);
    $v2 = venteAvecTentative($boutique, $caissier, 'paytech', vente: ['montant_xof' => 2500]);
    $v3 = venteAvecTentative($boutique, $caissier, 'wave_manuel', vente: ['montant_xof' => 400]);
    $hier = venteAvecTentative($boutique, $caissier, vente: ['montant_xof' => 9000]);
    avecBoutique($boutique, function () use ($v2, $hier) {
        $v2['vente']->forceFill(['statut' => 'payee', 'payee_at' => now(), 'paiement_reussi_id' => $v2['paiement']->id, 'recu_jeton' => Vente::genererJetonRecu()])->save();
        $v2['paiement']->forceFill(['statut' => 'reussi', 'regle_at' => now(), 'operateur' => 'wave'])->save();
        $hier['vente']->forceFill(['created_at' => now()->subDay()->subHours(2)])->saveQuietly();
    });
    venteAvecTentative(Boutique::factory()->create(), User::factory()->create()); // autre boutique

    $reponse = connecte($proprio)->getJson('/api/v1/ventes?periode=aujourdhui&limite=2')->assertOk()
        ->assertJsonCount(2, 'ventes')
        ->assertJsonPath('totaux', ['nombre' => 3, 'montant_xof' => 3900, 'payees_xof' => 2500])
        ->assertJsonPath('ventes.0.numero', 'V-000003')
        ->assertJsonStructure(['ventes' => [['ulid', 'numero', 'montant_xof', 'statut', 'methode_reussie', 'operateur_reussi', 'montant_sats_reussi', 'caissier', 'note', 'alerte', 'cree_le', 'payee_le']], 'curseur_suivant', 'totaux']);

    $curseur = $reponse->json('curseur_suivant');
    expect($curseur)->not->toBeNull();
    $this->getJson('/api/v1/ventes?periode=aujourdhui&limite=2&curseur='.urlencode($curseur))->assertOk()->assertJsonCount(1, 'ventes')->assertJsonPath('ventes.0.numero', 'V-000001')->assertJsonPath('curseur_suivant', null);

    $this->getJson('/api/v1/ventes?periode=hier')->assertOk()->assertJsonCount(1, 'ventes')->assertJsonPath('ventes.0.montant_xof', 9000);
    $this->getJson('/api/v1/ventes?periode=7j')->assertOk()->assertJsonPath('totaux.nombre', 4);
    $this->getJson('/api/v1/ventes?statut=payee')->assertOk()->assertJsonCount(1, 'ventes')->assertJsonPath('ventes.0.methode_reussie', 'paytech')->assertJsonPath('ventes.0.operateur_reussi', 'wave');
    $this->getJson('/api/v1/ventes?methode=wave_manuel')->assertOk()->assertJsonCount(1, 'ventes')->assertJsonPath('ventes.0.montant_xof', 400);
    $this->getJson('/api/v1/ventes?caissier='.$caissier->ulid)->assertOk()->assertJsonCount(2, 'ventes');
    $this->getJson('/api/v1/ventes?q=V-000002')->assertOk()->assertJsonCount(1, 'ventes')->assertJsonPath('ventes.0.numero', 'V-000002');
    $this->getJson('/api/v1/ventes?q=2500')->assertOk()->assertJsonCount(1, 'ventes');
    $this->getJson('/api/v1/ventes?q=1')->assertOk()->assertJsonCount(1, 'ventes'); // numéro 1 (montant 1 inexistant)
    $this->getJson("/api/v1/ventes?q=' OR 1=1 --")->assertOk()->assertJsonCount(0, 'ventes');
    $this->getJson('/api/v1/ventes?periode=perso&du=2026-01-01&au=2025-01-01')->assertStatus(422);
    $this->getJson('/api/v1/ventes?statut=volee')->assertStatus(422);
    $this->getJson('/api/v1/ventes?limite=101')->assertStatus(422);

    // Caissier : ses ventes du jour, quels que soient les filtres.
    connecte($caissier)->getJson('/api/v1/ventes?periode=7j&caissier='.$proprio->ulid)->assertOk()
        ->assertJsonCount(2, 'ventes')->assertJsonPath('totaux.nombre', 2)->assertJsonPath('totaux.montant_xof', 2900);
});

it('exporte les ventes en CSV UTF-8 avec BOM pour le propriétaire et le gérant, jamais pour le caissier', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);
    $v = venteAvecTentative($boutique, $caissier, vente: ['montant_xof' => 1000, 'note' => '=HYPERLINK("x")']);
    avecBoutique($boutique, function () use ($v) {
        $v['vente']->forceFill(['statut' => 'payee', 'payee_at' => now(), 'paiement_reussi_id' => $v['paiement']->id, 'recu_jeton' => 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'])->save();
        $v['paiement']->forceFill(['statut' => 'reussi', 'regle_at' => now()])->save();
    });
    venteAvecTentative($boutique, $caissier, vente: ['montant_xof' => 300]);

    connecte($caissier)->get('/api/v1/exports/ventes?format=csv')->assertForbidden();

    $reponse = connecte($gerant)->get('/api/v1/exports/ventes?format=csv&statut=payee')->assertOk()
        ->assertHeader('Content-Type', 'text/csv; charset=UTF-8');
    expect($reponse->headers->get('Content-Disposition'))->toContain('attachment')->toContain('ventes-');

    $contenu = $reponse->streamedContent();
    $lignes = explode("\n", trim($contenu));

    expect(substr($contenu, 0, 3))->toBe("\xEF\xBB\xBF")
        ->and($lignes[0])->toContain('Numéro;Date;Heure;"Montant (FCFA)";Statut;Moyen')
        ->and(count($lignes))->toBe(2)
        ->and($lignes[1])->toContain('V-000001;')->toContain(';1000;Payée;Lightning;;228;'.COURS_TEST.';')
        ->and($lignes[1])->toContain('"\'=HYPERLINK(""x"")"') // injection de formule neutralisée
        ->and($lignes[1])->toContain('/r/A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6');

    $tout = connecte($proprio)->get('/api/v1/exports/ventes?format=csv')->assertOk()->streamedContent();
    expect(count(explode("\n", trim($tout))))->toBe(3);
});

it('refuse une vente d\'une autre boutique (404) et un utilisateur sans boutique', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['vente' => $vente] = venteAvecTentative($boutique, $proprio);
    ['user' => $etranger] = boutiquePrete();

    connecte($etranger)->getJson("/api/v1/ventes/{$vente->ulid}")->assertNotFound();
    connecte(User::factory()->create())->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertNotFound()->assertJsonPath('code', 'BOUTIQUE_ABSENTE');
    connecte(User::factory()->superAdmin()->create())->getJson('/api/v1/ventes')->assertNotFound();
});

it('limite la création de ventes à 30 par minute et par utilisateur', function () {
    ['user' => $proprio] = boutiquePrete();
    connecte($proprio);

    for ($i = 0; $i < 30; $i++) {
        $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'])->assertCreated();
    }

    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'])->assertStatus(429)->assertJsonPath('code', 'TROP_DE_TENTATIVES');
});

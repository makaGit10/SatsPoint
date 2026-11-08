<?php

use App\Models\Article;
use App\Models\RechercheRecente;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Recherche globale (CAHIER § 6.14) : groupes, droits, accents / fautes, récentes, < 150 ms.
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiquePrete();
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique, User::factory()->create(['nom' => 'Fatou Diallo', 'email' => 'fatou@example.com']));
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique, User::factory()->create(['nom' => 'Moussa Ndiaye', 'telephone' => '+221771234567']));

    avecBoutique($this->boutique, function () {
        Article::create(['nom' => 'Bazin riche', 'prix_xof' => 15000, 'categorie' => 'Tissus', 'sku' => 'TIS-BAZ-01']);
        Article::create(['nom' => 'Thiéboudienne', 'prix_xof' => 1500, 'categorie' => 'Plats']);
        Article::create(['nom' => 'Café Touba', 'prix_xof' => 200, 'categorie' => 'Boissons']);
        for ($i = 0; $i < 30; $i++) {
            Article::create(['nom' => 'Article divers '.$i, 'prix_xof' => 100 + $i]);
        }
    });

    $this->venteNote = venteAvecTentative($this->boutique, $this->caissier, 'wave_manuel', vente: ['montant_xof' => 30000, 'note' => '2 m de bazin pour Mme Sow'])['vente'];
    $this->venteProprio = venteAvecTentative($this->boutique, $this->proprio, 'wave_manuel', vente: ['montant_xof' => 1500])['vente'];
    venteAvecTentative($this->boutique, $this->caissier, 'wave_manuel', vente: ['montant_xof' => 700]);
});

it('groupe les résultats par rubrique (5 max), tolère accents et fautes, et respecte les droits du caissier', function () {
    $r = connecte($this->proprio)->getJson('/api/v1/recherche?q=bazin')->assertOk();
    $groupes = collect($r->json('groupes'))->keyBy('rubrique');

    expect($groupes->keys()->all())->toBe(['ventes', 'articles'])
        ->and($groupes['articles']['resultats'][0]['titre'])->toBe('Bazin riche')
        ->and($groupes['articles']['resultats'][0])->toHaveKeys(['titre', 'sous_titre', 'url', 'score'])
        ->and($groupes['articles']['resultats'][0]['sous_titre'])->toContain('15 000 FCFA')->toContain('Tissus')->toContain('TIS-BAZ-01')
        ->and($groupes['ventes']['resultats'][0]['titre'])->toBe('V-000001 · 30 000 FCFA')
        ->and($groupes['ventes']['resultats'][0]['sous_titre'])->toContain('2 m de bazin')
        ->and($groupes['ventes']['resultats'][0]['url'])->toBe('/ventes?vente='.$this->venteNote->ulid);

    // Faute de frappe et accents ignorés.
    expect(collect($this->getJson('/api/v1/recherche?q=bazim')->assertOk()->json('groupes'))->keyBy('rubrique')->get('articles')['resultats'][0]['titre'])->toBe('Bazin riche');
    expect(collect($this->getJson('/api/v1/recherche?q=thieboudienne')->assertOk()->json('groupes'))->keyBy('rubrique')->get('articles')['resultats'][0]['titre'])->toBe('Thiéboudienne');
    expect(collect($this->getJson('/api/v1/recherche?q=CAFÉ')->assertOk()->json('groupes'))->keyBy('rubrique')->get('articles')['resultats'][0]['titre'])->toBe('Café Touba');
    expect(collect($this->getJson('/api/v1/recherche?q=tis-baz')->assertOk()->json('groupes'))->keyBy('rubrique')->get('articles')['resultats'][0]['titre'])->toBe('Bazin riche');

    // 5 résultats maximum par rubrique.
    $divers = collect($this->getJson('/api/v1/recherche?q=divers')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect(count($divers['articles']['resultats']))->toBe(5);

    // Ventes par numéro et par montant.
    $parNumero = collect($this->getJson('/api/v1/recherche?q=V-000002')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($parNumero['ventes']['resultats'][0]['url'])->toBe('/ventes?vente='.$this->venteProprio->ulid);
    $parMontant = collect($this->getJson('/api/v1/recherche?q=1500')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect(count($parMontant['ventes']['resultats']))->toBe(1)->and($parMontant['articles']['resultats'][0]['titre'])->toBe('Thiéboudienne'); // article au prix exact
});

it('trouve l\'équipe et les pages pour le propriétaire, jamais pour le caissier ; le caissier ne voit que ses ventes', function () {
    $equipe = collect(connecte($this->proprio)->getJson('/api/v1/recherche?q=fatou')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($equipe['equipe']['resultats'][0]['titre'])->toBe('Fatou Diallo')
        ->and($equipe['equipe']['resultats'][0]['sous_titre'])->toContain('gérant')->toContain('fatou@example.com');
    $parTel = collect($this->getJson('/api/v1/recherche?q=77 123 45')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($parTel['equipe']['resultats'][0]['titre'])->toBe('Moussa Ndiaye');

    // Pages : FR, EN, synonymes, fautes.
    $pages = collect($this->getJson('/api/v1/recherche?q=portfeuille')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($pages['pages']['resultats'][0]['url'])->toBe('/portefeuille')->and($pages['pages']['resultats'][0]['titre'])->toBe('Portefeuille');
    $pages = collect($this->getJson('/api/v1/recherche?q=wallet')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect(collect($pages['pages']['resultats'])->pluck('url')->all())->toContain('/portefeuille');
    $pages = collect($this->getJson('/api/v1/recherche?q=paytech')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($pages['pages']['resultats'][0]['url'])->toBe('/reglages#paytech');
    $pages = collect($this->getJson('/api/v1/recherche?q=thème')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($pages['pages']['resultats'][0]['url'])->toBe('/reglages#preferences');
    $pages = collect($this->getJson('/api/v1/recherche?q=réglages')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect(collect($pages['pages']['resultats'])->pluck('url')->all())->toContain('/reglages');

    // Caissier : pas d'équipe, pas de réglages / portefeuille, seulement SES ventes.
    $c = collect(connecte($this->caissier)->getJson('/api/v1/recherche?q=fatou')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($c->has('equipe'))->toBeFalse();
    $c = collect($this->getJson('/api/v1/recherche?q=reglages')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($c->has('pages'))->toBeFalse();
    $c = collect($this->getJson('/api/v1/recherche?q=portefeuille')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($c->has('pages'))->toBeFalse();
    $c = collect($this->getJson('/api/v1/recherche?q=caisse')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($c['pages']['resultats'][0]['url'])->toBe('/caisse');
    $c = collect($this->getJson('/api/v1/recherche?q=1500')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($c->has('ventes'))->toBeFalse(); // la vente de 1 500 est celle du propriétaire
    $c = collect($this->getJson('/api/v1/recherche?q=bazin')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect(count($c['ventes']['resultats']))->toBe(1);

    // Locale anglaise : titres en anglais.
    $this->gerant->forceFill(['preferences' => ['locale' => 'en']])->save();
    $en = collect(connecte($this->gerant)->getJson('/api/v1/recherche?q=team')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($en['pages']['resultats'][0]['titre'])->toBe('Team');
});

it('valide la requête, cloisonne les boutiques, limite à 60 / min et répond vite', function () {
    connecte($this->proprio)->getJson('/api/v1/recherche?q=a')->assertStatus(422)->assertJsonValidationErrors(['q']);
    $this->getJson('/api/v1/recherche')->assertStatus(422);
    $this->getJson('/api/v1/recherche?q='.str_repeat('x', 81))->assertStatus(422);
    $this->getJson('/api/v1/recherche?q=%25%25')->assertOk()->assertJsonPath('groupes', []);
    $this->getJson("/api/v1/recherche?q=' OR 1=1 --")->assertOk();

    // Autre boutique : rien des données de la première.
    ['user' => $etranger] = boutiquePrete();
    connecte($etranger)->getJson('/api/v1/recherche?q=bazin')->assertOk()->assertJsonPath('groupes', []);

    // Sans boutique : 404 BOUTIQUE_ABSENTE ; super-admin idem.
    connecte(User::factory()->create())->getJson('/api/v1/recherche?q=bazin')->assertNotFound();

    // Temps de réponse serveur (hors démarrage) : < 150 ms en moyenne sur quelques requêtes.
    connecte($this->proprio)->getJson('/api/v1/recherche?q=bazin')->assertOk();
    $debut = hrtime(true);
    foreach (['bazin', 'thiebou', 'fatou', 'V-000001', 'portefeuille'] as $q) {
        $this->getJson('/api/v1/recherche?q='.$q)->assertOk();
    }
    $moyenneMs = (hrtime(true) - $debut) / 5 / 1e6;
    expect($moyenneMs)->toBeLessThan(150);

    // 60 / min.
    for ($i = 0; $i < 49; $i++) { // 11 requêtes déjà faites par ce compte
        $this->getJson('/api/v1/recherche?q=xx')->assertOk();
    }
    $this->getJson('/api/v1/recherche?q=xx')->assertStatus(429);
});

it('mémorise les 4 dernières recherches par utilisateur (sans doublon) et les efface', function () {
    connecte($this->proprio)->getJson('/api/v1/recherche/recentes')->assertOk()->assertJsonPath('recentes', []);

    foreach (['bazin', 'café', 'Fatou', 'bazin', 'thiéb', 'wave'] as $terme) {
        $this->postJson('/api/v1/recherche/recentes', ['terme' => $terme])->assertNoContent();
    }

    $this->getJson('/api/v1/recherche/recentes')->assertOk()->assertJsonPath('recentes', ['wave', 'thiéb', 'bazin', 'Fatou']);
    expect(RechercheRecente::query()->where('user_id', $this->proprio->id)->count())->toBe(4);

    // Par utilisateur : le caissier a sa propre liste.
    connecte($this->caissier)->getJson('/api/v1/recherche/recentes')->assertOk()->assertJsonPath('recentes', []);
    $this->postJson('/api/v1/recherche/recentes', ['terme' => ''])->assertStatus(422);
    $this->postJson('/api/v1/recherche/recentes', ['terme' => str_repeat('a', 121)])->assertStatus(422);

    connecte($this->proprio)->deleteJson('/api/v1/recherche/recentes')->assertNoContent();
    $this->getJson('/api/v1/recherche/recentes')->assertJsonPath('recentes', []);
});

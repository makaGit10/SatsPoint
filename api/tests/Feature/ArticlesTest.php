<?php

use App\Models\Article;
use App\Models\Boutique;
use App\Models\ConnexionWallet;
use App\Models\JournalAudit;
use App\Models\Vente;
use Database\Seeders\DemoSeeder;

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiqueAvec('proprietaire');
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
});

it('crée, modifie et supprime un article (propriétaire / gérant), forme du contrat, journalisé', function () {
    $reponse = connecte($this->gerant)->postJson('/api/v1/articles', ['nom' => 'Café Touba', 'prix_xof' => 200, 'categorie' => 'Boissons', 'couleur' => '#92400E', 'sku' => 'CAFE-01'])
        ->assertCreated()
        ->assertJsonPath('article.nom', 'Café Touba')->assertJsonPath('article.prix_xof', 200)->assertJsonPath('article.actif', true)->assertJsonPath('article.position', 1)
        ->assertJsonStructure(['article' => ['ulid', 'nom', 'prix_xof', 'categorie', 'couleur', 'sku', 'actif', 'position']]);
    $ulid = $reponse->json('article.ulid');

    $this->postJson('/api/v1/articles', ['nom' => 'Bissap', 'prix_xof' => 300])->assertCreated()->assertJsonPath('article.position', 2);

    connecte($this->proprio)->patchJson("/api/v1/articles/{$ulid}", ['prix_xof' => 250, 'actif' => false])->assertOk()->assertJsonPath('article.prix_xof', 250)->assertJsonPath('article.actif', false);

    $this->deleteJson("/api/v1/articles/{$ulid}")->assertNoContent();
    expect(Article::pourBoutique($this->boutique)->count())->toBe(1)
        ->and(JournalAudit::query()->whereIn('action', ['article.cree', 'article.modifie', 'article.supprime'])->count())->toBe(4);
    $this->deleteJson("/api/v1/articles/{$ulid}")->assertNotFound();
});

it('le caissier lit les articles mais ne les modifie pas', function () {
    $article = avecBoutique($this->boutique, fn () => Article::create(['nom' => 'Pain', 'prix_xof' => 150, 'position' => 1]));

    connecte($this->caissier)->getJson('/api/v1/articles')->assertOk()->assertJsonCount(1, 'articles')->assertJsonPath('articles.0.ulid', $article->ulid);
    $this->postJson('/api/v1/articles', ['nom' => 'X', 'prix_xof' => 1])->assertForbidden();
    $this->patchJson("/api/v1/articles/{$article->ulid}", ['prix_xof' => 1])->assertForbidden();
    $this->deleteJson("/api/v1/articles/{$article->ulid}")->assertForbidden();
    $this->postJson('/api/v1/articles/ordre', ['ulids' => [$article->ulid]])->assertForbidden();
});

it('valide les champs (bornes, couleur, SKU unique par boutique)', function () {
    avecBoutique($this->boutique, fn () => Article::create(['nom' => 'Pain', 'prix_xof' => 150, 'sku' => 'PAIN']));
    avecBoutique(Boutique::factory()->create(), fn () => Article::create(['nom' => 'Autre', 'prix_xof' => 150, 'sku' => 'LIBRE']));

    connecte($this->proprio);
    $this->postJson('/api/v1/articles', ['nom' => '', 'prix_xof' => -1, 'couleur' => 'rouge', 'sku' => 'PAIN'])->assertStatus(422)->assertJsonValidationErrors(['nom', 'prix_xof', 'couleur', 'sku']);
    $this->postJson('/api/v1/articles', ['nom' => 'Beignet', 'prix_xof' => 50_000_001])->assertStatus(422)->assertJsonValidationErrors(['prix_xof']);
    $this->postJson('/api/v1/articles', ['nom' => 'Beignet', 'prix_xof' => 100, 'sku' => 'LIBRE'])->assertCreated(); // SKU libre dans CETTE boutique
    $this->postJson('/api/v1/articles', ['nom' => 'Beignet', 'prix_xof' => 100, 'sku' => 'pain; drop'])->assertStatus(422)->assertJsonValidationErrors(['sku']);
});

it('réordonne la grille (POST /articles/ordre) et ignore les ulids étrangers', function () {
    [$a, $b, $c] = avecBoutique($this->boutique, fn () => [
        Article::create(['nom' => 'A', 'prix_xof' => 1, 'position' => 1]),
        Article::create(['nom' => 'B', 'prix_xof' => 1, 'position' => 2]),
        Article::create(['nom' => 'C', 'prix_xof' => 1, 'position' => 3]),
    ]);
    $etranger = Article::factory()->create(['position' => 1]);

    connecte($this->gerant)->postJson('/api/v1/articles/ordre', ['ulids' => [$c->ulid, $etranger->ulid, $a->ulid, $b->ulid]])->assertOk()
        ->assertJsonPath('articles.0.ulid', $c->ulid)->assertJsonPath('articles.1.ulid', $a->ulid)->assertJsonPath('articles.2.ulid', $b->ulid);

    expect($c->fresh()->position)->toBe(1)->and($a->fresh()->position)->toBe(3)->and($b->fresh()->position)->toBe(4)
        ->and($etranger->fresh()->position)->toBe(1);

    $this->postJson('/api/v1/articles/ordre', ['ulids' => []])->assertStatus(422);
    $this->postJson('/api/v1/articles/ordre', ['ulids' => [$a->ulid, $a->ulid]])->assertStatus(422);
});

it('le seeder de démonstration conserve les 8 articles et reste idempotent', function () {
    config()->set('satspoint.demo.mot_de_passe', 'MotDePasseDemo-2026!');
    config()->set('satspoint.superadmin.mot_de_passe', 'MotDePasseAdmin-2026!');
    // Jamais le vrai portefeuille ni les vraies clés PayTech de l'environnement dans la base de test.
    config()->set('satspoint.demo.nwc_uri', null);
    config()->set('satspoint.paytech.api_key', null);
    config()->set('satspoint.paytech.api_secret', null);

    $this->seed(DemoSeeder::class);
    $this->seed(DemoSeeder::class);

    $boutique = Boutique::query()->where('nom', config('satspoint.demo.nom_boutique'))->firstOrFail();
    $articles = Article::pourBoutique($boutique)->orderBy('position')->get();

    expect($articles)->toHaveCount(8)
        ->and($articles->pluck('nom')->all())->toBe(['Café Touba', 'Bissap', 'Eau minérale 1,5 L', 'Thiéboudienne', 'Yassa poulet', 'Pain', 'Beignets (x3)', 'Pagne wax (2 m)'])
        ->and(ConnexionWallet::pourBoutique($boutique)->first()->estSimulee())->toBeTrue()
        ->and(Vente::pourBoutique($boutique)->count())->toBe(0);
});

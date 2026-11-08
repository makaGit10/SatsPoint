<?php

use App\Events\DonneesModifiees;
use App\Models\Article;
use App\Models\CleAudio;
use App\Models\Import;
use App\Models\JournalAudit;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use PragmaRX\Google2FA\Google2FA;

/*
|--------------------------------------------------------------------------
| Vague 3 — compléments : 2FA (ré-initialisation, audit, désactivation), registre des clés (garde-fous),
| recherche (accents dans les notes, caissier), import (erreurs bornées, rapport, signal temps réel).
|--------------------------------------------------------------------------
*/

// ------------------------------------------------------------------ 2FA

it('2FA : ré-initialiser avant activation remplace le secret ; l\'ancien ne fonctionne plus', function () {
    $user = User::factory()->create();
    $premier = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->assertOk()->json('secret');
    $second = $this->postJson('/api/v1/auth/2fa/initialiser')->assertOk()->json('secret');

    expect($second)->not->toBe($premier);
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => app(Google2FA::class)->getCurrentOtp($premier)])->assertStatus(422);
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => app(Google2FA::class)->getCurrentOtp($second)])->assertOk()->assertJsonCount(8, 'codes_secours');
});

it('2FA : un échec d\'activation est journalisé ; le journal ne contient ni secret ni code', function () {
    $user = User::factory()->create();
    $secret = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->json('secret');
    $this->postJson('/api/v1/auth/2fa/activer', ['code' => '000000'])->assertStatus(422);

    $entrees = JournalAudit::query()->where('user_id', $user->id)->get();
    expect($entrees->pluck('action')->all())->toContain('auth.2fa_initialisee')->toContain('auth.2fa_echec')
        ->and(json_encode($entrees->pluck('details')))->not->toContain($secret)->not->toContain('000000');
});

it('2FA : désactiver sans 2FA active ou sans mot de passe est refusé proprement', function () {
    $user = User::factory()->create();
    connecte($user)->deleteJson('/api/v1/auth/2fa', [])->assertStatus(422)->assertJsonValidationErrors(['password']);
    $this->deleteJson('/api/v1/auth/2fa', ['password' => MDP_TEST])->assertNoContent();
    expect($user->fresh()->deuxFaActive())->toBeFalse();
});

it('2FA : le secret stocké est chiffré avec la clé dédiée et le cast le relit', function () {
    $user = User::factory()->create();
    $secret = connecte($user)->postJson('/api/v1/auth/2fa/initialiser')->json('secret');

    $brut = DB::table('users')->where('id', $user->id)->value('two_factor_secret');
    expect($brut)->toStartWith('v1:')->and($user->fresh()->two_factor_secret)->toBe($secret);
});

// ------------------------------------------------------------------ Registre des clés

it('registre : un fichier vide ou qui n\'est pas une liste ne modifie rien', function () {
    CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']);

    Storage::disk('local')->put('tests/vide.json', '[]');
    $this->artisan('audio:synchroniser', ['chemin' => Storage::disk('local')->path('tests/vide.json')])->assertFailed();
    Storage::disk('local')->put('tests/objet.json', '{"cle": "caisse.encaisser"}');
    $this->artisan('audio:synchroniser', ['chemin' => Storage::disk('local')->path('tests/objet.json')])->assertFailed();

    expect(CleAudio::query()->where('cle', 'caisse.encaisser')->value('presente_dans_code'))->toBeTrue();
});

it('registre : la synchronisation tronque les textes trop longs et prévient le studio (rubrique audio, canal admin)', function () {
    Event::fake([DonneesModifiees::class]);
    Storage::disk('local')->put('tests/long.json', json_encode([['cle' => 'aide.long', 'ecran' => 'aide', 'contexte' => str_repeat('c', 500), 'texte_fr' => str_repeat('é', 400), 'texte_en' => 'Help']]));

    $this->artisan('audio:synchroniser', ['chemin' => Storage::disk('local')->path('tests/long.json')])->assertSuccessful();

    $cle = CleAudio::query()->where('cle', 'aide.long')->first();
    expect(mb_strlen($cle->texte_fr))->toBe(300)->and(mb_strlen($cle->contexte))->toBe(200)->and($cle->ordre)->toBe(1);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-admin' && $e->rubrique === 'audio');
});

// ------------------------------------------------------------------ Recherche

it('recherche : trouve une note de vente sans tenir compte des accents ni de la casse', function () {
    ['boutique' => $b, 'user' => $proprio] = boutiquePrete();
    venteAvecTentative($b, $proprio, 'wave_manuel', vente: ['note' => 'Commande Thérèse — pagne wax']);

    $groupes = collect(connecte($proprio)->getJson('/api/v1/recherche?q=THERESE')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($groupes['ventes']['resultats'][0]['sous_titre'])->toContain('Thérèse');
    $groupes = collect($this->getJson('/api/v1/recherche?q=pagne wax')->assertOk()->json('groupes'))->keyBy('rubrique');
    expect($groupes->has('ventes'))->toBeTrue();
});

it('recherche : le caissier ne trouve ni le thème des réglages, ni l\'équipe, ni PayTech', function () {
    ['boutique' => $b] = boutiquePrete();
    ['user' => $caissier] = boutiqueAvec('caissier', $b);

    foreach (['theme', 'paytech', 'equipe', 'reglages', 'portefeuille'] as $q) {
        $urls = collect(connecte($caissier)->getJson('/api/v1/recherche?q='.$q)->assertOk()->json('groupes'))->flatMap(fn ($g) => array_column($g['resultats'], 'url'))->all();
        foreach ($urls as $url) {
            expect($url)->not->toStartWith('/reglages')->not->toStartWith('/equipe')->not->toStartWith('/portefeuille');
        }
    }
});

it('recherche : chaque résultat a la forme du contrat et des scores décroissants dans un groupe', function () {
    ['boutique' => $b, 'user' => $proprio] = boutiquePrete();
    avecBoutique($b, function () {
        foreach (['Bissap rouge', 'Bissap blanc', 'Jus de bissap', 'Bouye'] as $nom) {
            Article::create(['nom' => $nom, 'prix_xof' => 500]);
        }
    });

    $groupes = connecte($proprio)->getJson('/api/v1/recherche?q=bissap')->assertOk()->json('groupes');
    foreach ($groupes as $groupe) {
        expect(array_keys($groupe))->toBe(['rubrique', 'resultats'])->and($groupe['rubrique'])->toBeIn(['ventes', 'articles', 'equipe', 'pages']);
        $scores = array_column($groupe['resultats'], 'score');
        $tries = $scores;
        rsort($tries);
        expect($scores)->toBe($tries);
        foreach ($groupe['resultats'] as $resultat) {
            expect(array_keys($resultat))->toBe(['titre', 'sous_titre', 'url', 'score'])->and($resultat['url'])->toStartWith('/');
        }
    }
    $articles = collect($groupes)->firstWhere('rubrique', 'articles');
    expect(count($articles['resultats']))->toBe(3);
});

it('recherche : les récentes sont propres à chaque utilisateur et l\'effacement ne touche que les siennes', function () {
    ['boutique' => $b, 'user' => $proprio] = boutiquePrete();
    ['user' => $gerant] = boutiqueAvec('gerant', $b);

    connecte($gerant)->postJson('/api/v1/recherche/recentes', ['terme' => '  bazin  '])->assertNoContent();
    connecte($proprio)->postJson('/api/v1/recherche/recentes', ['terme' => 'wave'])->assertNoContent();
    $this->deleteJson('/api/v1/recherche/recentes')->assertNoContent();

    connecte($gerant)->getJson('/api/v1/recherche/recentes')->assertOk()->assertJsonPath('recentes', ['bazin']);
});

// ------------------------------------------------------------------ Import

it('import : erreurs bornées à 100 dans le rapport, total réel conservé ; rapport CSV neutralisé', function () {
    Storage::fake('local');
    ['boutique' => $b, 'user' => $proprio] = boutiquePrete();

    $lignes = ['nom;prix'];
    for ($i = 1; $i <= 130; $i++) {
        $lignes[] = "=Produit {$i};pas-un-prix";
    }
    $lignes[] = 'Bon produit;500';
    $fichier = UploadedFile::fake()->createWithContent('gros.csv', implode("\n", $lignes));

    $ulid = connecte($proprio)->post('/api/v1/imports/analyser', ['fichier' => $fichier, 'type' => 'articles'])->assertCreated()->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'ignorer_erreurs'])->assertStatus(202);

    $r = $this->getJson("/api/v1/imports/{$ulid}")->assertOk()
        ->assertJsonPath('import.statut', 'termine')->assertJsonPath('import.total', 131)->assertJsonPath('import.traitees', 131)
        ->assertJsonPath('import.creees', 1)->assertJsonCount(100, 'import.erreurs')->assertJsonPath('import.lignes_en_erreur', 130);
    expect($r->json('import.erreurs.0'))->toBe(['ligne' => 2, 'message' => 'Prix manquant ou non numérique.']);

    $rapport = $this->get("/api/v1/imports/{$ulid}/rapport")->assertOk()->streamedContent();
    expect($rapport)->toContain('Ligne;Erreur')->toContain('Total;131');
    avecBoutique($b, fn () => expect(Article::query()->pluck('nom')->all())->toBe(['Bon produit']));
});

it('import : en mode strict, toutes les lignes fautives sont listées et rien n\'est écrit', function () {
    Storage::fake('local');
    ['boutique' => $b, 'user' => $proprio] = boutiquePrete();
    $fichier = UploadedFile::fake()->createWithContent('a.csv', "nom;prix\nA;1\nB;x\nC;2\n;3\n");

    $ulid = connecte($proprio)->post('/api/v1/imports/analyser', ['fichier' => $fichier])->assertCreated()->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'creer'])->assertStatus(202);

    $this->getJson("/api/v1/imports/{$ulid}")->assertOk()
        ->assertJsonPath('import.statut', 'echoue')->assertJsonPath('import.creees', 0)
        ->assertJsonCount(2, 'import.erreurs')->assertJsonPath('import.erreurs.0.ligne', 3)->assertJsonPath('import.erreurs.1.ligne', 5);
    avecBoutique($b, fn () => expect(Article::query()->count())->toBe(0));
});

it('import : refuse un autre type que « articles » et un import d\'une autre boutique', function () {
    Storage::fake('local');
    ['user' => $proprio] = boutiquePrete();
    ['user' => $autre] = boutiquePrete();

    connecte($proprio)->post('/api/v1/imports/analyser', ['fichier' => UploadedFile::fake()->createWithContent('a.csv', "nom;prix\nA;1\n"), 'type' => 'ventes'])->assertStatus(422)->assertJsonValidationErrors(['type']);
    $ulid = $this->post('/api/v1/imports/analyser', ['fichier' => UploadedFile::fake()->createWithContent('a.csv', "nom;prix\nA;1\n")])->assertCreated()->json('import.ulid');

    connecte($autre)->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'creer'])->assertNotFound();
    $this->get("/api/v1/imports/{$ulid}/rapport")->assertNotFound();
    expect(Import::toutesBoutiques()->where('ulid', $ulid)->value('statut'))->toBe('analyse');
});

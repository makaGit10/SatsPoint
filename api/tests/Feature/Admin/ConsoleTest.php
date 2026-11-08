<?php

use App\Models\Audio;
use App\Models\Boutique;
use App\Models\CleAudio;
use App\Models\ComptePaytech;
use App\Models\JournalAudit;
use App\Models\Vente;
use App\Services\DeuxFacteurs;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| Console plateforme (CAHIER § 6.16) : droits, liste des boutiques (agrégats seulement), suspension,
| santé, journal, statistiques du pitch.
|--------------------------------------------------------------------------
*/

it('réserve la console au super-admin : propriétaire, gérant, caissier et anonyme sont refusés', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);

    foreach ([$proprio, $gerant, $caissier] as $user) {
        connecte($user)->getJson('/api/v1/admin/boutiques')->assertForbidden()->assertJsonPath('code', 'INTERDIT');
        $this->patchJson("/api/v1/admin/boutiques/{$boutique->ulid}", ['statut' => 'suspendue'])->assertForbidden();
        $this->getJson('/api/v1/admin/sante')->assertForbidden();
        $this->getJson('/api/v1/admin/journal')->assertForbidden();
        $this->getJson('/api/v1/admin/statistiques')->assertForbidden();
    }

    app('auth')->forgetGuards();
    $this->flushSession();
    $this->getJson('/api/v1/admin/boutiques')->assertUnauthorized();
    expect($boutique->fresh()->statut)->toBe('active');
});

it('liste les boutiques avec propriétaire, configuration et activité EN NOMBRE, sans aucune donnée de vente ni secret', function () {
    adminConsole();

    ['boutique' => $a, 'user' => $proprioA] = boutiquePrete();
    avecBoutique($a, fn () => ComptePaytech::create(['api_key_chiffree' => 'CLE-ULTRA-SECRETE', 'api_secret_chiffree' => 'SECRET-ULTRA', 'environnement' => 'test', 'statut' => 'actif']));
    venteAvecTentative($a, $proprioA, 'wave_manuel', vente: ['montant_xof' => 12345, 'note' => 'note confidentielle']);
    venteAvecTentative($a, $proprioA, 'wave_manuel', vente: ['montant_xof' => 500]);
    $ancienne = venteAvecTentative($a, $proprioA, 'wave_manuel', vente: ['montant_xof' => 700]);
    Vente::toutesBoutiques()->whereKey($ancienne['vente']->id)->update(['created_at' => now()->subDays(10)]);

    ['boutique' => $b, 'user' => $proprioB] = boutiqueAvec('proprietaire', Boutique::factory()->create(['nom' => 'Chez Thérèse', 'ville' => 'Thiès']));

    $liste = $this->getJson('/api/v1/admin/boutiques')->assertOk()->assertJsonCount(2, 'boutiques')->assertJsonPath('curseur_suivant', null);

    $ligneA = collect($liste->json('boutiques'))->firstWhere('ulid', $a->ulid);
    expect(array_keys($ligneA))->toBe(['ulid', 'nom', 'ville', 'statut', 'cree_le', 'proprietaire', 'configuration', 'activite'])
        ->and($ligneA['proprietaire'])->toBe(['nom' => $proprioA->nom, 'contact' => $proprioA->email])
        ->and($ligneA['configuration'])->toBe(['wallet' => true, 'paytech' => true, 'paiement_test' => false])
        ->and($ligneA['activite']['ventes_7j'])->toBe(2)
        ->and($ligneA['activite']['derniere_vente_le'])->not->toBeNull();

    $ligneB = collect($liste->json('boutiques'))->firstWhere('ulid', $b->ulid);
    expect($ligneB['configuration'])->toBe(['wallet' => false, 'paytech' => false, 'paiement_test' => false])
        ->and($ligneB['activite'])->toBe(['ventes_7j' => 0, 'derniere_vente_le' => null]);

    // Rien de métier ne fuit : ni montants, ni notes, ni secrets, ni URI.
    $contenu = strtolower($liste->getContent());
    foreach (['12345', 'confidentielle', 'cle-ultra', 'secret-ultra', 'mock://', 'uri_chiffree', 'api_key', 'reglages', 'wave_lien'] as $interdit) {
        expect($contenu)->not->toContain($interdit);
    }

    // Recherche (accents / casse) et filtre de statut.
    $this->getJson('/api/v1/admin/boutiques?q=therese')->assertOk()->assertJsonCount(1, 'boutiques')->assertJsonPath('boutiques.0.ulid', $b->ulid);
    $this->getJson('/api/v1/admin/boutiques?q=THIES')->assertOk()->assertJsonCount(1, 'boutiques');
    $this->getJson("/api/v1/admin/boutiques?q={$a->ulid}")->assertOk()->assertJsonCount(1, 'boutiques');
    $this->getJson('/api/v1/admin/boutiques?statut=suspendue')->assertOk()->assertJsonCount(0, 'boutiques');
    $this->getJson('/api/v1/admin/boutiques?statut=bizarre')->assertStatus(422);

    // Pagination par curseur.
    $page1 = $this->getJson('/api/v1/admin/boutiques?limite=1')->assertOk()->assertJsonCount(1, 'boutiques');
    expect($page1->json('curseur_suivant'))->toBeString();
    $this->getJson('/api/v1/admin/boutiques?limite=1&curseur='.$page1->json('curseur_suivant'))->assertOk()->assertJsonCount(1, 'boutiques')->assertJsonPath('curseur_suivant', null);
});

it('le super-admin n\'a aucun accès aux ventes, au portefeuille, aux articles ni aux réglages d\'une boutique', function () {
    adminConsole();
    ['boutique' => $a, 'user' => $proprioA] = boutiquePrete();
    ['vente' => $vente, 'paiement' => $paiement] = venteAvecTentative($a, $proprioA, 'wave_manuel');

    $this->getJson('/api/v1/ventes')->assertNotFound();
    $this->getJson("/api/v1/ventes/{$vente->ulid}")->assertNotFound();
    $this->getJson("/api/v1/paiements/{$paiement->ulid}")->assertNotFound();
    $this->getJson('/api/v1/wallet')->assertNotFound();
    $this->getJson('/api/v1/boutique')->assertNotFound();
    $this->getJson('/api/v1/articles')->assertNotFound();
    $this->getJson('/api/v1/equipe')->assertNotFound();
    $this->getJson('/api/v1/tableau-de-bord')->assertNotFound();
    $this->getJson('/api/v1/exports/ventes')->assertNotFound();
    $this->getJson('/api/v1/recherche?q=test')->assertNotFound();
    $this->postJson("/api/v1/paiements/{$paiement->ulid}/confirmer-manuellement", ['confirmation' => true])->assertNotFound();
});

it('suspend une boutique (membres déconnectés, accès coupé, journal) puis la réactive', function () {
    $admin = adminConsole();
    ['boutique' => $a, 'user' => $proprio] = boutiquePrete();
    ['user' => $caissier] = boutiqueAvec('caissier', $a);

    // Le propriétaire a une session ouverte.
    connecte($proprio)->postJson('/api/v1/auth/connexion', ['identifiant' => $proprio->email, 'password' => MDP_TEST])->assertOk();
    $this->getJson('/api/v1/ventes')->assertOk();

    // Suspension par le super-admin.
    connecte($admin);
    session()->put(DeuxFacteurs::CLE_SESSION, now()->toIso8601String());
    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'suspendue'])->assertOk()
        ->assertJsonPath('boutique.ulid', $a->ulid)->assertJsonPath('boutique.statut', 'suspendue');
    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'fermee'])->assertStatus(422);
    $this->patchJson('/api/v1/admin/boutiques/01JCFXAMPK0000000000000ABC', ['statut' => 'suspendue'])->assertNotFound();

    expect($a->fresh()->statut)->toBe('suspendue')
        ->and($proprio->fresh()->sessions_revoquees_at)->not->toBeNull()
        ->and($caissier->fresh()->sessions_revoquees_at)->not->toBeNull();

    $journal = JournalAudit::query()->where('action', 'plateforme.boutique_suspendue')->first();
    expect($journal)->not->toBeNull()->and($journal->user_id)->toBe($admin->id)->and($journal->details['apres'])->toBe('suspendue');

    // Session du propriétaire révoquée (401), et même une nouvelle connexion se heurte à BOUTIQUE_SUSPENDUE (403).
    connecte($proprio);
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => $proprio->email, 'password' => MDP_TEST])->assertOk();
    $this->getJson('/api/v1/moi')->assertOk(); // le front peut afficher l'explication
    $this->getJson('/api/v1/ventes')->assertForbidden()->assertJsonPath('code', 'BOUTIQUE_SUSPENDUE');
    $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'])->assertForbidden();

    // Réactivation.
    connecte($admin);
    session()->put(DeuxFacteurs::CLE_SESSION, now()->toIso8601String());
    $this->patchJson("/api/v1/admin/boutiques/{$a->ulid}", ['statut' => 'active'])->assertOk()->assertJsonPath('boutique.statut', 'active');
    expect(JournalAudit::query()->where('action', 'plateforme.boutique_reactivee')->count())->toBe(1);

    connecte($proprio);
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => $proprio->email, 'password' => MDP_TEST])->assertOk();
    $this->getJson('/api/v1/ventes')->assertOk();
});

it('expose la santé détaillée (dépendances, files, espace audio) et le journal d\'audit filtrable', function () {
    Http::fake(['*' => Http::response('', 500)]);
    $admin = adminConsole();

    $this->getJson('/api/v1/admin/sante')->assertOk()
        ->assertJsonStructure(['statut', 'base', 'redis', 'reverb', 'passerelle', 'cours' => ['age_s', 'disponible', 'sources', 'recupere_le'], 'files' => ['en_attente', 'par_file' => ['paiements', 'audio', 'imports', 'default'], 'connexion', 'echouees', 'echouees_24h'], 'audio' => ['fichiers', 'publies', 'octets', 'disque_libre_octets'], 'version', 'horodatage'])
        ->assertJsonPath('base', true)->assertJsonPath('files.echouees', 0)->assertJsonPath('files.en_attente', 0)->assertJsonPath('audio.fichiers', 0)->assertJsonPath('audio.octets', 0)
        ->assertHeader('Cache-Control', 'no-store, private');

    // Journal : quelques actions de deux boutiques.
    ['boutique' => $a, 'user' => $proprioA] = boutiqueAvec('proprietaire');
    ['boutique' => $b, 'user' => $proprioB] = boutiqueAvec('proprietaire');
    connecte($proprioA)->postJson('/api/v1/articles', ['nom' => 'Pain', 'prix_xof' => 150])->assertCreated();
    connecte($proprioB)->postJson('/api/v1/articles', ['nom' => 'Lait', 'prix_xof' => 500])->assertCreated();
    $this->patchJson('/api/v1/boutique', ['nom' => 'B renommée'])->assertOk();

    connecte($admin);
    session()->put(DeuxFacteurs::CLE_SESSION, now()->toIso8601String());

    $tout = $this->getJson('/api/v1/admin/journal')->assertOk()->assertJsonStructure(['entrees' => [['id', 'action', 'utilisateur', 'boutique', 'ip', 'details', 'cree_le']], 'curseur_suivant']);
    expect(count($tout->json('entrees')))->toBeGreaterThanOrEqual(3)
        ->and($tout->json('entrees.0.cree_le'))->toBeString(); // le plus récent d'abord

    $this->getJson('/api/v1/admin/journal?action=article.cree')->assertOk()->assertJsonCount(2, 'entrees')->assertJsonPath('entrees.0.action', 'article.cree');
    $this->getJson("/api/v1/admin/journal?boutique={$a->ulid}")->assertOk()->assertJsonCount(1, 'entrees')->assertJsonPath('entrees.0.boutique.ulid', $a->ulid)->assertJsonPath('entrees.0.utilisateur.ulid', $proprioA->ulid);
    $this->getJson("/api/v1/admin/journal?utilisateur={$proprioB->ulid}")->assertOk()->assertJsonCount(2, 'entrees');
    $this->getJson('/api/v1/admin/journal?action=article.*')->assertOk()->assertJsonCount(2, 'entrees');
    $this->getJson('/api/v1/admin/journal?du='.now()->addDay()->toDateString())->assertOk()->assertJsonCount(0, 'entrees');
    $this->getJson('/api/v1/admin/journal?du='.now()->subDay()->toDateString().'&au='.now()->toDateString().'&limite=2')->assertOk()->assertJsonCount(2, 'entrees');
    $this->getJson('/api/v1/admin/journal?action=DROP TABLE')->assertStatus(422);
    $this->getJson('/api/v1/admin/journal?boutique=1')->assertStatus(422);

    // Les détails ne contiennent jamais de secret (déjà assainis à l'écriture).
    expect(strtolower($tout->getContent()))->not->toContain('password')->not->toContain('secret');
});

it('calcule les indicateurs du pitch sur les paiements réussis et la couverture audio', function () {
    adminConsole();

    ['boutique' => $a, 'user' => $proprioA] = boutiquePrete();
    ['boutique' => $b, 'user' => $proprioB] = boutiquePrete();
    ['boutique' => $c, 'user' => $proprioC] = boutiquePrete();

    $regler = function (array $t, string $methode, int $delaiS, int $ageJours = 0) {
        $t['paiement']->forceFill(['statut' => 'reussi', 'methode' => $methode, 'created_at' => now()->subDays($ageJours)->subSeconds($delaiS), 'regle_at' => now()->subDays($ageJours)])->saveQuietly();
    };

    // A : 2 Lightning cette semaine (délais 4 s et 8 s), B : 1 mobile money cette semaine (délai 20 s), C : 1 Lightning il y a 20 jours (délai 100 s), + 1 en attente (ignoré).
    $regler(venteAvecTentative($a, $proprioA), 'lightning', 4);
    $regler(venteAvecTentative($a, $proprioA), 'lightning', 8);
    $regler(venteAvecTentative($b, $proprioB, 'wave_manuel'), 'wave_manuel', 20);
    $regler(venteAvecTentative($c, $proprioC), 'lightning', 100, 20);
    venteAvecTentative($c, $proprioC, 'wave_manuel');

    $cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']);
    CleAudio::create(['cle' => 'nav.ventes', 'ecran' => 'navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales']);
    CleAudio::create(['cle' => 'hors.code', 'ecran' => 'x', 'texte_fr' => 'x', 'texte_en' => 'x', 'presente_dans_code' => false]);
    Audio::create(['cle_audio_id' => $cle->id, 'langue' => 'wo', 'chemin' => 'audio/wo/caisse.encaisser.aaaaaaaa.mp3', 'empreinte' => str_repeat('a', 64), 'statut' => 'publie', 'publie_at' => now()]);
    Audio::create(['cle_audio_id' => $cle->id, 'langue' => 'fr', 'chemin' => 'audio/fr/caisse.encaisser.bbbbbbbb.mp3', 'empreinte' => str_repeat('b', 64), 'statut' => 'brouillon']);

    $this->getJson('/api/v1/admin/statistiques')->assertOk()
        ->assertJsonPath('commercants_actifs_semaine', 2)
        ->assertJsonPath('paiements_par_commercant_semaine', 1.5)
        ->assertJsonPath('delai_median_confirmation_ms', 14000)      // médiane de 4 s, 8 s, 20 s, 100 s → (8 + 20) / 2
        ->assertJsonPath('part_sats_pct', 75)
        ->assertJsonPath('part_mobile_money_pct', 25)
        ->assertJsonPath('paiements_reussis_30j', 4)
        ->assertJsonPath('boutiques.total', 3)
        ->assertJsonPath('couverture_audio', ['wo' => 50, 'srr' => 0, 'ff' => 0, 'dyo' => 0, 'fr' => 0]);
});

<?php

use App\Events\DonneesModifiees;
use App\Jobs\ExecuterImport;
use App\Models\Article;
use App\Models\Import;
use App\Models\JournalAudit;
use App\Services\BoutiqueCourante;
use App\Services\Import\ImportArticles;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Reader\XLSX\Reader;
use OpenSpout\Writer\XLSX\Writer;

/*
|--------------------------------------------------------------------------
| Import d'articles (analyse, suggestions, exécution, erreurs) et exports (CSV / XLSX / PDF) — CAHIER § 6.15
|--------------------------------------------------------------------------
*/

function csvUpload(string $contenu, string $nom = 'articles.csv'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($nom, $contenu);
}

function xlsxUpload(array $lignes): UploadedFile
{
    $chemin = tempnam(sys_get_temp_dir(), 'satspoint-test-').'.xlsx';
    $w = new Writer;
    $w->openToFile($chemin);
    foreach ($lignes as $l) {
        $w->addRow(Row::fromValues($l));
    }
    $w->close();

    return new UploadedFile($chemin, 'catalogue.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', null, true);
}

beforeEach(function () {
    Storage::fake('local');
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiquePrete();
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
});

it('analyse un CSV Windows-1252 « ; » : colonnes, aperçu (10 lignes), suggestions FR/EN ; refuse le caissier et les faux fichiers', function () {
    Queue::fake();
    $lignes = ['Désignation;Tarif TTC;Rayon;Réf. article;Couleur;En vente'];
    for ($i = 1; $i <= 12; $i++) {
        $lignes[] = "Produit {$i};{$i}500;Épicerie;P-{$i};#FF0000;oui";
    }
    $csv = mb_convert_encoding(implode("\r\n", $lignes), 'Windows-1252', 'UTF-8');

    connecte($this->caissier)->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv)])->assertForbidden();

    $r = connecte($this->gerant)->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv)])->assertCreated()
        ->assertJsonPath('champs', ['nom', 'prix_xof', 'categorie', 'sku', 'couleur', 'actif'])
        ->assertJsonPath('import.statut', 'analyse')
        ->assertJsonPath('import.format', 'csv')
        ->assertJsonPath('import.encodage', 'Windows-1252')
        ->assertJsonPath('import.separateur', ';')
        ->assertJsonPath('import.colonnes', ['Désignation', 'Tarif TTC', 'Rayon', 'Réf. article', 'Couleur', 'En vente'])
        ->assertJsonPath('import.total', 12)
        ->assertJsonCount(10, 'import.apercu')
        ->assertJsonPath('import.apercu.0', ['Produit 1', '1500', 'Épicerie', 'P-1', '#FF0000', 'oui'])
        ->assertJsonPath('import.suggestions', ['Désignation' => 'nom', 'Tarif TTC' => 'prix_xof', 'Rayon' => 'categorie', 'Réf. article' => 'sku', 'Couleur' => 'couleur', 'En vente' => 'actif'])
        ->assertJsonPath('import.rapport_url', null);

    expect($r->getContent())->not->toContain('imports/'); // chemin serveur jamais exposé
    $import = Import::query()->where('ulid', $r->json('import.ulid'))->first();
    expect(Storage::disk('local')->exists($import->fichier))->toBeTrue()->and($import->fichier)->toBe('imports/'.$import->ulid.'.csv');

    // Suggestions anglaises + colonne inconnue → null.
    $en = $this->post('/api/v1/imports/analyser', ['fichier' => csvUpload("Name,Price,Category,SKU,Notes\nTea,500,Drinks,T1,hello")])->assertCreated();
    expect($en->json('import.separateur'))->toBe(',')
        ->and($en->json('import.suggestions'))->toBe(['Name' => 'nom', 'Price' => 'prix_xof', 'Category' => 'categorie', 'SKU' => 'sku', 'Notes' => null]);

    // Faux fichiers.
    $this->post('/api/v1/imports/analyser', ['fichier' => csvUpload("seulement un en-tête\n")])->assertStatus(422)->assertJsonPath('code', 'IMPORT_VIDE');
    $this->post('/api/v1/imports/analyser', ['fichier' => UploadedFile::fake()->createWithContent('a.xlsx', "\x00\x01binaire")])->assertStatus(422);
    $this->post('/api/v1/imports/analyser', ['fichier' => UploadedFile::fake()->createWithContent('a.xlsx', "PK\x03\x04pas un vrai zip")])->assertStatus(422)->assertJsonPath('code', 'FICHIER_ILLISIBLE');
    $this->post('/api/v1/imports/analyser', ['fichier' => UploadedFile::fake()->create('gros.csv', 2049, 'text/csv')])->assertStatus(422)->assertJsonValidationErrors(['fichier']);
    $this->post('/api/v1/imports/analyser', [])->assertStatus(422);
});

it('analyse un vrai classeur XLSX puis exécute l\'import en file : créations, mises à jour, erreurs, progression, rapport, correspondance mémorisée', function () {
    avecBoutique($this->boutique, fn () => Article::create(['nom' => 'Café Touba', 'prix_xof' => 200, 'sku' => 'CAFE', 'position' => 1]));

    $fichier = xlsxUpload([
        ['Libellé', 'PU', 'Famille', 'Code', 'Actif'],
        ['Bissap', 300, 'Boissons', 'BIS', 'oui'],
        ['Café Touba', 250, 'Boissons', 'CAFE', 'non'],       // mise à jour par SKU
        ['', 100, '', '', ''],                                  // erreur : nom manquant
        ['Pain', 'gratuit', 'Boulangerie', '', ''],             // erreur : prix
        ['Beignets', '1 250', 'Boulangerie', 'BEI 1', ''],      // erreur : sku invalide (espace)
        ['Thiéboudienne', '1500,00', 'Plats', 'THIEB', 'true'],
    ]);

    $r = connecte($this->proprio)->post('/api/v1/imports/analyser', ['fichier' => $fichier])->assertCreated()
        ->assertJsonPath('import.format', 'xlsx')->assertJsonPath('import.total', 6)
        ->assertJsonPath('import.suggestions', ['Libellé' => 'nom', 'PU' => 'prix_xof', 'Famille' => 'categorie', 'Code' => 'sku', 'Actif' => 'actif'])
        ->assertJsonPath('import.apercu.0', ['Bissap', '300', 'Boissons', 'BIS', 'oui']);
    $ulid = $r->json('import.ulid');

    // Correspondance invalide : champ obligatoire absent, colonne inconnue, champ en double, mode inconnu.
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['Libellé' => 'nom'], 'mode' => 'creer'])->assertStatus(422)->assertJsonPath('code', 'CORRESPONDANCE_INVALIDE');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['Libellé' => 'nom', 'Inconnue' => 'prix_xof'], 'mode' => 'creer'])->assertStatus(422)->assertJsonPath('code', 'CORRESPONDANCE_INVALIDE');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['Libellé' => 'nom', 'PU' => 'nom'], 'mode' => 'creer'])->assertStatus(422);
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['Libellé' => 'nom', 'PU' => 'prix_xof'], 'mode' => 'ecraser'])->assertStatus(422);
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['Libellé' => 'nom', 'PU' => 'prix_xof', 'Famille' => 'inexistant'], 'mode' => 'creer'])->assertStatus(422);

    // Le job est mis en file (file « imports ») puis exécuté ici.
    Queue::fake();
    Event::fake([DonneesModifiees::class]);
    $correspondance = ['Libellé' => 'nom', 'PU' => 'prix_xof', 'Famille' => 'categorie', 'Code' => 'sku', 'Actif' => 'actif'];
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => $correspondance, 'mode' => 'ignorer_erreurs'])->assertStatus(202)
        ->assertJsonPath('import.statut', 'en_cours')->assertJsonPath('import.mode', 'ignorer_erreurs')->assertJsonPath('import.total', 6);
    Queue::assertPushed(ExecuterImport::class, fn (ExecuterImport $j) => $j->queue === 'imports');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => $correspondance, 'mode' => 'creer'])->assertStatus(409)->assertJsonPath('code', 'IMPORT_DEJA_EXECUTE');

    $import = Import::query()->where('ulid', $ulid)->firstOrFail();
    app(BoutiqueCourante::class)->oublier();
    (new ExecuterImport($import->id))->handle(app(ImportArticles::class), app(BoutiqueCourante::class));

    connecte($this->proprio);
    $final = $this->getJson("/api/v1/imports/{$ulid}")->assertOk()
        ->assertJsonPath('import.statut', 'termine')
        ->assertJsonPath('import.total', 6)->assertJsonPath('import.traitees', 6)
        ->assertJsonPath('import.creees', 2)->assertJsonPath('import.mises_a_jour', 1)
        ->assertJsonCount(3, 'import.erreurs')
        ->assertJsonPath('import.erreurs.0.ligne', 4)
        ->assertJsonPath('import.rapport_url', "/api/v1/imports/{$ulid}/rapport");
    expect($final->json('import.erreurs.1.message'))->toContain('Prix')->and($final->json('import.erreurs.2.message'))->toContain('Référence');

    avecBoutique($this->boutique, function () {
        expect(Article::query()->count())->toBe(3)
            ->and(Article::query()->where('sku', 'CAFE')->first()->prix_xof)->toBe(250)
            ->and(Article::query()->where('sku', 'CAFE')->first()->actif)->toBeFalse()
            ->and(Article::query()->where('sku', 'THIEB')->first()->prix_xof)->toBe(1500)
            ->and(Article::query()->where('sku', 'BIS')->first()->position)->toBe(2);
    });

    // Signaux temps réel émis par le job : imports + articles, sur le canal de la boutique.
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'imports' && $e->canal->name === 'private-boutique.'.$this->boutique->ulid);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'articles');

    // Fichier source supprimé après traitement ; rapport CSV téléchargeable ; audit.
    expect(Storage::disk('local')->exists($import->fichier))->toBeFalse();
    $rapport = $this->get("/api/v1/imports/{$ulid}/rapport")->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')->streamedContent();
    expect($rapport)->toContain('Ligne;Erreur')->toContain('4;')->toContain('Prix');
    expect(JournalAudit::query()->where('action', 'import.execute')->count())->toBe(1);

    // Correspondance mémorisée pour le prochain fichier aux colonnes identiques.
    $suivant = $this->post('/api/v1/imports/analyser', ['fichier' => xlsxUpload([['Libellé', 'PU', 'Autre'], ['X', 1, 'y']])])->assertCreated();
    expect($suivant->json('import.memorisee'))->toBe(['Libellé' => 'nom', 'PU' => 'prix_xof'])
        ->and($suivant->json('import.suggestions'))->toBe(['Libellé' => 'nom', 'PU' => 'prix_xof', 'Autre' => null]);

    // Autre boutique : 404 (anti-IDOR) ; caissier : 403.
    ['user' => $etranger] = boutiquePrete();
    connecte($etranger)->getJson("/api/v1/imports/{$ulid}")->assertNotFound();
    connecte($this->caissier)->getJson("/api/v1/imports/{$ulid}")->assertForbidden();
});

it('en mode « creer », une ligne en erreur annule tout (rien n\'est écrit) ; « creer » refuse les doublons', function () {
    $csv = "nom;prix\nBissap;300\nPain;abc\nCafé;200\n";
    $ulid = connecte($this->gerant)->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv)])->assertCreated()->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'creer'])->assertStatus(202);

    $this->getJson("/api/v1/imports/{$ulid}")->assertOk()
        ->assertJsonPath('import.statut', 'echoue')->assertJsonPath('import.creees', 0)->assertJsonCount(1, 'import.erreurs')->assertJsonPath('import.erreurs.0.ligne', 3);
    avecBoutique($this->boutique, fn () => expect(Article::query()->count())->toBe(0));

    // Fichier propre : créé ; relance en « creer » : doublons refusés ; en « creer_et_mettre_a_jour » : mis à jour.
    $csv = "nom;prix;categorie\nBissap;300;Boissons\nCafé Touba;200;Boissons\n";
    $ulid = $this->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv)])->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof', 'categorie' => 'categorie'], 'mode' => 'creer'])->assertStatus(202);
    $this->getJson("/api/v1/imports/{$ulid}")->assertJsonPath('import.statut', 'termine')->assertJsonPath('import.creees', 2);

    $csv2 = "nom;prix\nBissap;350\n";
    $ulid = $this->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv2)])->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'creer'])->assertStatus(202);
    $this->getJson("/api/v1/imports/{$ulid}")->assertJsonPath('import.statut', 'echoue')->assertJsonPath('import.erreurs.0.message', '« Bissap » existe déjà (même nom ou même référence).');

    $ulid = $this->post('/api/v1/imports/analyser', ['fichier' => csvUpload($csv2)])->json('import.ulid');
    $this->postJson("/api/v1/imports/{$ulid}/executer", ['correspondance' => ['nom' => 'nom', 'prix' => 'prix_xof'], 'mode' => 'creer_et_mettre_a_jour'])->assertStatus(202);
    $this->getJson("/api/v1/imports/{$ulid}")->assertJsonPath('import.statut', 'termine')->assertJsonPath('import.mises_a_jour', 1)->assertJsonPath('import.creees', 0);
    avecBoutique($this->boutique, fn () => expect(Article::query()->where('nom', 'Bissap')->value('prix_xof'))->toBe(350)->and(Article::query()->count())->toBe(2));
});

it('exporte les ventes en XLSX et PDF (propriétaire / gérant seulement, formules neutralisées)', function () {
    $v = venteAvecTentative($this->boutique, $this->caissier, vente: ['montant_xof' => 1000, 'note' => '=HYPERLINK("x")']);
    avecBoutique($this->boutique, function () use ($v) {
        $v['vente']->forceFill(['statut' => 'payee', 'payee_at' => now(), 'paiement_reussi_id' => $v['paiement']->id, 'recu_jeton' => 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6'])->save();
        $v['paiement']->forceFill(['statut' => 'reussi', 'regle_at' => now()])->save();
        Article::create(['nom' => '-Café', 'prix_xof' => 200, 'sku' => 'CAFE', 'position' => 1]);
        Article::create(['nom' => 'Bissap', 'prix_xof' => 300, 'actif' => false, 'position' => 2]);
    });
    venteAvecTentative($this->boutique, $this->caissier, 'wave_manuel', vente: ['montant_xof' => 300]);

    // Caissier : interdit partout.
    connecte($this->caissier)->get('/api/v1/exports/ventes?format=xlsx')->assertForbidden();
    $this->get('/api/v1/exports/ventes?format=pdf')->assertForbidden();

    connecte($this->gerant);

    // Ventes XLSX : un vrai classeur relisible.
    $xlsx = $this->get('/api/v1/exports/ventes?format=xlsx')->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect($xlsx->headers->get('Content-Disposition'))->toContain('.xlsx');
    $tmp = tempnam(sys_get_temp_dir(), 'x').'.xlsx';
    file_put_contents($tmp, $xlsx->getFile()->getContent());
    $lecteur = new Reader;
    $lecteur->open($tmp);
    $lignes = [];
    foreach ($lecteur->getSheetIterator() as $feuille) {
        foreach ($feuille->getRowIterator() as $ligne) {
            $lignes[] = $ligne->toArray();
        }
    }
    $lecteur->close();
    expect(count($lignes))->toBe(3)->and($lignes[0][0])->toBe('Numéro')->and($lignes[1][0])->toBe('V-000001')->and((int) $lignes[1][3])->toBe(1000)->and($lignes[1][10])->toBe("'=HYPERLINK(\"x\")");

    // Ventes PDF : rapport journalier.
    $pdf = $this->get('/api/v1/exports/ventes?format=pdf&periode=aujourdhui')->assertOk()->assertHeader('Content-Type', 'application/pdf');
    expect($pdf->headers->get('Content-Disposition'))->toContain('.pdf')->and(substr($pdf->getContent(), 0, 5))->toBe('%PDF-');
    $this->get('/api/v1/exports/ventes?format=docx')->assertStatus(422);
    expect(JournalAudit::query()->where('action', 'export.ventes')->count())->toBe(2);
});

it('exporte les articles en CSV / XLSX (formules neutralisées, filtre actifs)', function () {
    avecBoutique($this->boutique, function () {
        Article::create(['nom' => '-Café', 'prix_xof' => 200, 'sku' => 'CAFE', 'position' => 1]);
        Article::create(['nom' => 'Bissap', 'prix_xof' => 300, 'actif' => false, 'position' => 2]);
    });
    connecte($this->caissier)->get('/api/v1/exports/articles')->assertForbidden();
    connecte($this->gerant);

    // Articles CSV / XLSX.
    $csv = $this->get('/api/v1/exports/articles?format=csv')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')->streamedContent();
    expect(substr($csv, 0, 3))->toBe("\xEF\xBB\xBF")->and($csv)->toContain('Nom;"Prix (FCFA)";Catégorie;Référence;Couleur;Actif;Position')->toContain("'-Café;200;;CAFE;;Oui;1")->toContain('Bissap;300;;;;Non;2');
    $actifs = $this->get('/api/v1/exports/articles?format=csv&actifs=1')->assertOk()->streamedContent();
    expect($actifs)->not->toContain('Bissap');
    $this->get('/api/v1/exports/articles?format=xlsx')->assertOk()->assertHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    $this->get('/api/v1/exports/articles?format=pdf')->assertStatus(422);
    expect(JournalAudit::query()->where('action', 'export.articles')->count())->toBe(3);
});

it('exporte les paiements en CSV : hash abrégé, aucun jeton PayTech, filtres validés', function () {
    $v = venteAvecTentative($this->boutique, $this->caissier, vente: ['montant_xof' => 1000]);
    avecBoutique($this->boutique, function () use ($v) {
        $v['vente']->forceFill(['statut' => 'payee', 'payee_at' => now(), 'paiement_reussi_id' => $v['paiement']->id])->save();
        $v['paiement']->forceFill(['statut' => 'reussi', 'regle_at' => now()])->save();
    });
    venteAvecTentative($this->boutique, $this->caissier, 'wave_manuel', vente: ['montant_xof' => 300]);
    connecte($this->caissier)->get('/api/v1/exports/paiements')->assertForbidden();
    connecte($this->proprio);

    // Paiements CSV : hash abrégé seulement, jamais de jeton PayTech.
    $paiements = $this->get('/api/v1/exports/paiements?periode=7j')->assertOk()->assertHeader('Content-Type', 'text/csv; charset=UTF-8')->streamedContent();
    expect($paiements)->toContain('Vente;Date;Heure;Moyen;Opérateur;Statut;"Montant (FCFA)"')->toContain('V-000001;')->toContain(';Réussi;1000;228;')->toContain(substr(HASH_TEST, 0, 8).';')->not->toContain(HASH_TEST);
    expect(count(explode("\n", trim($paiements))))->toBe(3);
    $this->get('/api/v1/exports/paiements?statut=reussi')->assertOk();
    $this->get('/api/v1/exports/paiements?statut=bidon')->assertStatus(422);

    expect(JournalAudit::query()->where('action', 'export.paiements')->count())->toBe(2);
});

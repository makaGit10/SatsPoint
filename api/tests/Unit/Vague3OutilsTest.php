<?php

use App\Exceptions\ErreurMetier;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\InspecteurAudio;
use App\Services\ExportVentes;
use App\Services\Import\ImportArticles;
use App\Services\Import\SuggestionsColonnes;
use App\Services\RechercheGlobale;

/*
|--------------------------------------------------------------------------
| Vague 3 — outils purs : signatures de fichiers, clés vocales, suggestions de colonnes,
| normalisation des lignes importées, neutralisation des formules, similarité de recherche.
|--------------------------------------------------------------------------
*/

function fichierTemporaire(string $contenu): string
{
    $chemin = tempnam(sys_get_temp_dir(), 'satspoint-unit-');
    file_put_contents($chemin, $contenu);

    return $chemin;
}

it('reconnaît le type réel d\'un audio par sa signature, jamais par son nom', function (string $contenu, ?string $attendu) {
    $inspecteur = new InspecteurAudio('ffprobe');

    expect($inspecteur->formatParSignature(fichierTemporaire($contenu)))->toBe($attendu);
})->with([
    'mp3 avec ID3' => ['ID3'.str_repeat("\x00", 20), 'mp3'],
    'mp3 sans ID3 (trame)' => ["\xFF\xFB\x90\x64".str_repeat("\x00", 20), 'mp3'],
    'wav' => ['RIFF'."\x24\x00\x00\x00".'WAVEfmt '.str_repeat("\x00", 10), 'wav'],
    'ogg' => ['OggS'.str_repeat("\x00", 20), 'ogg'],
    'webm (EBML)' => ["\x1A\x45\xDF\xA3".str_repeat("\x00", 20), 'webm'],
    'm4a (ftyp)' => ["\x00\x00\x00\x20".'ftypM4A '.str_repeat("\x00", 12), 'm4a'],
    'texte' => ['<?php echo "pirate"; ?> et du texte en plus', null],
    'html' => ['<html><body>salut</body></html>', null],
    'zip' => ["PK\x03\x04".str_repeat("\x00", 20), null],
    'RIFF non WAVE (avi)' => ['RIFF'."\x24\x00\x00\x00".'AVI LIST'.str_repeat("\x00", 10), null],
    'trop court' => ['ID3', null],
]);

it('n\'accepte que des clés vocales de la forme « ecran.action » (aucune traversée de chemin)', function (string $cle, bool $valide) {
    expect(CleAudio::estValide($cle))->toBe($valide);
})->with([
    ['caisse.encaisser', true],
    ['reglages.theme.sombre', true],
    ['nav.tableau_de_bord', true],
    ['paiement.mobile-money', true],
    ['encaisser', false],
    ['../../etc/passwd', false],
    ['caisse/encaisser', false],
    ['caisse..encaisser', false],
    ['.caisse', false],
    ['caisse.', false],
    ['caisse.encaisser.mp3%00', false],
    ['caisse encaisser', false],
]);

it('nomme les fichiers audio {cle}.{empreinte8}.mp3 dans audio/{langue}/', function () {
    $empreinte = hash('sha256', 'x');

    expect(Audio::nomFichier('caisse.encaisser', $empreinte))->toBe('caisse.encaisser.'.substr($empreinte, 0, 8).'.mp3')
        ->and(Audio::cheminPublic('wo', 'caisse.encaisser', $empreinte))->toBe('audio/wo/caisse.encaisser.'.substr($empreinte, 0, 8).'.mp3');
});

it('suggère le bon champ pour les en-têtes courants (synonymes FR / EN, accents, casse, similarité)', function (string $entete, ?string $champ) {
    expect(app(SuggestionsColonnes::class)->suggerer([$entete])[$entete])->toBe($champ);
})->with([
    ['Désignation', 'nom'],
    ['LIBELLÉ', 'nom'],
    ['Product name', 'nom'],
    ['Tarif', 'prix_xof'],
    ['PU', 'prix_xof'],
    ['Unit price', 'prix_xof'],
    ['Prix (FCFA)', 'prix_xof'],
    ['Famille', 'categorie'],
    ['Category', 'categorie'],
    ['Réf.', 'sku'],
    ['Code-barres', 'sku'],
    ['Colour', 'couleur'],
    ['Disponible', 'actif'],
    ['Commentaire interne', null],
]);

it('n\'attribue jamais le même champ à deux colonnes', function () {
    $s = app(SuggestionsColonnes::class)->suggerer(['Nom', 'Désignation', 'Prix', 'Tarif']);

    expect($s)->toBe(['Nom' => 'nom', 'Désignation' => null, 'Prix' => 'prix_xof', 'Tarif' => null]);
});

it('normalise une ligne importée valide (prix, couleur, actif)', function (array $valeurs, array $attendu) {
    expect(app(ImportArticles::class)->normaliserLigne($valeurs))->toMatchArray($attendu);
})->with([
    'prix avec espaces' => [['nom' => ' Bissap ', 'prix_xof' => '1 500'], ['nom' => 'Bissap', 'prix_xof' => 1500, 'actif' => null]],
    'prix décimal à virgule' => [['nom' => 'Pain', 'prix_xof' => '150,00'], ['prix_xof' => 150]],
    'prix avec devise' => [['nom' => 'Pain', 'prix_xof' => '200 FCFA'], ['prix_xof' => 200]],
    'couleur sans dièse' => [['nom' => 'Pain', 'prix_xof' => '1', 'couleur' => 'ff8800'], ['couleur' => '#FF8800']],
    'actif « non »' => [['nom' => 'Pain', 'prix_xof' => '1', 'actif' => 'non'], ['actif' => false]],
    'actif « yes »' => [['nom' => 'Pain', 'prix_xof' => '1', 'actif' => 'Yes'], ['actif' => true]],
    'sku et catégorie' => [['nom' => 'Pain', 'prix_xof' => '1', 'sku' => 'PAIN-01', 'categorie' => 'Boulangerie'], ['sku' => 'PAIN-01', 'categorie' => 'Boulangerie']],
]);

it('rejette une ligne importée invalide avec un message utile', function (array $valeurs, string $extrait) {
    expect(fn () => app(ImportArticles::class)->normaliserLigne($valeurs))
        ->toThrow(ErreurMetier::class, $extrait);
})->with([
    'nom vide' => [['nom' => '  ', 'prix_xof' => '100'], 'Nom manquant'],
    'nom trop long' => [['nom' => str_repeat('a', 121), 'prix_xof' => '100'], 'Nom manquant ou trop long'],
    'prix texte' => [['nom' => 'Pain', 'prix_xof' => 'gratuit'], 'Prix manquant'],
    'prix négatif' => [['nom' => 'Pain', 'prix_xof' => '-5'], 'Prix hors bornes'],
    'prix énorme' => [['nom' => 'Pain', 'prix_xof' => '60000000'], 'Prix hors bornes'],
    'sku avec espace' => [['nom' => 'Pain', 'prix_xof' => '1', 'sku' => 'A B'], 'Référence invalide'],
    'couleur invalide' => [['nom' => 'Pain', 'prix_xof' => '1', 'couleur' => 'rouge'], 'Couleur invalide'],
    'actif inconnu' => [['nom' => 'Pain', 'prix_xof' => '1', 'actif' => 'peut-être'], 'actif'],
]);

it('neutralise l\'injection de formule dans les exports (= + - @)', function (?string $entree, string $sortie) {
    expect(ExportVentes::assainir($entree))->toBe($sortie);
})->with([
    ['=HYPERLINK("http://x")', '\'=HYPERLINK("http://x")'],
    ['+33 6 12', "'+33 6 12"],
    ['-2+3', "'-2+3"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['Bazin riche', 'Bazin riche'],
    [null, ''],
]);

it('normalise et compare les termes de recherche (accents, casse, fautes)', function (string $terme, string $candidat, float $minimum) {
    expect(RechercheGlobale::similarite(RechercheGlobale::normaliser($terme), RechercheGlobale::normaliser($candidat)))->toBeGreaterThanOrEqual($minimum);
})->with([
    ['portfeuille', 'Portefeuille', 0.8],
    ['RÉGLAGES', 'reglages', 1.0],
    ['thème', 'Thème (clair / sombre)', 0.85],
    ['wallet', 'Wallet connection (NWC)', 0.85],
    ['equipe', 'Équipe', 1.0],
]);

it('ne rapproche pas des termes sans rapport', function () {
    expect(RechercheGlobale::similarite('bazin', 'portefeuille'))->toBeLessThan(0.6);
});

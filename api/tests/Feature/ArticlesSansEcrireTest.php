<?php

use App\Events\DonneesModifiees;
use App\Models\Article;
use App\Models\ArticleFichier;
use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\Vente;
use App\Services\Articles\TraitementImage;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

/*
|--------------------------------------------------------------------------
| Articles utilisables sans lire ni écrire (CONTRAT_API § 15)
|--------------------------------------------------------------------------
| Pictogramme, photo prise au téléphone (ré-encodée en WebP, EXIF retirées) et nom dit à voix haute
| (ré-encodé en MP3), contenus en base, servis par une route authentifiée et cloisonnée par boutique.
*/

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiqueAvec('proprietaire');
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
});

/** Fichier temporaire de test (supprimé par PHP en fin de requête ou laissé dans /tmp). */
function fichierTemporaire(string $contenu, string $nom, string $mime): UploadedFile
{
    $chemin = tempnam(sys_get_temp_dir(), 'sp-test-');
    file_put_contents($chemin, $contenu);

    return new UploadedFile($chemin, $nom, $mime, null, true);
}

/**
 * JPEG de $l × $h (moitié gauche bleue, moitié droite rouge) avec un bloc EXIF : orientation + description
 * contenant $secret (comme des coordonnées GPS ou un modèle d'appareil qu'il ne faut jamais republier).
 */
function jpegAvecExif(int $l = 800, int $h = 400, int $orientation = 6, string $secret = 'SECRET-GPS-14.6928N'): UploadedFile
{
    $image = imagecreatetruecolor($l, $h);
    imagefill($image, 0, 0, imagecolorallocate($image, 220, 30, 30));
    imagefilledrectangle($image, 0, 0, intdiv($l, 2), $h, imagecolorallocate($image, 20, 110, 230));
    ob_start();
    imagejpeg($image, null, 90);
    $jpeg = (string) ob_get_clean();
    imagedestroy($image);

    $description = $secret."\0";
    $ifd = 8;
    $donnees = $ifd + 2 + 2 * 12 + 4;
    $tiff = 'II'.pack('v', 42).pack('V', $ifd)
        .pack('v', 2)
        .pack('vvV', 0x010E, 2, strlen($description)).pack('V', $donnees)
        .pack('vvV', 0x0112, 3, 1).pack('vv', $orientation, 0)
        .pack('V', 0)
        .$description;
    $app1 = "\xFF\xE1".pack('n', 2 + 6 + strlen($tiff))."Exif\0\0".$tiff;

    return fichierTemporaire(substr($jpeg, 0, 2).$app1.substr($jpeg, 2), 'photo.jpg', 'image/jpeg');
}

/** PNG dont l'en-tête annonce des dimensions démesurées (bombe de décompression). */
function pngGeant(int $l = 20000, int $h = 20000): UploadedFile
{
    $ihdr = pack('NNCCCCC', $l, $h, 8, 2, 0, 0, 0);
    $chunk = fn (string $type, string $data) => pack('N', strlen($data)).$type.$data.pack('N', crc32($type.$data));

    return fichierTemporaire("\x89PNG\r\n\x1A\n".$chunk('IHDR', $ihdr).$chunk('IDAT', gzcompress(str_repeat("\0", 64))).$chunk('IEND', ''), 'geant.png', 'image/png');
}

function articleDe(Boutique $boutique, array $champs = []): Article
{
    return avecBoutique($boutique, fn () => Article::create($champs + ['nom' => 'Pain', 'prix_xof' => 150]));
}

it('crée un article SANS nom écrit avec un pictogramme, et refuse un article sans aucune identité', function () {
    connecte($this->gerant)->postJson('/api/v1/articles', ['prix_xof' => 250, 'pictogramme' => 'pain'])
        ->assertCreated()
        ->assertJsonPath('article.nom', null)
        ->assertJsonPath('article.pictogramme', 'pain')
        ->assertJsonPath('article.photo_url', null)
        ->assertJsonPath('article.voix_url', null)
        ->assertJsonStructure(['article' => ['ulid', 'nom', 'prix_xof', 'categorie', 'couleur', 'pictogramme', 'photo_url', 'voix_url', 'sku', 'actif', 'position']]);

    $this->postJson('/api/v1/articles', ['prix_xof' => 250])->assertStatus(422)->assertJsonValidationErrors(['nom']);
    $this->postJson('/api/v1/articles', ['prix_xof' => 250, 'nom' => '   '])->assertStatus(422)->assertJsonValidationErrors(['nom']);
    $this->postJson('/api/v1/articles', ['prix_xof' => 250, 'pictogramme' => 'licorne'])->assertStatus(422)->assertJsonValidationErrors(['pictogramme']);
    $this->postJson('/api/v1/articles', ['prix_xof' => 250, 'pictogramme' => '../../etc/passwd'])->assertStatus(422)->assertJsonValidationErrors(['pictogramme']);

    expect(Article::pourBoutique($this->boutique)->count())->toBe(1);
});

it('crée un article en une seule requête avec photo et nom dit à voix haute (sans nom écrit)', function () {
    $reponse = connecte($this->proprio)->post('/api/v1/articles', [
        'prix_xof' => '1500',
        'actif' => '1',
        'photo' => jpegAvecExif(),
        'voix' => wavGenere(0.6, 1.2, 'voix.wav'),
    ], ['Accept' => 'application/json'])->assertCreated();

    $article = Article::pourBoutique($this->boutique)->sole();
    expect($reponse->json('article.nom'))->toBeNull()
        ->and($reponse->json('article.photo_url'))->toBe("/api/v1/articles/{$article->ulid}/photo?v=".substr($article->photo_empreinte, 0, 12))
        ->and($reponse->json('article.voix_url'))->toBe("/api/v1/articles/{$article->ulid}/voix?v=".substr($article->voix_empreinte, 0, 12))
        ->and(ArticleFichier::pourBoutique($this->boutique)->count())->toBe(2)
        ->and($article->voix_duree_ms)->toBeGreaterThan(500)->toBeLessThan(2500);

    $journal = JournalAudit::query()->where('action', 'article.cree')->sole();
    expect($journal->details)->toMatchArray(['photo' => true, 'voix' => true, 'nom' => null]);
});

it('ré-encode la photo en WebP ≤ 512 px, redressée selon l\'EXIF, sans aucune métadonnée d\'origine', function () {
    $article = articleDe($this->boutique);

    connecte($this->gerant)->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(800, 400, 6)], ['Accept' => 'application/json'])
        ->assertOk()->assertJsonPath('article.ulid', $article->ulid);

    $fichier = DB::table('article_fichiers')->where('article_id', $article->id)->where('type', 'photo')->first();
    $contenu = is_resource($fichier->contenu) ? stream_get_contents($fichier->contenu) : $fichier->contenu;

    expect(substr($contenu, 0, 4))->toBe('RIFF')->and(substr($contenu, 8, 4))->toBe('WEBP')
        ->and($contenu)->not->toContain('SECRET-GPS')->not->toContain('Exif')
        ->and($fichier->mime)->toBe('image/webp')
        // Orientation 6 (téléphone tenu droit) : 800 × 400 couché → 256 × 512 debout.
        ->and((int) $fichier->largeur)->toBe(256)->and((int) $fichier->hauteur)->toBe(512)
        ->and((int) $fichier->octets)->toBe(strlen($contenu))
        ->and(hash('sha256', $contenu))->toBe($article->fresh()->photo_empreinte);

    $infos = getimagesizefromstring($contenu);
    expect($infos[0])->toBe(256)->and($infos[1])->toBe(512);

    expect(JournalAudit::query()->where('action', 'article.photo_ajoutee')->sole()->details)->toMatchArray(['largeur' => 256, 'hauteur' => 512, 'remplace' => false]);
});

it('lit l\'orientation EXIF sans l\'extension exif et ignore un EXIF absent ou corrompu', function () {
    $service = app(TraitementImage::class);

    foreach ([1, 3, 6, 8] as $o) {
        expect($service->orientationJpeg(jpegAvecExif(40, 20, $o)->getRealPath()))->toBe($o);
    }

    $sansExif = fichierTemporaire("\xFF\xD8\xFF\xE0".pack('n', 16)."JFIF\0".str_repeat("\0", 9)."\xFF\xDA", 'x.jpg', 'image/jpeg');
    $corrompu = fichierTemporaire("\xFF\xD8\xFF\xE1".pack('n', 12)."Exif\0\0MM\0", 'y.jpg', 'image/jpeg');
    expect($service->orientationJpeg($sansExif->getRealPath()))->toBe(1)
        ->and($service->orientationJpeg($corrompu->getRealPath()))->toBe(1);
});

it('refuse les photos au type réel invalide, illisibles, trop lourdes ou démesurées (jamais d\'après l\'extension)', function () {
    $article = articleDe($this->boutique);
    connecte($this->proprio);
    $url = "/api/v1/articles/{$article->ulid}/photo";
    $envoyer = fn (UploadedFile $f) => $this->post($url, ['fichier' => $f], ['Accept' => 'application/json']);

    // Script PHP déguisé en .jpg, texte « image/jpeg », GIF et SVG (hors liste) : type réel refusé.
    $envoyer(fichierTemporaire('<?php system($_GET["c"]); ?>', 'photo.jpg', 'image/jpeg'))->assertStatus(422)->assertJsonPath('code', 'PHOTO_TYPE_INVALIDE');
    $gif = imagecreatetruecolor(32, 32);
    ob_start();
    imagegif($gif);
    $envoyer(fichierTemporaire((string) ob_get_clean(), 'photo.png', 'image/png'))->assertStatus(422)->assertJsonPath('code', 'PHOTO_TYPE_INVALIDE');
    $envoyer(fichierTemporaire('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'photo.webp', 'image/webp'))->assertStatus(422)->assertJsonPath('code', 'PHOTO_TYPE_INVALIDE');

    // Signature JPEG suivie de n'importe quoi (polyglotte) : illisible.
    $envoyer(fichierTemporaire("\xFF\xD8\xFF\xE0".str_repeat('A', 400), 'photo.jpg', 'image/jpeg'))->assertStatus(422)->assertJsonPath('code', 'PHOTO_ILLISIBLE');

    // En-tête annonçant 20 000 × 20 000 px : refusé AVANT tout décodage.
    $envoyer(pngGeant())->assertStatus(422)->assertJsonPath('code', 'PHOTO_TROP_GRANDE');

    // Plus de 4 Mo à l'entrée.
    $envoyer(UploadedFile::fake()->create('lourde.jpg', 4200, 'image/jpeg'))->assertStatus(422)->assertJsonValidationErrors(['fichier']);
    $this->post($url, [], ['Accept' => 'application/json'])->assertStatus(422)->assertJsonValidationErrors(['fichier']);

    // Création multipart avec une fausse photo : rien n'est créé (tout ou rien).
    $this->post('/api/v1/articles', ['prix_xof' => '100', 'photo' => fichierTemporaire('pas une image', 'p.jpg', 'image/jpeg')], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonPath('code', 'PHOTO_TYPE_INVALIDE');

    expect($article->fresh()->photo_empreinte)->toBeNull()
        ->and(Article::pourBoutique($this->boutique)->count())->toBe(1)
        ->and(ArticleFichier::pourBoutique($this->boutique)->count())->toBe(0);
});

it('enregistre le nom dit à voix haute (MP3 ré-encodé) et refuse un faux audio ou un enregistrement trop long', function () {
    $article = articleDe($this->boutique, ['nom' => null, 'pictogramme' => 'riz']);
    connecte($this->gerant);
    $url = "/api/v1/articles/{$article->ulid}/voix";

    $this->post($url, ['fichier' => wavGenere(1.0, 1.5, 'nom.wav')], ['Accept' => 'application/json'])->assertOk()
        ->assertJsonPath('article.voix_url', "/api/v1/articles/{$article->ulid}/voix?v=".substr($article->fresh()->voix_empreinte, 0, 12));

    $fichier = DB::table('article_fichiers')->where('article_id', $article->id)->where('type', 'voix')->first();
    $contenu = is_resource($fichier->contenu) ? stream_get_contents($fichier->contenu) : $fichier->contenu;
    expect($fichier->mime)->toBe('audio/mpeg')
        ->and(str_starts_with($contenu, 'ID3') || (ord($contenu[0]) === 0xFF && (ord($contenu[1]) & 0xE0) === 0xE0))->toBeTrue()
        // Le silence de tête (1 s) est coupé par le traitement ffmpeg du studio.
        ->and((int) $fichier->duree_ms)->toBeLessThan(2300);

    $this->post($url, ['fichier' => fichierTemporaire(str_repeat('pas un son ', 200), 'nom.wav', 'audio/wav')], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonPath('code', 'AUDIO_TYPE_INVALIDE');
    $this->post($url, ['fichier' => wavGenere(0.2, 8.0, 'long.wav')], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonPath('code', 'AUDIO_TROP_LONG');
    $this->post($url, ['fichier' => UploadedFile::fake()->create('gros.wav', 1100, 'audio/wav')], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonValidationErrors(['fichier']);

    expect(JournalAudit::query()->where('action', 'article.voix_ajoutee')->count())->toBe(1);
});

it('sert la photo et la voix aux membres seulement, avec un cache privé versionné, un ETag et les plages d\'octets', function () {
    $article = articleDe($this->boutique);
    connecte($this->proprio)->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(300, 300, 1)], ['Accept' => 'application/json'])->assertOk();
    $this->post("/api/v1/articles/{$article->ulid}/voix", ['fichier' => wavGenere(0.3, 1.0)], ['Accept' => 'application/json'])->assertOk();
    $article->refresh();

    // Caissier : lecture autorisée.
    $photo = connecte($this->caissier)->get($article->photoUrl())->assertOk()
        ->assertHeader('Content-Type', 'image/webp')
        ->assertHeader('X-Content-Type-Options', 'nosniff');
    expect($photo->headers->get('Cache-Control'))->toContain('private')->toContain('immutable')->not->toContain('public')
        ->and($photo->headers->get('ETag'))->toBe('"'.$article->photo_empreinte.'"')
        ->and(substr(contenuReponse($photo), 8, 4))->toBe('WEBP');

    // Sans la bonne version : jamais mis en cache longtemps.
    expect(connecte($this->caissier)->get("/api/v1/articles/{$article->ulid}/photo?v=ancienne")->assertOk()->headers->get('Cache-Control'))->toContain('no-cache')->not->toContain('immutable');

    // Le navigateur l'a déjà : 304.
    connecte($this->caissier)->get($article->photoUrl(), ['If-None-Match' => '"'.$article->photo_empreinte.'"'])->assertStatus(304);

    $voix = connecte($this->caissier)->get($article->voixUrl())->assertOk()->assertHeader('Content-Type', 'audio/mpeg')->assertHeader('Accept-Ranges', 'bytes');
    expect(strlen(contenuReponse($voix)))->toBeGreaterThan(500);
    connecte($this->caissier)->get($article->voixUrl(), ['Range' => 'bytes=0-99'])->assertStatus(206)->assertHeader('Content-Length', '100');

    // Sans session : 401.
    app('auth')->forgetGuards();
    $this->flushSession();
    $this->app['auth']->guard('web')->logout();
    $this->getJson($article->photoUrl())->assertUnauthorized();
});

it('cloisonne les photos et voix entre boutiques (anti-IDOR) et réserve l\'envoi au propriétaire et au gérant', function () {
    $article = articleDe($this->boutique);
    connecte($this->proprio)->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(200, 200, 1)], ['Accept' => 'application/json'])->assertOk();
    $empreinte = $article->fresh()->photo_empreinte;

    // Propriétaire d'une AUTRE boutique : tout est 404 (indiscernable d'un article inexistant).
    ['user' => $etranger] = boutiqueAvec('proprietaire');
    connecte($etranger);
    $this->get("/api/v1/articles/{$article->ulid}/photo")->assertNotFound();
    $this->get("/api/v1/articles/{$article->ulid}/voix")->assertNotFound();
    $this->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(50, 50, 1)], ['Accept' => 'application/json'])->assertNotFound();
    $this->deleteJson("/api/v1/articles/{$article->ulid}/photo")->assertNotFound();
    $this->deleteJson("/api/v1/articles/{$article->ulid}/voix")->assertNotFound();

    // Caissier : lecture oui, écriture non — 403 AVANT toute validation (même sans fichier).
    connecte($this->caissier);
    $this->post("/api/v1/articles/{$article->ulid}/photo", [], ['Accept' => 'application/json'])->assertForbidden();
    $this->post("/api/v1/articles/{$article->ulid}/voix", ['fichier' => wavGenere(0.1, 0.5)], ['Accept' => 'application/json'])->assertForbidden();
    $this->deleteJson("/api/v1/articles/{$article->ulid}/photo")->assertForbidden();
    $this->post('/api/v1/articles', ['prix_xof' => '100', 'pictogramme' => 'riz'], ['Accept' => 'application/json'])->assertForbidden();

    expect($article->fresh()->photo_empreinte)->toBe($empreinte)
        ->and(ArticleFichier::pourBoutique($this->boutique)->count())->toBe(1);
});

it('supprime la photo ou la voix, mais jamais la dernière identité d\'un article', function () {
    $article = articleDe($this->boutique, ['nom' => null, 'pictogramme' => 'sucre']);
    connecte($this->proprio)->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(120, 120, 1)], ['Accept' => 'application/json'])->assertOk();

    // Le pictogramme reste : on peut retirer la photo.
    $this->deleteJson("/api/v1/articles/{$article->ulid}/photo")->assertOk()->assertJsonPath('article.photo_url', null);
    $this->deleteJson("/api/v1/articles/{$article->ulid}/photo")->assertOk(); // idempotent
    expect(ArticleFichier::pourBoutique($this->boutique)->count())->toBe(0)
        ->and(JournalAudit::query()->where('action', 'article.photo_supprimee')->count())->toBe(1);
    $this->get("/api/v1/articles/{$article->ulid}/photo")->assertNotFound();

    // Seule identité restante = le pictogramme : impossible de le retirer sans nom.
    $this->patchJson("/api/v1/articles/{$article->ulid}", ['pictogramme' => null])->assertStatus(422)->assertJsonValidationErrors(['nom']);
    $this->patchJson("/api/v1/articles/{$article->ulid}", ['pictogramme' => null, 'nom' => 'Sucre en morceaux'])->assertOk()->assertJsonPath('article.pictogramme', null);

    // Seule identité = la voix : sa suppression est refusée.
    $vocal = articleDe($this->boutique, ['nom' => 'Temporaire']);
    $this->post("/api/v1/articles/{$vocal->ulid}/voix", ['fichier' => wavGenere(0.2, 1.0)], ['Accept' => 'application/json'])->assertOk();
    $this->patchJson("/api/v1/articles/{$vocal->ulid}", ['nom' => null])->assertOk()->assertJsonPath('article.nom', null);
    $this->deleteJson("/api/v1/articles/{$vocal->ulid}/voix")->assertStatus(422)->assertJsonPath('code', 'ARTICLE_SANS_IDENTITE');
    expect($vocal->fresh()->voix_empreinte)->not->toBeNull();

    // Supprimer l'article supprime ses fichiers (cascade).
    $this->deleteJson("/api/v1/articles/{$vocal->ulid}")->assertNoContent();
    expect(DB::table('article_fichiers')->count())->toBe(0);
});

it('la base refuse elle-même un article sans identité (contrainte CHECK)', function () {
    expect(fn () => avecBoutique($this->boutique, fn () => Article::create(['nom' => null, 'prix_xof' => 100])))
        ->toThrow(Illuminate\Database\QueryException::class);
});

it('émet le signal « articles » à l\'envoi et à la suppression d\'une photo (la caisse se met à jour)', function () {
    $article = articleDe($this->boutique);
    connecte($this->proprio);

    Event::fake([DonneesModifiees::class]);
    $this->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(64, 64, 1)], ['Accept' => 'application/json'])->assertOk();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'articles' && $e->canal->name === 'private-boutique.'.$this->boutique->ulid);

    Event::fake([DonneesModifiees::class]);
    $this->get($article->fresh()->photoUrl())->assertOk();
    Event::assertNotDispatched(DonneesModifiees::class);

    Event::fake([DonneesModifiees::class]);
    $this->deleteJson("/api/v1/articles/{$article->ulid}/photo")->assertOk();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'articles');
});

it('donne le visuel des lignes au détail de la vente et le pictogramme (jamais la photo) au reçu public', function () {
    coursDisponible();
    passerelleFake();
    ['boutique' => $boutique, 'user' => $proprio] = boutiquePrete();
    $article = articleDe($boutique, ['nom' => null, 'pictogramme' => 'the', 'couleur' => '#DC2626']);
    connecte($proprio)->post("/api/v1/articles/{$article->ulid}/photo", ['fichier' => jpegAvecExif(64, 64, 1)], ['Accept' => 'application/json'])->assertOk();

    $vente = $this->postJson('/api/v1/ventes', [
        'montant_xof' => 300, 'methode' => 'lightning',
        'lignes' => [['article_ulid' => $article->ulid, 'libelle' => 'Thé, ataya', 'quantite' => 2, 'prix_unitaire_xof' => 150]],
    ])->assertCreated()->json('vente');

    expect($vente['lignes'][0])->toMatchArray(['libelle' => 'Thé, ataya', 'pictogramme' => 'the', 'couleur' => '#DC2626', 'photo_url' => $article->fresh()->photoUrl()]);
    $this->getJson("/api/v1/ventes/{$vente['ulid']}")->assertOk()->assertJsonPath('vente.lignes.0.pictogramme', 'the');

    $jeton = 'Z1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';
    Vente::toutesBoutiques()->where('ulid', $vente['ulid'])->update(['statut' => 'payee', 'payee_at' => now(), 'recu_jeton' => $jeton]);

    app('auth')->forgetGuards();
    $recu = $this->getJson("/r/{$jeton}")->assertOk()->assertJsonPath('lignes.0.pictogramme', 'the')->assertJsonPath('lignes.0.quantite', 2);
    expect($recu->json('lignes.0'))->not->toHaveKey('photo_url')->not->toHaveKey('article_ulid');
});

it('la recherche globale trouve un article sans nom écrit par son pictogramme, et l\'export porte la colonne', function () {
    articleDe($this->boutique, ['nom' => null, 'pictogramme' => 'pain', 'prix_xof' => 175]);

    connecte($this->proprio)->getJson('/api/v1/recherche?q=pain')->assertOk()
        ->assertJsonPath('groupes.0.rubrique', 'articles')
        ->assertJsonPath('groupes.0.resultats.0.titre', 'Pain');

    $csv = contenuReponse($this->get('/api/v1/exports/articles?format=csv')->assertOk());
    expect($csv)->toContain('Position;Pictogramme')->toContain(';175;')->toContain(';pain');
});

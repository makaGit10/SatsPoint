<?php

use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\JournalAudit;
use App\Services\Audio\StockageAudio;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\Process\Process;

/*
|--------------------------------------------------------------------------
| Audios EN BASE (CAHIER § 16.2 : disque non persistant sur l'offre gratuite) — la table audio_fichiers est la
| source de vérité, le disque « cache-audio » un simple cache : purge du disque, redémarrage simulé, repli sans
| cache, nettoyage des traitements interrompus, sauvegarde / restauration, listes sans contenu.
|--------------------------------------------------------------------------
*/

/** Vrai MP3 produit par ffmpeg (ton de $dureeS secondes). */
function mp3Genere(float $dureeS = 0.8, int $frequence = 440): string
{
    Storage::disk('local')->makeDirectory('tests');
    $chemin = Storage::disk('local')->path('tests/'.bin2hex(random_bytes(4)).'.mp3');
    $p = new Process(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', "sine=frequency={$frequence}:duration={$dureeS}", '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '48k', $chemin]);
    $p->setTimeout(30)->run();
    expect($p->isSuccessful())->toBeTrue($p->getErrorOutput());

    return (string) file_get_contents($chemin);
}

/** Audio publié (ou dans le statut demandé) dont le contenu est en base. */
function audioPublieEnBase(CleAudio $cle, string $langue, string $contenu, string $statut = 'publie'): Audio
{
    $empreinte = hash('sha256', $contenu);
    $audio = Audio::create([
        'cle_audio_id' => $cle->id, 'langue' => $langue, 'chemin' => Audio::cheminPublic($langue, $cle->cle, $empreinte), 'empreinte' => $empreinte,
        'duree_ms' => 800, 'taille' => strlen($contenu), 'statut' => $statut, 'publie_at' => $statut === 'publie' ? now() : null,
    ]);

    return contenuAudioEnBase($audio, $contenu);
}

/** Simule un redémarrage du conteneur sur disque éphémère : tout le stockage local disparaît. */
function purgerDisques(): void
{
    foreach (['public', 'local', 'cache-audio'] as $disque) {
        foreach (Storage::disk($disque)->directories() as $dossier) {
            Storage::disk($disque)->deleteDirectory($dossier);
        }
        Storage::disk($disque)->delete(Storage::disk($disque)->files());
    }
}

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    Storage::fake('cache-audio');
    $this->cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);
    $this->cle2 = CleAudio::create(['cle' => 'nav.ventes', 'ecran' => 'navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales', 'ordre' => 2]);
});

it('dépôt → traitement → contenu en base ; publié puis disque entièrement purgé : le fichier est toujours servi (en-têtes, ETag, 304, plages)', function () {
    Queue::fake();
    superAdminPret();

    $id = $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => wavGenere(0.5, 1)])->assertStatus(202)->json('audio.id');
    app()->call([new TraiterAudio($id), 'handle']);

    $audio = Audio::findOrFail($id);
    $ligne = DB::table('audio_fichiers')->where('audio_id', $id)->first(['octets', 'empreinte', 'mime']);
    expect($audio->statut)->toBe('brouillon')
        ->and($ligne->empreinte)->toBe($audio->empreinte)->and($ligne->octets)->toBe($audio->taille)->and($ligne->mime)->toBe('audio/mpeg')
        ->and((int) DB::selectOne('SELECT octet_length(contenu) AS n FROM audio_fichiers WHERE audio_id = ?', [$id])->n)->toBe($audio->taille);

    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$id]])->assertOk();
    $url = '/'.$audio->chemin;

    purgerDisques();
    expect(Storage::disk('cache-audio')->allFiles())->toBe([]);

    $r = $this->get($url)->assertOk()
        ->assertHeader('Content-Type', 'audio/mpeg')
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('ETag', '"'.$audio->empreinte.'"');
    expect($r->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=31536000')->toContain('immutable')
        ->and(hash('sha256', contenuReponse($r)))->toBe($audio->empreinte)
        // Le cache disque a été reconstruit à la demande.
        ->and(Storage::disk('cache-audio')->exists(StockageAudio::nomCache($audio)))->toBeTrue();

    // 304 sur l'empreinte ; plage d'octets (lecteurs audio Safari / iOS).
    $this->get($url, ['If-None-Match' => '"'.$audio->empreinte.'"'])->assertStatus(304);
    $plage = $this->get($url, ['Range' => 'bytes=0-99'])->assertStatus(206);
    expect(strlen(contenuReponse($plage)))->toBe(100);

    // Le manifeste pointe toujours la même URL (rien ne dépend du disque).
    $this->getJson('/api/v1/audio/manifeste/wo')->assertOk()->assertJsonPath('audios', ['caisse.encaisser' => url($url)]);
});

it('brouillon après redémarrage simulé : l\'écoute du studio relit la base ; un brouillon reste invisible publiquement', function () {
    superAdminPret();
    $contenu = mp3Genere();
    $brouillon = audioPublieEnBase($this->cle, 'srr', $contenu, 'brouillon');

    purgerDisques();

    $r = $this->get("/api/v1/admin/audio/{$brouillon->id}/ecouter")->assertOk()
        ->assertHeader('Content-Type', 'audio/mpeg')->assertHeader('Cache-Control', 'no-store, private')->assertHeader('X-Content-Type-Options', 'nosniff');
    expect(contenuReponse($r))->toBe($contenu);
    $this->get('/'.$brouillon->chemin)->assertNotFound();

    // La matrice garde l'URL d'écoute, et un brouillon sans contenu (ligne orpheline) donne 404, jamais une erreur 500.
    $this->getJson('/api/v1/admin/audio/matrice?langue=srr')->assertOk()->assertJsonPath('cles.0.etats.srr.url', url("/api/v1/admin/audio/{$brouillon->id}/ecouter"));
    DB::table('audio_fichiers')->where('audio_id', $brouillon->id)->delete();
    Storage::disk('cache-audio')->delete(StockageAudio::nomCache($brouillon));
    $this->get("/api/v1/admin/audio/{$brouillon->id}/ecouter")->assertNotFound();
});

it('sert directement depuis la base si le cache disque est inutilisable', function () {
    $contenu = mp3Genere();
    $audio = audioPublieEnBase($this->cle, 'wo', $contenu);

    // Racine du cache sous un FICHIER : aucun dossier ne peut y être créé.
    Storage::disk('local')->put('pas-un-dossier', 'x');
    config(['filesystems.disks.cache-audio.root' => Storage::disk('local')->path('pas-un-dossier').'/cache']);
    Storage::forgetDisk('cache-audio');

    $r = $this->get('/'.$audio->chemin)->assertOk()->assertHeader('Content-Type', 'audio/mpeg')->assertHeader('ETag', '"'.$audio->empreinte.'"');
    expect(contenuReponse($r))->toBe($contenu)->and($r->headers->get('Content-Length'))->toBe((string) strlen($contenu))
        ->and($r->baseResponse)->not->toBeInstanceOf(BinaryFileResponse::class);
});

it('un traitement interrompu par un redémarrage passe en erreur « à renvoyer » (démarrage, planificateur, job abandonné)', function () {
    $prive = Storage::disk('local');

    // 1. Source perdue avec le disque (redémarrage) → erreur immédiate.
    $perdu = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement', 'chemin_source' => 'audio-sources/1.wav']);
    // 2. Traitement en cours normal (source présente, récent) → intact.
    $enCours = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'srr', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement', 'chemin_source' => 'audio-sources/2.wav']);
    $prive->put('audio-sources/2.wav', 'RIFF');
    // 3. Bloqué depuis trop longtemps (source présente) → erreur, source supprimée.
    $bloque = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'ff', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement', 'chemin_source' => 'audio-sources/3.wav']);
    $prive->put('audio-sources/3.wav', 'RIFF');
    DB::table('audios')->where('id', $bloque->id)->update(['updated_at' => now()->subMinutes(11)]);
    // 4. Source orpheline ancienne → supprimée.
    $prive->put('audio-sources/999.wav', 'RIFF');
    touch($prive->path('audio-sources/999.wav'), now()->subHours(2)->getTimestamp());

    $this->artisan('audio:nettoyer')->assertSuccessful();

    expect($perdu->fresh()->statut)->toBe('erreur')->and($perdu->fresh()->message_erreur)->toContain('Renvoyez')
        ->and($enCours->fresh()->statut)->toBe('en_traitement')->and($prive->exists('audio-sources/2.wav'))->toBeTrue()
        ->and($bloque->fresh()->statut)->toBe('erreur')->and($bloque->fresh()->chemin_source)->toBeNull()->and($prive->exists('audio-sources/3.wav'))->toBeFalse()
        ->and($prive->exists('audio-sources/999.wav'))->toBeFalse();

    // Le job relancé après redémarrage (source disparue) ne reste jamais bloqué ; un job abandonné non plus.
    $prive->delete('audio-sources/2.wav');
    app()->call([new TraiterAudio($enCours->id), 'handle']);
    expect($enCours->fresh()->statut)->toBe('erreur')->and($enCours->fresh()->message_erreur)->toBe(TraiterAudio::MESSAGE_INTERROMPU);

    $abandonne = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'dyo', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement', 'chemin_source' => 'audio-sources/4.wav']);
    (new TraiterAudio($abandonne->id))->failed(new RuntimeException('timeout'));
    expect($abandonne->fresh()->statut)->toBe('erreur')->and($abandonne->fresh()->message_erreur)->toBe(TraiterAudio::MESSAGE_INTERROMPU);

    // Visible dans la matrice comme une case à renvoyer (statut erreur, message, compte comme manquante).
    superAdminPret();
    $this->getJson('/api/v1/admin/audio/matrice?langue=wo')->assertOk()
        ->assertJsonPath('cles.0.etats.wo.statut', 'erreur')->assertJsonPath('cles.0.etats.wo.erreur', TraiterAudio::MESSAGE_INTERROMPU)
        ->assertJsonPath('couverture.wo.manquants', 2);
});

it('exporte les audios publiés ({langue}/{cle}.mp3 + manifeste.json) et les restaure dans une base vide, de façon idempotente', function () {
    $a = mp3Genere(0.6, 440);
    $b = mp3Genere(0.9, 660);
    audioPublieEnBase($this->cle, 'wo', $a);
    audioPublieEnBase($this->cle2, 'fr', $b);
    audioPublieEnBase($this->cle, 'srr', mp3Genere(), 'brouillon'); // non exporté

    $dossier = Storage::disk('local')->path('sauvegarde');
    $this->artisan('audio:exporter', ['dossier' => $dossier])->assertSuccessful();

    $manifeste = json_decode((string) file_get_contents($dossier.'/manifeste.json'), true);
    expect($manifeste['format'])->toBe('satspoint-audio')->and($manifeste['audios'])->toHaveCount(2)
        ->and(array_column($manifeste['audios'], 'fichier'))->toBe(['fr/nav.ventes.mp3', 'wo/caisse.encaisser.mp3'])
        ->and(file_get_contents($dossier.'/wo/caisse.encaisser.mp3'))->toBe($a)
        ->and(file_get_contents($dossier.'/fr/nav.ventes.mp3'))->toBe($b)
        ->and(is_file($dossier.'/srr/caisse.encaisser.mp3'))->toBeFalse()
        ->and(JournalAudit::query()->where('action', 'audio.exporte')->count())->toBe(1);

    // Base « neuve » (nouveau projet Neon) : plus aucun audio ; disque purgé, sauf la sauvegarde.
    Audio::query()->delete();
    expect(DB::table('audio_fichiers')->count())->toBe(0);
    Storage::disk('cache-audio')->delete(Storage::disk('cache-audio')->allFiles());

    $this->artisan('audio:importer', ['dossier' => $dossier])->assertSuccessful();

    $restaure = Audio::query()->where('langue', 'wo')->firstOrFail();
    expect(Audio::query()->where('statut', 'publie')->count())->toBe(2)
        ->and($restaure->empreinte)->toBe(hash('sha256', $a))->and($restaure->duree_ms)->toBeGreaterThan(400)
        ->and(app(StockageAudio::class)->contenu($restaure->id))->toBe($a)
        ->and(JournalAudit::query()->where('action', 'audio.importe')->count())->toBe(1);
    expect(contenuReponse($this->get('/'.$restaure->chemin)->assertOk()))->toBe($a);
    $this->getJson('/api/v1/audio/manifeste/wo')->assertOk()->assertJsonPath('audios', ['caisse.encaisser' => url('/'.$restaure->chemin)]);

    // Deuxième import : rien de dupliqué.
    $this->artisan('audio:importer', ['dossier' => $dossier])->assertSuccessful();
    expect(Audio::query()->count())->toBe(2);

    // Nouvelle version de la sauvegarde → l'ancien publié passe en archive (toujours servi), le nouveau est publié.
    $c = mp3Genere(0.7, 880);
    file_put_contents($dossier.'/wo/caisse.encaisser.mp3', $c);
    $manifeste['audios'][1]['empreinte'] = hash('sha256', $c);
    file_put_contents($dossier.'/manifeste.json', json_encode($manifeste));
    $this->artisan('audio:importer', ['dossier' => $dossier, '--brouillon' => false])->assertSuccessful();
    expect($restaure->fresh()->statut)->toBe('archive')
        ->and(Audio::query()->where('langue', 'wo')->where('statut', 'publie')->value('empreinte'))->toBe(hash('sha256', $c));
});

it('l\'import d\'une sauvegarde refuse chemins détournés, empreintes fausses, faux MP3, clés et langues inconnues', function () {
    $dossier = Storage::disk('local')->path('piege');
    Storage::disk('local')->put('secret.mp3', mp3Genere());
    Storage::disk('local')->put('piege/wo/caisse.encaisser.mp3', 'ceci n\'est pas un mp3, juste du texte assez long');
    Storage::disk('local')->put('piege/fr/caisse.encaisser.mp3', $vrai = mp3Genere());

    $entrees = [
        ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => '../secret.mp3'],                          // traversée
        ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => 'wo/caisse.encaisser.mp3'],                // faux MP3
        ['cle' => 'caisse.encaisser', 'langue' => 'fr', 'fichier' => 'fr/caisse.encaisser.mp3', 'empreinte' => str_repeat('a', 64)], // empreinte fausse
        ['cle' => 'cle.inconnue', 'langue' => 'fr', 'fichier' => 'fr/cle.inconnue.mp3'],                         // clé absente du registre
        ['cle' => '../../x', 'langue' => 'fr', 'fichier' => 'fr/../../x.mp3'],                                   // clé invalide
        ['cle' => 'caisse.encaisser', 'langue' => 'en', 'fichier' => 'en/caisse.encaisser.mp3'],                // langue inconnue
    ];
    Storage::disk('local')->put('piege/manifeste.json', json_encode(['format' => 'satspoint-audio', 'version' => 1, 'audios' => $entrees]));

    $this->artisan('audio:importer', ['dossier' => $dossier])->assertFailed();
    expect(Audio::query()->count())->toBe(0)->and(DB::table('audio_fichiers')->count())->toBe(0);

    // Manifeste absent ou d'un autre format : rien n'est fait.
    Storage::disk('local')->put('piege/manifeste.json', json_encode(['audios' => []]));
    $this->artisan('audio:importer', ['dossier' => $dossier])->assertFailed();
    $this->artisan('audio:importer', ['dossier' => Storage::disk('local')->path('inexistant')])->assertFailed();

    // Contrôle : la même entrée, propre, est acceptée.
    Storage::disk('local')->put('piege/manifeste.json', json_encode(['format' => 'satspoint-audio', 'version' => 1, 'audios' => [
        ['cle' => 'caisse.encaisser', 'langue' => 'fr', 'fichier' => 'fr/caisse.encaisser.mp3', 'empreinte' => hash('sha256', $vrai)],
    ]]));
    $this->artisan('audio:importer', ['dossier' => $dossier, '--brouillon' => true])->assertSuccessful();
    expect(Audio::query()->value('statut'))->toBe('brouillon');
});

it('les listes ne chargent jamais le contenu : matrice, manifeste, suivi, publication et santé n\'interrogent pas audio_fichiers', function () {
    $admin = superAdminPret();
    $publie = audioPublieEnBase($this->cle, 'wo', mp3Genere());
    $brouillon = audioPublieEnBase($this->cle2, 'wo', mp3Genere(0.5, 550), 'brouillon');

    DB::flushQueryLog();
    DB::enableQueryLog();

    $this->getJson('/api/v1/admin/audio/matrice')->assertOk();
    $this->getJson('/api/v1/audio/manifeste/wo')->assertOk();
    $this->getJson("/api/v1/admin/audio/{$publie->id}")->assertOk();
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$brouillon->id]])->assertOk();
    $this->getJson('/api/v1/admin/sante')->assertOk();

    $requetes = array_column(DB::getQueryLog(), 'query');
    DB::disableQueryLog();

    expect($requetes)->not->toBeEmpty();
    foreach ($requetes as $sql) {
        expect($sql)->not->toContain('audio_fichiers')->not->toContain('contenu');
    }

    // Contrôle positif : servir UN fichier sans cache lit bien une seule ligne de audio_fichiers.
    DB::enableQueryLog();
    $this->get('/'.$publie->chemin)->assertOk();
    $lectures = array_values(array_filter(array_column(DB::getQueryLog(), 'query'), fn (string $sql) => str_contains($sql, 'audio_fichiers')));
    DB::disableQueryLog();
    expect($lectures)->toBe(['SELECT contenu FROM audio_fichiers WHERE audio_id = ?']);
});

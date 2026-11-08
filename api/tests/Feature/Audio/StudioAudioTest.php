<?php

use App\Events\DonneesModifiees;
use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\JournalAudit;
use App\Models\User;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\TraitementAudio;
use App\Services\DeuxFacteurs;
use App\Services\Diffuseur;
use Illuminate\Http\UploadedFile;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/*
|--------------------------------------------------------------------------
| Studio audio (CAHIER § 6.13) : matrice, dépôt (type réel, taille, durée), job ffmpeg réel,
| publication → manifeste → invalidation → ETag, suppression, droits.
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    $this->cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'contexte' => 'Bouton', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);
    $this->cle2 = CleAudio::create(['cle' => 'nav.ventes', 'ecran' => 'navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales', 'ordre' => 2]);
    CleAudio::create(['cle' => 'ancienne.cle', 'ecran' => 'x', 'texte_fr' => 'x', 'texte_en' => 'x', 'presente_dans_code' => false]);
});

it('refuse le studio sans super-admin, sans 2FA active, puis sans 2FA vérifiée dans la session', function () {
    ['user' => $proprio] = boutiqueAvec('proprietaire');
    connecte($proprio)->getJson('/api/v1/admin/audio/matrice')->assertForbidden()->assertJsonPath('code', 'INTERDIT');

    $admin = User::factory()->superAdmin()->create();
    connecte($admin)->getJson('/api/v1/admin/audio/matrice')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE')->assertJsonPath('etape', 'activer');

    $admin->forceFill(['two_factor_secret' => 'JBSWY3DPEHPK3PXP', 'two_factor_confirmed_at' => now()])->save();
    connecte($admin)->getJson('/api/v1/admin/audio/matrice')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE')->assertJsonPath('etape', 'verifier');

    session()->put(DeuxFacteurs::CLE_SESSION, now()->toIso8601String());
    $this->getJson('/api/v1/admin/audio/matrice')->assertOk();

    $this->getJson('/api/v1/admin/boutiques')->assertOk();
});

it('renvoie la matrice avec couverture, ordre (essentielles d\'abord), filtres et recherche', function () {
    superAdminPret();
    $publie = Audio::create(['cle_audio_id' => $this->cle2->id, 'langue' => 'wo', 'chemin' => Audio::cheminPublic('wo', 'nav.ventes', str_repeat('b', 64)), 'empreinte' => str_repeat('b', 64), 'duree_ms' => 800, 'taille' => 3000, 'statut' => 'publie', 'publie_at' => now()]);
    Audio::create(['cle_audio_id' => $this->cle2->id, 'langue' => 'fr', 'chemin' => Audio::cheminPublic('fr', 'nav.ventes', str_repeat('c', 64)), 'empreinte' => str_repeat('c', 64), 'duree_ms' => 700, 'taille' => 3000, 'statut' => 'brouillon']);

    $m = $this->getJson('/api/v1/admin/audio/matrice')->assertOk()
        ->assertJsonPath('langues', [['code' => 'wo', 'nom' => 'Wolof'], ['code' => 'srr', 'nom' => 'Sérère'], ['code' => 'ff', 'nom' => 'Pulaar'], ['code' => 'dyo', 'nom' => 'Diola'], ['code' => 'fr', 'nom' => 'Français']])
        ->assertJsonPath('ecrans', ['caisse', 'navigation'])
        ->assertJsonCount(2, 'cles')
        ->assertJsonPath('cles.0.cle', 'caisse.encaisser')   // essentielle d'abord
        ->assertJsonPath('cles.0.etats.wo.statut', 'manquant')
        ->assertJsonPath('cles.1.etats.wo.statut', 'publie')
        ->assertJsonPath('cles.1.etats.wo.url', url('/audio/wo/nav.ventes.bbbbbbbb.mp3'))
        ->assertJsonPath('cles.1.etats.wo.duree_ms', 800)
        ->assertJsonPath('cles.1.etats.fr.statut', 'brouillon')
        ->assertJsonPath('cles.1.etats.fr.url', url('/api/v1/admin/audio/'.Audio::where('statut', 'brouillon')->value('id').'/ecouter'))
        ->assertJsonPath('cles.1.etats.fr.id', Audio::where('statut', 'brouillon')->value('id'))
        ->assertJsonPath('couverture.wo', ['publies' => 1, 'brouillons' => 0, 'manquants' => 1, 'total' => 2, 'essentielles_manquantes' => 1, 'pct' => 50])
        ->assertJsonPath('couverture.fr.brouillons', 1)
        ->assertJsonPath('couverture.srr.manquants', 2);

    expect(array_keys($m->json('cles.0')))->toBe(['cle', 'ecran', 'contexte', 'texte_fr', 'texte_en', 'essentielle', 'ordre', 'etats'])
        ->and($m->json('cles.1.etats.wo.id'))->toBe($publie->id)
        ->and($m->getContent())->not->toContain('chemin');

    $this->getJson('/api/v1/admin/audio/matrice?langue=wo&manquants=1')->assertOk()->assertJsonCount(1, 'cles')->assertJsonPath('cles.0.cle', 'caisse.encaisser')->assertJsonPath('cles.0.etats', ['wo' => ['statut' => 'manquant']]);
    $this->getJson('/api/v1/admin/audio/matrice?ecran=navigation')->assertOk()->assertJsonCount(1, 'cles')->assertJsonPath('cles.0.cle', 'nav.ventes');
    $this->getJson('/api/v1/admin/audio/matrice?q=encaiss')->assertOk()->assertJsonCount(1, 'cles');
    $this->getJson('/api/v1/admin/audio/matrice?q=Sales')->assertOk()->assertJsonCount(1, 'cles')->assertJsonPath('cles.0.cle', 'nav.ventes');
    $this->getJson('/api/v1/admin/audio/matrice?langue=xx')->assertStatus(422);
});

it('refuse un fichier au type falsifié, trop gros ou trop long ; accepte un vrai wav et met le traitement en file', function () {
    Queue::fake();
    superAdminPret();

    // Texte renommé en .mp3 : type réel ≠ audio.
    $faux = UploadedFile::fake()->createWithContent('voix.mp3', str_repeat('Ceci n\'est pas un audio. ', 200));
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $faux])->assertStatus(422);

    // Signature MP3 falsifiée (ID3) mais contenu illisible par ffprobe.
    $faussePrise = UploadedFile::fake()->createWithContent('voix.mp3', 'ID3'.str_repeat("\x00", 2000));
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $faussePrise])->assertStatus(422);

    // Trop gros (> 2 Mo).
    $gros = UploadedFile::fake()->create('voix.wav', 2049, 'audio/wav');
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $gros])->assertStatus(422)->assertJsonValidationErrors(['fichier']);

    // Trop long (> 15 s).
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => wavGenere(1, 15.5)])->assertStatus(422)->assertJsonPath('code', 'AUDIO_TROP_LONG');

    // Clé inconnue, langue inconnue.
    $this->post('/api/v1/admin/audio', ['cle' => 'inconnue.cle', 'langue' => 'wo', 'fichier' => wavGenere(0.2, 0.5)])->assertStatus(422)->assertJsonValidationErrors(['cle']);
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'en', 'fichier' => wavGenere(0.2, 0.5)])->assertStatus(422)->assertJsonValidationErrors(['langue']);

    Queue::assertNothingPushed();
    expect(Audio::count())->toBe(0);

    // Vrai wav : 202, brouillon « en_traitement », job en file, source stockée hors racine web sous un nom généré.
    $reponse = $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => wavGenere(2, 1, 'Mon Enregistrement (1).WAV')])
        ->assertStatus(202)
        ->assertJsonPath('audio.cle', 'caisse.encaisser')
        ->assertJsonPath('audio.langue', 'wo')
        ->assertJsonPath('audio.statut', 'en_traitement')
        ->assertJsonPath('audio.url', null);

    $audio = Audio::findOrFail($reponse->json('audio.id'));
    expect($audio->chemin_source)->toBe('audio-sources/'.$audio->id.'.wav')
        ->and(Storage::disk('local')->exists($audio->chemin_source))->toBeTrue()
        ->and($audio->duree_ms)->toBeGreaterThan(2500)->toBeLessThan(3500)
        ->and($reponse->getContent())->not->toContain('Mon Enregistrement');

    Queue::assertPushed(TraiterAudio::class, fn (TraiterAudio $job) => $job->audioId === $audio->id && $job->queue === 'audio');
    expect(JournalAudit::query()->where('action', 'audio.depose')->count())->toBe(1);
});

it('traite réellement l\'audio avec ffmpeg : silences coupés, MP3 mono 48 kHz, empreinte, brouillon prêt', function () {
    Queue::fake();
    $admin = superAdminPret();

    $id = $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => wavGenere(2, 1)])->assertStatus(202)->json('audio.id');

    (new TraiterAudio($id))->handle(app(TraitementAudio::class), app(InspecteurAudio::class), app(Diffuseur::class));

    $audio = Audio::findOrFail($id);
    expect($audio->statut)->toBe('brouillon')
        ->and($audio->chemin)->toBe('audio/wo/caisse.encaisser.'.substr($audio->empreinte, 0, 8).'.mp3')
        ->and($audio->empreinte)->toHaveLength(64)
        ->and($audio->chemin_source)->toBeNull()
        ->and(Storage::disk('public')->exists($audio->chemin))->toBeTrue()
        ->and(Storage::disk('local')->exists('audio-sources/'.$id.'.wav'))->toBeFalse()
        // 2 s de silence retirées : il reste ~1 s de ton (tolérance ffmpeg).
        ->and($audio->duree_ms)->toBeGreaterThan(600)->toBeLessThan(1600)
        ->and($audio->taille)->toBeGreaterThan(2000)->toBeLessThan(20000);

    expect(hash_file('sha256', Storage::disk('public')->path($audio->chemin)))->toBe($audio->empreinte);

    // Sonde du fichier produit : mp3, mono, 48 kHz.
    $p = new Process(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate', '-of', 'json', Storage::disk('public')->path($audio->chemin)]);
    $p->run();
    $flux = json_decode($p->getOutput(), true)['streams'][0];
    expect($flux['codec_name'])->toBe('mp3')->and((int) $flux['channels'])->toBe(1)->and((int) $flux['sample_rate'])->toBe(48000);

    // Le brouillon s'écoute dans le studio, mais n'est PAS servi publiquement.
    $this->get("/api/v1/admin/audio/{$id}/ecouter")->assertOk()->assertHeader('Content-Type', 'audio/mpeg')->assertHeader('Cache-Control', 'no-store, private');
    $this->get('/'.$audio->chemin)->assertNotFound();
});

it('publie, archive l\'ancien, invalide le manifeste (version + ETag), diffuse « audios » sur plateforme et admin, puis supprime', function () {
    $admin = superAdminPret();

    $ancien = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => Audio::cheminPublic('wo', 'caisse.encaisser', str_repeat('a', 64)), 'empreinte' => str_repeat('a', 64), 'duree_ms' => 900, 'taille' => 3000, 'statut' => 'publie', 'publie_at' => now()->subDay()]);
    Storage::disk('public')->put($ancien->chemin, 'ancien');
    $nouveau = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => Audio::cheminPublic('wo', 'caisse.encaisser', str_repeat('d', 64)), 'empreinte' => str_repeat('d', 64), 'duree_ms' => 800, 'taille' => 3000, 'statut' => 'brouillon']);
    Storage::disk('public')->put($nouveau->chemin, 'nouveau');
    $autre = Audio::create(['cle_audio_id' => $this->cle2->id, 'langue' => 'wo', 'chemin' => Audio::cheminPublic('wo', 'nav.ventes', str_repeat('e', 64)), 'empreinte' => str_repeat('e', 64), 'duree_ms' => 800, 'taille' => 3000, 'statut' => 'brouillon']);
    Storage::disk('public')->put($autre->chemin, 'autre');

    $avant = $this->getJson('/api/v1/audio/manifeste/wo')->assertOk();
    expect($avant->json('audios'))->toBe(['caisse.encaisser' => url('/audio/wo/caisse.encaisser.aaaaaaaa.mp3')]);
    $etagAvant = $avant->headers->get('ETag');
    $this->withHeaders(['If-None-Match' => $etagAvant])->getJson('/api/v1/audio/manifeste/wo')->assertStatus(304);

    Event::fake([DonneesModifiees::class]);
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$nouveau->id]])->assertOk()
        ->assertJsonPath('publies', 1)
        ->assertJsonCount(1, 'audios')->assertJsonPath('audios.0.statut', 'publie')->assertJsonPath('audios.0.url', url('/audio/wo/caisse.encaisser.dddddddd.mp3'));

    expect($ancien->fresh()->statut)->toBe('archive')->and($nouveau->fresh()->statut)->toBe('publie')->and($nouveau->fresh()->publie_at)->not->toBeNull();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'plateforme' && $e->rubrique === 'audios' && $e->auteur === $admin->ulid);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-admin' && $e->rubrique === 'audio');

    // Manifeste : nouvelle URL, nouvelle version, l'ancien ETag ne donne plus 304.
    $apres = $this->getJson('/api/v1/audio/manifeste/wo')->assertOk();
    expect($apres->json('audios'))->toBe(['caisse.encaisser' => url('/audio/wo/caisse.encaisser.dddddddd.mp3')]);
    expect($apres->json('version'))->not->toBe($avant->json('version'))->and($apres->headers->get('ETag'))->not->toBe($etagAvant);
    $this->withHeaders(['If-None-Match' => $etagAvant])->getJson('/api/v1/audio/manifeste/wo')->assertOk();

    // Fichiers : le publié ET l'archivé restent servis (cache immuable), un brouillon non ; aucun listing, aucune traversée.
    $fichier = $this->get('/audio/wo/caisse.encaisser.dddddddd.mp3')->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff')->assertHeader('Content-Type', 'audio/mpeg');
    expect($fichier->headers->get('Cache-Control'))->toContain('public')->toContain('max-age=31536000')->toContain('immutable');
    $this->get('/audio/wo/caisse.encaisser.aaaaaaaa.mp3')->assertOk();
    $this->get('/audio/wo/nav.ventes.eeeeeeee.mp3')->assertNotFound();
    $this->get('/audio/wo/')->assertNotFound();
    $this->get('/audio/wo/../../.env')->assertNotFound();
    $this->get('/audio/wo/caisse.encaisser.zzzzzzzz.mp3')->assertNotFound();

    // Publication par (clé, langue) : dernier brouillon.
    $this->postJson('/api/v1/admin/audio/publier', ['cle' => 'nav.ventes', 'langue' => 'wo'])->assertOk()->assertJsonPath('publies', 1)->assertJsonPath('audios.0.id', $autre->id);
    $this->postJson('/api/v1/admin/audio/publier', ['cle' => 'nav.ventes', 'langue' => 'wo'])->assertNotFound()->assertJsonPath('code', 'AUDIO_INTROUVABLE');
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$nouveau->id]])->assertStatus(409)->assertJsonPath('code', 'AUDIO_NON_PUBLIABLE');
    $this->postJson('/api/v1/admin/audio/publier', [])->assertStatus(422);

    // Suppression : jamais le publié ; l'archive oui (fichier effacé).
    $this->deleteJson("/api/v1/admin/audio/{$nouveau->id}")->assertStatus(409)->assertJsonPath('code', 'AUDIO_NON_SUPPRIMABLE');
    $this->deleteJson("/api/v1/admin/audio/{$ancien->id}")->assertNoContent();
    expect(Audio::find($ancien->id))->toBeNull()->and(Storage::disk('public')->exists('audio/wo/caisse.encaisser.aaaaaaaa.mp3'))->toBeFalse();
    $this->deleteJson("/api/v1/admin/audio/{$ancien->id}")->assertNotFound();
    $this->deleteJson('/api/v1/admin/audio/abc')->assertNotFound();

    expect(JournalAudit::query()->where('action', 'audio.publie')->count())->toBe(2)
        ->and(JournalAudit::query()->where('action', 'audio.supprime')->count())->toBe(1);
});

it('limite les dépôts à 120 par heure et ne journalise que des identifiants', function () {
    Queue::fake();
    superAdminPret();

    $messages = [];
    Log::listen(function (MessageLogged $e) use (&$messages) {
        $messages[] = $e->message.' '.json_encode($e->context);
    });

    $fichier = wavGenere(0.2, 0.5, 'Secret Vocal.wav');
    for ($i = 0; $i < 120; $i++) {
        $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $fichier])->assertStatus(202);
    }
    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $fichier])->assertStatus(429)->assertJsonPath('code', 'TROP_DE_TENTATIVES');

    expect(implode("\n", $messages))->not->toContain('Secret Vocal');
    $details = JournalAudit::query()->where('action', 'audio.depose')->first()->details;
    expect(json_encode($details))->not->toContain('Secret Vocal')->not->toContain('audio-sources');
});

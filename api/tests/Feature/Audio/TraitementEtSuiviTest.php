<?php

use App\Events\DonneesModifiees;
use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\TraitementAudio;
use App\Services\Diffuseur;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/*
|--------------------------------------------------------------------------
| Studio audio — suivi d'un dépôt (GET /admin/audio/{id}), formats réels, échec du traitement,
| signal « audio » sur private-admin, cases « erreur » de la matrice.
|--------------------------------------------------------------------------
*/

/** Fichier produit par ffmpeg (arguments figés par le test). */
function fichierFfmpeg(array $arguments, string $extension, string $nom, string $mime): UploadedFile
{
    Storage::disk('local')->makeDirectory('tests');
    $chemin = Storage::disk('local')->path('tests/'.bin2hex(random_bytes(4)).'.'.$extension);
    $p = new Process(array_merge(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y'], $arguments, [$chemin]));
    $p->setTimeout(30)->run();
    expect($p->isSuccessful())->toBeTrue($p->getErrorOutput());

    return new UploadedFile($chemin, $nom, $mime, null, true);
}

function traiter(int $id): void
{
    (new TraiterAudio($id))->handle(app(TraitementAudio::class), app(InspecteurAudio::class), app(Diffuseur::class));
}

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    $this->cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);
});

it('expose le suivi d\'un dépôt : en_traitement puis brouillon prêt à écouter (forme du contrat)', function () {
    Queue::fake();
    superAdminPret();

    $id = $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'srr', 'fichier' => wavGenere(0.5, 1)])->assertStatus(202)->json('audio.id');

    $this->getJson("/api/v1/admin/audio/{$id}")->assertOk()
        ->assertJsonPath('audio.id', $id)->assertJsonPath('audio.cle', 'caisse.encaisser')->assertJsonPath('audio.langue', 'srr')
        ->assertJsonPath('audio.statut', 'en_traitement')->assertJsonPath('audio.duree_ms', null)
        ->assertJsonPath('audio.url_ecoute', null)->assertJsonPath('audio.erreur', null);

    traiter($id);

    $r = $this->getJson("/api/v1/admin/audio/{$id}")->assertOk()
        ->assertJsonPath('audio.statut', 'brouillon')
        ->assertJsonPath('audio.url_ecoute', url("/api/v1/admin/audio/{$id}/ecouter"))
        ->assertJsonPath('audio.url', null); // un brouillon n'a pas d'URL publique
    expect($r->json('audio.duree_ms'))->toBeGreaterThan(500)
        ->and(array_slice(array_keys($r->json('audio')), 0, 7))->toBe(['id', 'cle', 'langue', 'statut', 'duree_ms', 'url_ecoute', 'erreur'])
        ->and($r->getContent())->not->toContain('chemin')->not->toContain('audio-sources');

    $this->getJson('/api/v1/admin/audio/999999')->assertNotFound();
});

it('accepte un vrai fichier du navigateur et le convertit en MP3', function (string $extension, array $codec, string $mime) {
    Queue::fake();
    superAdminPret();

    $fichier = fichierFfmpeg(array_merge(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=1.2'], $codec), $extension, 'enregistrement.'.$extension, $mime);
    $id = $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $fichier])->assertStatus(202)->json('audio.id');

    expect(Audio::find($id)->chemin_source)->toEndWith('.'.$extension);
    traiter($id);

    $audio = Audio::find($id);
    expect($audio->statut)->toBe('brouillon')->and($audio->chemin)->toEndWith('.mp3')->and(Storage::disk('public')->exists($audio->chemin))->toBeTrue();
})->with([
    'ogg (vorbis)' => ['ogg', ['-c:a', 'libvorbis'], 'audio/ogg'],
    'webm (opus)' => ['webm', ['-c:a', 'libopus'], 'audio/webm'],
    'm4a (aac)' => ['m4a', ['-c:a', 'aac'], 'audio/mp4'],
    'mp3' => ['mp3', ['-c:a', 'libmp3lame'], 'audio/mpeg'],
]);

it('refuse un fichier contenant une vraie piste vidéo, même nommé .webm', function () {
    superAdminPret();

    $video = fichierFfmpeg(['-f', 'lavfi', '-i', 'testsrc=size=64x64:rate=5:duration=1', '-f', 'lavfi', '-i', 'sine=duration=1', '-c:v', 'libvpx', '-c:a', 'libopus', '-shortest'], 'webm', 'voix.webm', 'video/webm');

    $this->post('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo', 'fichier' => $video])->assertStatus(422)->assertJsonPath('code', 'AUDIO_TYPE_INVALIDE');
    expect(Audio::count())->toBe(0);
});

it('passe en « erreur » (message générique) si ffmpeg ne peut pas traiter la source, supprime la source et prévient le studio', function () {
    superAdminPret();
    Event::fake([DonneesModifiees::class]);

    $audio = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement']);
    $source = 'audio-sources/'.$audio->id.'.mp3';
    Storage::disk('local')->put($source, 'ID3'.random_bytes(4000)); // signature valide, contenu inexploitable
    $audio->forceFill(['chemin_source' => $source])->save();

    traiter($audio->id);

    $audio->refresh();
    expect($audio->statut)->toBe('erreur')
        ->and($audio->message_erreur)->toBe('Le traitement du fichier a échoué. Réessayez avec un autre enregistrement.')
        ->and($audio->chemin_source)->toBeNull()
        ->and(Storage::disk('local')->exists($source))->toBeFalse()
        ->and(Storage::disk('public')->allFiles())->toBe([]);

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-admin' && $e->rubrique === 'audio');

    // Suivi : erreur générique, rien de technique ; la case de la matrice est « erreur » et compte comme manquante.
    $suivi = $this->getJson("/api/v1/admin/audio/{$audio->id}")->assertOk()->assertJsonPath('audio.statut', 'erreur')->assertJsonPath('audio.url_ecoute', null);
    expect($suivi->json('audio.erreur'))->toContain('a échoué')->and($suivi->getContent())->not->toContain('RuntimeException')->not->toContain('ffmpeg');

    $this->getJson('/api/v1/admin/audio/matrice?langue=wo')->assertOk()
        ->assertJsonPath('cles.0.etats.wo.statut', 'erreur')
        ->assertJsonPath('couverture.wo.manquants', 1)->assertJsonPath('couverture.wo.essentielles_manquantes', 1);
    $this->getJson('/api/v1/admin/audio/matrice?langue=wo&manquants=1')->assertOk()->assertJsonCount(1, 'cles');

    // Une erreur ne se publie pas, mais se supprime.
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$audio->id]])->assertStatus(409)->assertJsonPath('code', 'AUDIO_NON_PUBLIABLE');
    $this->deleteJson("/api/v1/admin/audio/{$audio->id}")->assertNoContent();
});

it('ne retraite jamais un audio qui n\'est plus « en_traitement » et ignore un identifiant inconnu', function () {
    $audio = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => 'audio/wo/caisse.encaisser.aaaaaaaa.mp3', 'empreinte' => str_repeat('a', 64), 'statut' => 'publie', 'publie_at' => now()]);

    traiter($audio->id);
    traiter(987654);

    expect($audio->fresh()->statut)->toBe('publie');
});

it('refuse de supprimer un audio en cours de traitement et de publier un traitement non terminé', function () {
    superAdminPret();
    $audio = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => '', 'empreinte' => str_repeat('0', 64), 'statut' => 'en_traitement']);

    $this->deleteJson("/api/v1/admin/audio/{$audio->id}")->assertStatus(409)->assertJsonPath('code', 'AUDIO_NON_SUPPRIMABLE');
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$audio->id]])->assertStatus(409);
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$audio->id, 999999]])->assertNotFound()->assertJsonPath('code', 'AUDIO_INTROUVABLE');
    $this->getJson("/api/v1/admin/audio/{$audio->id}/ecouter")->assertNotFound();
});

it('publie en lot plusieurs brouillons en une requête, une seule version publiée par clé et par langue', function () {
    superAdminPret();
    $cle2 = CleAudio::create(['cle' => 'nav.ventes', 'ecran' => 'navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales', 'ordre' => 2]);
    $ids = [];
    foreach ([[$this->cle, 'wo', 'a'], [$this->cle, 'ff', 'b'], [$cle2, 'wo', 'c']] as [$cle, $langue, $car]) {
        $ids[] = Audio::create(['cle_audio_id' => $cle->id, 'langue' => $langue, 'chemin' => Audio::cheminPublic($langue, $cle->cle, str_repeat($car, 64)), 'empreinte' => str_repeat($car, 64), 'duree_ms' => 500, 'statut' => 'brouillon'])->id;
    }

    $this->postJson('/api/v1/admin/audio/publier', ['ids' => $ids])->assertOk()->assertJsonPath('publies', 3);
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$ids[0], $ids[0]]])->assertStatus(422); // doublon

    expect(Audio::where('statut', 'publie')->count())->toBe(3);
    $this->getJson('/api/v1/admin/audio/matrice')->assertOk()->assertJsonPath('couverture.wo.publies', 2)->assertJsonPath('couverture.ff.publies', 1)->assertJsonPath('couverture.wo.pct', 100);
});

it('le manifeste refuse une langue inconnue et ne liste que des URL versionnées de la langue demandée', function () {
    Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'ff', 'chemin' => Audio::cheminPublic('ff', 'caisse.encaisser', str_repeat('f', 64)), 'empreinte' => str_repeat('f', 64), 'statut' => 'publie', 'publie_at' => now()]);

    $this->getJson('/api/v1/audio/manifeste/xx')->assertNotFound();
    $this->getJson('/api/v1/audio/manifeste/ABC')->assertNotFound();
    $ff = $this->getJson('/api/v1/audio/manifeste/ff')->assertOk();
    expect($ff->json('audios'))->toBe(['caisse.encaisser' => url('/audio/ff/caisse.encaisser.ffffffff.mp3')]);
    expect($this->getJson('/api/v1/audio/manifeste/wo')->json('audios'))->toBe([]);
});

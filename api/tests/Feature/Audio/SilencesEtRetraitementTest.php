<?php

use App\Events\DonneesModifiees;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\TraitementAudio;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

/*
|--------------------------------------------------------------------------
| Traitement des silences (CONTRAT_API V3.12) : seuil adaptatif au bruit d'un micro de téléphone,
| début / fin coupés avec marges, pauses internes raccourcies ; commande audio:retraiter.
|--------------------------------------------------------------------------
*/

/**
 * Prise « téléphone » : 1,5 s de silence, mot de 0,6 s, 1,2 s de silence, mot de 0,6 s, 1 s de silence,
 * le tout sous un bruit de fond rose (≈ -48 dBFS : l'ancien seuil fixe de -45 dB ne coupait rien).
 */
function priseTelephone(string $format = 'wav', float $bruit = 0.03): string
{
    Storage::disk('local')->makeDirectory('tests');
    $chemin = Storage::disk('local')->path('tests/'.bin2hex(random_bytes(4)).'.'.$format);
    $codec = $format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '48k'] : [];
    $p = new Process(array_merge([
        'ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
        '-f', 'lavfi', '-i', 'aevalsrc=0:d=1.5', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6',
        '-f', 'lavfi', '-i', 'aevalsrc=0:d=1.2', '-f', 'lavfi', '-i', 'sine=frequency=550:duration=0.6',
        '-f', 'lavfi', '-i', 'aevalsrc=0:d=1', '-f', 'lavfi', '-i', "anoisesrc=color=pink:amplitude={$bruit}:duration=4.9:seed=7",
        '-filter_complex', '[0][1][2][3][4]concat=n=5:v=0:a=1,aformat=sample_rates=44100:channel_layouts=mono,volume=0.5[v];'
            .'[5]aformat=sample_rates=44100:channel_layouts=mono[b];[v][b]amix=inputs=2:normalize=0',
        '-ar', '44100', '-ac', '1',
    ], $codec, [$chemin]));
    $p->setTimeout(30)->run();
    expect($p->isSuccessful())->toBeTrue($p->getErrorOutput());

    return $chemin;
}

/** Fichier lavfi quelconque (ton continu, bruit seul…). */
function sonLavfi(string $source, string $format = 'wav'): string
{
    Storage::disk('local')->makeDirectory('tests');
    $chemin = Storage::disk('local')->path('tests/'.bin2hex(random_bytes(4)).'.'.$format);
    $codec = $format === 'mp3' ? ['-c:a', 'libmp3lame', '-b:a', '48k'] : [];
    $p = new Process(array_merge(['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', $source, '-ar', '44100', '-ac', '1'], $codec, [$chemin]));
    $p->setTimeout(30)->run();
    expect($p->isSuccessful())->toBeTrue($p->getErrorOutput());

    return $chemin;
}

function dureeMs(string $chemin): int
{
    return (int) app(InspecteurAudio::class)->duree($chemin);
}

function sortieMp3(): string
{
    return Storage::disk('local')->path('tests/'.bin2hex(random_bytes(4)).'.mp3');
}

/** Audio stocké en base (contenu = fichier $chemin) dans le statut demandé. */
function audioStocke(CleAudio $cle, string $langue, string $chemin, string $statut): Audio
{
    $contenu = (string) file_get_contents($chemin);
    $empreinte = hash('sha256', $contenu);
    $audio = Audio::create([
        'cle_audio_id' => $cle->id, 'langue' => $langue, 'chemin' => Audio::cheminPublic($langue, $cle->cle, $empreinte), 'empreinte' => $empreinte,
        'duree_ms' => dureeMs($chemin), 'taille' => strlen($contenu), 'statut' => $statut, 'publie_at' => $statut === 'publie' ? now() : null,
    ]);

    return contenuAudioEnBase($audio, $contenu);
}

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    Storage::fake('cache-audio');
    $this->cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);
    $this->cle2 = CleAudio::create(['cle' => 'nav.ventes', 'ecran' => 'navigation', 'texte_fr' => 'Ventes', 'texte_en' => 'Sales', 'ordre' => 2]);
});

it('calcule un seuil adaptatif borné à partir du bruit de fond (fonction pure)', function () {
    // Micro de téléphone : bruit -48 dBFS, voix -27 dBFS → au-dessus du bruit, sous la voix.
    $telephone = array_merge(array_fill(0, 80, -48.0), array_fill(0, 20, -27.0));
    expect(TraitementAudio::seuilAdaptatif($telephone))->toBe(-37.5);

    // Silence numérique (« -inf ») : borne basse.
    expect(TraitementAudio::seuilAdaptatif(array_merge(array_fill(0, 50, '-inf'), array_fill(0, 10, -20.0))))->toBe(-55.0)
        // Tout est fort (aucun silence) : borne haute, jamais au-dessus de -30 dBFS.
        ->and(TraitementAudio::seuilAdaptatif(array_fill(0, 40, -12.0)))->toBe(-30.0)
        // Voix faible, peu au-dessus du bruit : à mi-chemin, pour ne pas couper la voix.
        ->and(TraitementAudio::seuilAdaptatif(array_merge(array_fill(0, 60, -50.0), array_fill(0, 40, -42.0))))->toBe(-46.0)
        // Mesure absente ou inexploitable : repli fixe.
        ->and(TraitementAudio::seuilAdaptatif([]))->toBe(TraitementAudio::SEUIL_REPLI_DB)
        ->and(TraitementAudio::seuilAdaptatif(['abc', -20.0]))->toBe(TraitementAudio::SEUIL_REPLI_DB);

    // Les valeurs de la chaîne de filtres sont toujours bornées et numériques.
    expect(TraitementAudio::filtres(-999))->toContain('start_threshold=-55.0dB')
        ->and(TraitementAudio::filtres(0))->toContain('stop_threshold=-30.0dB')
        ->and(TraitementAudio::filtres(-40))->toContain('stop_periods=-1:stop_duration=0.25')->toContain('start_silence=0.10')->toContain('start_silence=0.12');
});

it('coupe les blancs d\'une prise de téléphone : début, fin et pause interne, sans manger les mots', function () {
    $source = priseTelephone();
    $sortie = sortieMp3();

    $resultat = app(TraitementAudio::class)->convertirEnMp3($source, $sortie);
    $duree = dureeMs($sortie);

    // Voix 1,2 s + pause ramenée à 0,25 s + 100 ms avant + 120 ms après ≈ 1,67 s (contre 4,9 s en entrée).
    expect(dureeMs($source))->toBe(4900)
        ->and($resultat['decoupe'])->toBeTrue()
        ->and($resultat['seuil_db'])->toBeGreaterThan(-45.0)->toBeLessThan(-30.0)
        ->and($duree)->toBeGreaterThan(1550)  // les deux mots de 0,6 s et la pause courte sont entiers
        ->and($duree)->toBeLessThan(1950);    // la pause de 1,2 s est raccourcie, les blancs du début et de la fin coupés
});

it('laisse intact un enregistrement sans blanc (à quelques dizaines de millisecondes près)', function () {
    $source = sonLavfi('sine=frequency=440:duration=1.5');
    $sortie = sortieMp3();

    app(TraitementAudio::class)->convertirEnMp3($source, $sortie);

    expect(abs(dureeMs($sortie) - 1500))->toBeLessThan(80);
});

it('ne perd jamais un enregistrement sans voix détectable : repli sans découpe', function () {
    $source = sonLavfi('anoisesrc=color=pink:amplitude=0.02:duration=2:seed=3');
    $sortie = sortieMp3();

    $resultat = app(TraitementAudio::class)->convertirEnMp3($source, $sortie);

    expect(dureeMs($sortie))->toBeGreaterThan(1800);
    if (! $resultat['decoupe']) {
        expect(dureeMs($sortie))->toBeGreaterThan(1900);
    }
});

it('audio:retraiter : brouillon remplacé en place, publié → nouvelle version publiée, ancienne archivée et toujours servie', function () {
    Event::fake([DonneesModifiees::class]);

    $brouillon = audioStocke($this->cle, 'wo', priseTelephone('mp3'), 'brouillon');
    $publie = audioStocke($this->cle2, 'wo', priseTelephone('mp3'), 'publie');
    $court = audioStocke($this->cle, 'ff', sonLavfi('sine=frequency=330:duration=1', 'mp3'), 'publie');
    $ancienneUrl = '/'.$publie->chemin;
    $empreinteBrouillon = $brouillon->empreinte;

    $this->artisan('audio:retraiter')->assertSuccessful()->expectsOutputToContain('2 raccourci(s), 1 inchangé(s), 0 erreur(s)');

    // Brouillon : même ligne, contenu raccourci.
    $brouillon->refresh();
    expect($brouillon->statut)->toBe('brouillon')
        ->and($brouillon->empreinte)->not->toBe($empreinteBrouillon)
        ->and($brouillon->duree_ms)->toBeLessThan(2100)
        ->and($brouillon->chemin)->toContain(substr($brouillon->empreinte, 0, 8))
        ->and(DB::table('audio_fichiers')->where('audio_id', $brouillon->id)->value('empreinte'))->toBe($brouillon->empreinte)
        ->and(DB::table('audio_fichiers')->where('audio_id', $brouillon->id)->value('octets'))->toBe($brouillon->taille);

    // Publié : une seule version publiée, la nouvelle ; l'ancienne archivée et toujours servie.
    $nouvelle = Audio::query()->where('cle_audio_id', $this->cle2->id)->where('langue', 'wo')->where('statut', 'publie')->sole();
    expect($nouvelle->id)->not->toBe($publie->id)
        ->and($publie->fresh()->statut)->toBe('archive')
        ->and($nouvelle->duree_ms)->toBeLessThan(2100)
        ->and($nouvelle->publie_at)->not->toBeNull();
    $this->get($ancienneUrl)->assertOk();
    $this->get('/'.$nouvelle->chemin)->assertOk()->assertHeader('ETag', '"'.$nouvelle->empreinte.'"');

    // Manifeste : la nouvelle URL ; l'audio déjà court est inchangé.
    $this->getJson('/api/v1/audio/manifeste/wo')->assertOk()->assertJsonPath('audios', ['nav.ventes' => url('/'.$nouvelle->chemin)]);
    expect($court->fresh()->statut)->toBe('publie')->and($court->fresh()->empreinte)->toBe($court->empreinte);

    // Journal sans contenu, un seul signal public « audios ».
    expect(DB::table('journal_audit')->where('action', 'audio.retraite')->count())->toBe(2);
    expect(Event::dispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'plateforme' && $e->rubrique === 'audios'))->toHaveCount(1);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->canal->name === 'private-admin' && $e->rubrique === 'audio');
    expect(Storage::disk('local')->files('audio-sources'))->toBe([]);

    // Seconde passe : plus rien à couper.
    $this->artisan('audio:retraiter')->assertSuccessful()->expectsOutputToContain('0 raccourci(s)');
});

it('audio:retraiter --simulation n\'écrit rien ; --langue filtre et refuse une langue inconnue', function () {
    $publie = audioStocke($this->cle, 'wo', priseTelephone('mp3'), 'publie');
    $autre = audioStocke($this->cle, 'ff', priseTelephone('mp3'), 'brouillon');
    $nombre = Audio::count();

    $this->artisan('audio:retraiter', ['--simulation' => true])->assertSuccessful()->expectsOutputToContain('SIMULATION — 2 audio(s) examiné(s) : 2 raccourci(s)');
    expect(Audio::count())->toBe($nombre)
        ->and($publie->fresh()->empreinte)->toBe($publie->empreinte)->and($publie->fresh()->statut)->toBe('publie')
        ->and(DB::table('journal_audit')->where('action', 'audio.retraite')->count())->toBe(0);

    $this->artisan('audio:retraiter', ['--langue' => 'xx'])->assertFailed();
    $this->artisan('audio:retraiter', ['--langue' => '../wo'])->assertFailed();

    $this->artisan('audio:retraiter', ['--langue' => 'ff'])->assertSuccessful()->expectsOutputToContain('1 audio(s) examiné(s) : 1 raccourci(s)');
    expect($publie->fresh()->statut)->toBe('publie')->and($publie->fresh()->empreinte)->toBe($publie->empreinte)
        ->and($autre->fresh()->empreinte)->not->toBe($autre->empreinte);
});

it('audio:retraiter : un audio sans contenu en base est signalé en erreur sans toucher aux autres', function () {
    $sansContenu = Audio::create(['cle_audio_id' => $this->cle->id, 'langue' => 'wo', 'chemin' => Audio::cheminPublic('wo', 'caisse.encaisser', str_repeat('a', 64)), 'empreinte' => str_repeat('a', 64), 'duree_ms' => 500, 'statut' => 'publie', 'publie_at' => now()]);
    $bon = audioStocke($this->cle2, 'wo', priseTelephone('mp3'), 'brouillon');

    $this->artisan('audio:retraiter')->assertSuccessful()->expectsOutputToContain('1 raccourci(s), 0 inchangé(s), 1 erreur(s)');

    expect($sansContenu->fresh()->statut)->toBe('publie')
        ->and($bon->fresh()->empreinte)->not->toBe($bon->empreinte);
});

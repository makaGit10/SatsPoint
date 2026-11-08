<?php

namespace App\Services\Audio;

use App\Exceptions\ErreurMetier;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Vérifie le TYPE RÉEL d'un fichier audio déposé (CAHIER § 13.2) : signature binaire (jamais l'extension
 * ni le Content-Type annoncé) puis ffprobe (flux audio présent, durée bornée). Toute anomalie → 422.
 */
class InspecteurAudio
{
    /** Signatures acceptées : préfixe → format. */
    private const SIGNATURES = [
        'ID3' => 'mp3',
        'OggS' => 'ogg',
        "\x1A\x45\xDF\xA3" => 'webm',
    ];

    public function __construct(private readonly string $ffprobe, private readonly int $delaiS = 15) {}

    /**
     * @return array{format: string, duree_ms: int}
     *
     * @throws ErreurMetier AUDIO_TYPE_INVALIDE | AUDIO_TROP_LONG | AUDIO_ILLISIBLE
     */
    public function inspecter(string $chemin, int $dureeMaxMs): array
    {
        $format = $this->formatParSignature($chemin)
            ?? throw new ErreurMetier('AUDIO_TYPE_INVALIDE', 'Le fichier n\'est pas un audio reconnu (mp3, wav, m4a, ogg, webm).', 422);

        $sonde = $this->sonder($chemin);

        if ($sonde === null || ! $sonde['audio']) {
            throw new ErreurMetier('AUDIO_ILLISIBLE', 'Le fichier audio est illisible ou ne contient aucune piste audio.', 422);
        }

        if ($sonde['video']) {
            throw new ErreurMetier('AUDIO_TYPE_INVALIDE', 'Le fichier contient une piste vidéo : seuls les fichiers audio sont acceptés.', 422);
        }

        if ($sonde['duree_ms'] > $dureeMaxMs) {
            throw new ErreurMetier('AUDIO_TROP_LONG', sprintf('L\'enregistrement dépasse %d secondes.', intdiv($dureeMaxMs, 1000)), 422);
        }

        return ['format' => $format, 'duree_ms' => $sonde['duree_ms']];
    }

    /** Durée en millisecondes mesurée par ffprobe (null si illisible). */
    public function duree(string $chemin): ?int
    {
        return $this->sonder($chemin)['duree_ms'] ?? null;
    }

    /** Format déduit des premiers octets, ou null. */
    public function formatParSignature(string $chemin): ?string
    {
        $flux = @fopen($chemin, 'rb');

        if ($flux === false) {
            return null;
        }

        $entete = (string) fread($flux, 16);
        fclose($flux);

        if (strlen($entete) < 12) {
            return null;
        }

        foreach (self::SIGNATURES as $signature => $format) {
            if (str_starts_with($entete, $signature)) {
                return $format;
            }
        }

        if (str_starts_with($entete, 'RIFF') && substr($entete, 8, 4) === 'WAVE') {
            return 'wav';
        }

        if (substr($entete, 4, 4) === 'ftyp') {
            return 'm4a';
        }

        // MP3 sans en-tête ID3 : trame de synchronisation 0xFFE (11 bits à 1).
        $octets = unpack('C2', $entete);
        if ($octets[1] === 0xFF && ($octets[2] & 0xE0) === 0xE0) {
            return 'mp3';
        }

        return null;
    }

    /**
     * @return array{audio: bool, video: bool, duree_ms: int}|null
     */
    private function sonder(string $chemin): ?array
    {
        $processus = new Process([
            $this->ffprobe, '-v', 'error', '-hide_banner',
            '-show_entries', 'format=duration:stream=codec_type',
            '-of', 'json', $chemin,
        ]);
        $processus->setTimeout($this->delaiS);

        try {
            $processus->run();
        } catch (ProcessTimedOutException) {
            return null;
        }

        if (! $processus->isSuccessful()) {
            return null;
        }

        $sortie = json_decode($processus->getOutput(), true);

        if (! is_array($sortie)) {
            return null;
        }

        $types = array_column((array) ($sortie['streams'] ?? []), 'codec_type');
        $duree = (float) ($sortie['format']['duration'] ?? 0);

        return [
            'audio' => in_array('audio', $types, true),
            // Certains fichiers audio embarquent une pochette (mjpeg/png « attached_pic ») : on l'ignore, ffmpeg la retire (-vn).
            'video' => in_array('video', $types, true) && $this->contientVraieVideo($chemin),
            'duree_ms' => (int) round($duree * 1000),
        ];
    }

    private function contientVraieVideo(string $chemin): bool
    {
        $processus = new Process([
            $this->ffprobe, '-v', 'error', '-select_streams', 'v',
            '-show_entries', 'stream=codec_name,disposition', '-of', 'json', $chemin,
        ]);
        $processus->setTimeout($this->delaiS);
        $processus->run();

        $sortie = json_decode($processus->getOutput(), true);

        foreach ((array) ($sortie['streams'] ?? []) as $flux) {
            $pochette = (int) ($flux['disposition']['attached_pic'] ?? 0) === 1 || in_array($flux['codec_name'] ?? '', ['mjpeg', 'png', 'bmp', 'gif'], true);
            if (! $pochette) {
                return true;
            }
        }

        return false;
    }
}

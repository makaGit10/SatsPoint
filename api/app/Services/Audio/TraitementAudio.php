<?php

namespace App\Services\Audio;

use RuntimeException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Ré-encodage ffmpeg d'un audio déposé (CAHIER § 6.13) avec PARAMÈTRES FIGÉS et délai maximal :
 * suppression des silences début/fin, normalisation EBU R128 (loudnorm I=-16 TP=-1.5 LRA=11),
 * mono, 48 kHz, MP3 48 kb/s. Aucun paramètre ne vient de l'utilisateur ; le chemin de sortie est généré.
 */
class TraitementAudio
{
    private const FILTRES = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,'
        .'areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,'
        .'loudnorm=I=-16:TP=-1.5:LRA=11';

    public function __construct(
        private readonly string $ffmpeg,
        private readonly int $delaiS = 30,
        private readonly string $debit = '48k',
    ) {}

    /**
     * Convertit $source vers $destination (MP3). Lève une RuntimeException générique en cas d'échec ou de délai.
     */
    public function convertirEnMp3(string $source, string $destination): void
    {
        $processus = new Process([
            $this->ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
            '-i', $source,
            '-vn', '-sn', '-dn',
            '-map_metadata', '-1',
            '-t', '20',
            '-af', self::FILTRES,
            '-ac', '1', '-ar', '48000',
            '-c:a', 'libmp3lame', '-b:a', $this->debit,
            '-f', 'mp3', $destination,
        ]);
        $processus->setTimeout($this->delaiS);

        try {
            $processus->run();
        } catch (ProcessTimedOutException) {
            @unlink($destination);
            throw new RuntimeException('delai_depasse');
        }

        if (! $processus->isSuccessful() || ! is_file($destination) || filesize($destination) < 64) {
            @unlink($destination);
            throw new RuntimeException('conversion_impossible');
        }
    }
}

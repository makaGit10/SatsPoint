<?php

namespace App\Services\Audio;

use RuntimeException;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

/**
 * Ré-encodage ffmpeg d'un audio déposé (CAHIER § 6.13, CONTRAT_API V3.12) avec PARAMÈTRES FIGÉS et délai maximal.
 *
 * 1. Mesure : niveau RMS par fenêtres de 50 ms (passe ffmpeg à part) → bruit de fond (10e centile) et voix (95e centile)
 *    → seuil de silence ADAPTATIF (bruit + 12 dB, au plus à mi-chemin de la voix, borné entre -55 et -30 dBFS ;
 *    repli -40 dBFS si la mesure échoue). Un micro de téléphone a un bruit de fond vers -50/-40 dBFS : un seuil fixe
 *    à -45 dB ne coupait rien.
 * 2. Découpe : coupe-bas 75 Hz (grondement, souffle du vent), silence du début coupé en gardant 100 ms avant la voix,
 *    pauses internes de plus de 0,25 s ramenées à 0,25 s (les silences longs > 0,5 s disparaissent ; le rythme des mots
 *    est conservé), silence de fin coupé en gardant 120 ms (les fins de mots ne sont pas mangées).
 * 3. Normalisation EBU R128 (loudnorm I=-16 TP=-1.5 LRA=11), mono, 48 kHz, MP3 48 kb/s.
 *
 * Si la découpe ne laisse presque rien (aucune voix détectée au-dessus du seuil), repli sur le même traitement SANS
 * découpe : un enregistrement n'est jamais perdu. Aucun paramètre ne vient de l'utilisateur ; chemins générés par l'appelant.
 */
class TraitementAudio
{
    /** Seuil utilisé si la mesure du bruit de fond échoue. */
    public const SEUIL_REPLI_DB = -40.0;

    public const SEUIL_MIN_DB = -55.0;

    public const SEUIL_MAX_DB = -30.0;

    /** Marge au-dessus du bruit de fond. */
    public const MARGE_DB = 12.0;

    /** Silence gardé avant la voix / après la voix, et longueur maximale d'une pause interne (secondes). */
    public const MARGE_DEBUT_S = 0.10;

    public const MARGE_FIN_S = 0.12;

    public const PAUSE_MAX_S = 0.25;

    /** En dessous, la découpe est jugée ratée (aucune voix détectée) : repli sans découpe. */
    public const DUREE_MIN_SORTIE_MS = 150;

    private const NORMALISATION = 'loudnorm=I=-16:TP=-1.5:LRA=11';

    private const COUPE_BAS = 'highpass=f=75';

    public function __construct(
        private readonly string $ffmpeg,
        private readonly int $delaiS = 30,
        private readonly string $debit = '48k',
        private readonly string $ffprobe = 'ffprobe',
    ) {}

    /**
     * Convertit $source vers $destination (MP3). Lève une RuntimeException générique en cas d'échec ou de délai.
     *
     * @return array{seuil_db: float, decoupe: bool} seuil appliqué, et si la découpe des silences a été gardée
     */
    public function convertirEnMp3(string $source, string $destination): array
    {
        $fin = microtime(true) + $this->delaiS;

        $niveaux = $this->mesurerNiveaux($source, $fin);
        $seuil = $niveaux === null ? self::SEUIL_REPLI_DB : self::seuilAdaptatif($niveaux);

        $this->encoder($source, $destination, self::filtres($seuil), $fin);

        $duree = $this->dureeMs($destination, $fin);
        if ($duree !== null && $duree >= self::DUREE_MIN_SORTIE_MS) {
            return ['seuil_db' => $seuil, 'decoupe' => true];
        }

        // Presque rien de gardé : la « voix » était sous le seuil. On garde l'enregistrement entier, normalisé.
        $this->encoder($source, $destination, self::filtresSansDecoupe(), $fin);

        return ['seuil_db' => $seuil, 'decoupe' => false];
    }

    /**
     * Seuil de silence (dBFS) à partir des niveaux RMS mesurés par fenêtres courtes. Fonction pure.
     *
     * @param  list<float|int|string|null>  $niveauxDb  niveaux en dBFS (« -inf » / null = silence numérique)
     */
    public static function seuilAdaptatif(array $niveauxDb): float
    {
        $valeurs = [];
        foreach ($niveauxDb as $n) {
            if (is_numeric($n) && is_finite((float) $n)) {
                $valeurs[] = max(-120.0, min(0.0, (float) $n));
            } elseif ($n === null || (is_string($n) && str_contains(strtolower($n), 'inf'))) {
                $valeurs[] = -120.0;
            }
        }

        if (count($valeurs) < 4) {
            return self::SEUIL_REPLI_DB;
        }

        sort($valeurs);
        $bruit = self::centile($valeurs, 0.10);
        $voix = self::centile($valeurs, 0.95);

        // Au-dessus du bruit, mais jamais plus haut qu'à mi-chemin de la voix (voix faible ou micro bruyant).
        $seuil = min($bruit + self::MARGE_DB, $bruit + ($voix - $bruit) / 2);

        return round(max(self::SEUIL_MIN_DB, min(self::SEUIL_MAX_DB, $seuil)), 1);
    }

    /** Chaîne de filtres complète pour un seuil donné (valeurs numériques uniquement, formatées ici). */
    public static function filtres(float $seuilDb): string
    {
        $s = sprintf('%.1fdB', max(self::SEUIL_MIN_DB, min(self::SEUIL_MAX_DB, $seuilDb)));
        $detection = 'detection=rms:window=0.02';

        return implode(',', [
            self::COUPE_BAS,
            // Début : coupé jusqu'à la voix (100 ms gardées) ; pauses internes > 0,25 s ramenées à 0,25 s.
            sprintf(
                'silenceremove=start_periods=1:start_threshold=%s:start_silence=%.2f:stop_periods=-1:stop_duration=%.2f:stop_silence=0:stop_threshold=%s:%s',
                $s, self::MARGE_DEBUT_S, self::PAUSE_MAX_S, $s, $detection,
            ),
            // Fin : même découpe sur le signal retourné, 120 ms gardées après le dernier mot.
            'areverse',
            sprintf('silenceremove=start_periods=1:start_threshold=%s:start_silence=%.2f:%s', $s, self::MARGE_FIN_S, $detection),
            'areverse',
            self::NORMALISATION,
        ]);
    }

    public static function filtresSansDecoupe(): string
    {
        return self::COUPE_BAS.','.self::NORMALISATION;
    }

    /**
     * Niveaux RMS (dBFS) par fenêtres de 50 ms, ou null si la mesure échoue.
     *
     * @return list<string>|null
     */
    private function mesurerNiveaux(string $source, float $fin): ?array
    {
        $processus = new Process([
            $this->ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error',
            '-i', $source, '-vn', '-sn', '-dn', '-t', '20',
            '-af', 'aformat=channel_layouts=mono,aresample=16000,'.self::COUPE_BAS
                .',asetnsamples=n=800,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-',
            '-f', 'null', '-',
        ]);
        $processus->setTimeout(max(1, min(10, $fin - microtime(true))));

        try {
            $processus->run();
        } catch (ProcessTimedOutException) {
            return null;
        }

        if (! $processus->isSuccessful()) {
            return null;
        }

        preg_match_all('/RMS_level=(-?inf|-?[0-9.]+)/i', $processus->getOutput(), $m);

        return $m[1] === [] ? null : $m[1];
    }

    private function encoder(string $source, string $destination, string $filtres, float $fin): void
    {
        $processus = new Process([
            $this->ffmpeg, '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
            '-i', $source,
            '-vn', '-sn', '-dn',
            '-map_metadata', '-1',
            '-t', '20',
            '-af', $filtres,
            '-ac', '1', '-ar', '48000',
            '-c:a', 'libmp3lame', '-b:a', $this->debit,
            '-f', 'mp3', $destination,
        ]);
        $processus->setTimeout(max(1, $fin - microtime(true)));

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

    private function dureeMs(string $chemin, float $fin): ?int
    {
        $processus = new Process([$this->ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', $chemin]);
        $processus->setTimeout(max(1, min(10, $fin - microtime(true))));

        try {
            $processus->run();
        } catch (ProcessTimedOutException) {
            return null;
        }

        $sortie = trim($processus->getOutput());

        return $processus->isSuccessful() && is_numeric($sortie) ? (int) round((float) $sortie * 1000) : null;
    }

    /** @param  list<float>  $tries  valeurs triées */
    private static function centile(array $tries, float $p): float
    {
        $i = (int) floor($p * (count($tries) - 1));

        return $tries[max(0, min(count($tries) - 1, $i))];
    }
}

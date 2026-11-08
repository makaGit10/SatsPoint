<?php

namespace App\Services;

use App\Exceptions\CoursIndisponible;
use App\Models\CoursChange as CoursChangeModel;
use App\Support\Conversion;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Cours BTC/XOF (CAHIER § 7.1) : médiane de 3 sources BTC/EUR (Kraken, Bitstamp, CoinGecko),
 * écart > 2 % écarté, parité fixe 1 EUR = 655,957 XOF, cache 60 s, historique en base.
 * Aucun cours de moins de 10 minutes → `disponible = false` : l'encaissement Lightning est bloqué.
 */
class CoursChange
{
    public const CLE_CACHE = 'cours:actuel';

    public const CACHE_S = 60;

    public const FRAICHEUR_MAX_S = 600;

    public const ECART_MAX = 0.02;

    private const DELAI_SOURCE_S = 6;

    /** @var array<string, string> */
    public const SOURCES = [
        'kraken' => 'https://api.kraken.com/0/public/Ticker?pair=XBTEUR',
        'bitstamp' => 'https://www.bitstamp.net/api/v2/ticker/btceur/',
        'coingecko' => 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur',
    ];

    /**
     * Dernier cours connu (cache puis base) sous la forme du contrat :
     * { disponible, btc_xof, recupere_le, age_s, sources }.
     */
    public function actuel(): array
    {
        $cours = Cache::get(self::CLE_CACHE);

        if (! is_array($cours)) {
            $ligne = CoursChangeModel::query()
                ->where('source', CoursChangeModel::SOURCE_MEDIANE)
                ->orderByDesc('recupere_at')
                ->first(['btc_eur', 'btc_xof', 'nb_sources', 'recupere_at']);

            if ($ligne === null) {
                return ['disponible' => false, 'btc_xof' => null, 'recupere_le' => null, 'age_s' => null, 'sources' => 0];
            }

            $cours = [
                'btc_eur' => (float) $ligne->btc_eur,
                'btc_xof' => (int) round((float) $ligne->btc_xof),
                'sources' => (int) $ligne->nb_sources,
                'recupere_at' => $ligne->recupere_at->getTimestamp(),
            ];

            // Remis en cache pour le reste de sa fenêtre de fraîcheur (évite une requête SQL par appel).
            $reste = self::CACHE_S - (time() - $cours['recupere_at']);
            if ($reste > 0) {
                Cache::put(self::CLE_CACHE, $cours, $reste);
            }
        }

        $age = max(0, time() - (int) $cours['recupere_at']);

        return [
            'disponible' => $age <= self::FRAICHEUR_MAX_S,
            'btc_xof' => (int) $cours['btc_xof'],
            'recupere_le' => gmdate(DATE_ATOM, (int) $cours['recupere_at']),
            'age_s' => $age,
            'sources' => (int) $cours['sources'],
        ];
    }

    /** Cours BTC/XOF entier, obligatoirement frais (< 10 min), sinon exception métier. */
    public function exigerBtcXof(): int
    {
        $cours = $this->actuel();

        if (! $cours['disponible'] || $cours['btc_xof'] === null || $cours['btc_xof'] <= 0) {
            throw new CoursIndisponible;
        }

        return $cours['btc_xof'];
    }

    /**
     * Interroge les trois sources, calcule la médiane, écarte les sources déviantes, enregistre et met en cache.
     * Retourne le cours retenu, ou null si aucun cours fiable n'a pu être établi (l'ancien reste en place).
     *
     * @return array{btc_eur: float, btc_xof: int, sources: int, recupere_at: int}|null
     */
    public function rafraichir(): ?array
    {
        $valeurs = $this->interrogerSources();

        if ($valeurs === []) {
            Log::warning('cours: aucune source n\'a répondu');

            return null;
        }

        $mediane = $this->mediane(array_values($valeurs));
        $retenues = array_filter($valeurs, fn (float $v) => abs($v - $mediane) / $mediane <= self::ECART_MAX);

        foreach (array_diff_key($valeurs, $retenues) as $source => $valeur) {
            Log::warning('cours: source écartée (écart > 2 % de la médiane)', ['source' => $source, 'ecart_pct' => round(abs($valeur - $mediane) / $mediane * 100, 2)]);
        }

        if ($retenues === []) {
            return null;
        }

        $valeurRetenue = $this->mediane(array_values($retenues));

        // Une seule source disponible : pas de recoupement possible → acceptée seulement si elle reste
        // cohérente (± 2 %) avec le dernier cours connu, s'il existe (parade « manipulation du cours »).
        if (count($retenues) < 2) {
            $precedent = $this->actuel();
            if ($precedent['btc_xof'] !== null) {
                $btcXofCandidat = Conversion::eurVersXof($valeurRetenue);
                if (abs($btcXofCandidat - $precedent['btc_xof']) / $precedent['btc_xof'] > self::ECART_MAX) {
                    Log::warning('cours: source unique incohérente avec le dernier cours, ignorée', ['source' => array_key_first($retenues)]);

                    return null;
                }
            }
            Log::info('cours: une seule source disponible', ['source' => array_key_first($retenues)]);
        }

        $maintenant = now();
        $btcXof = Conversion::eurVersXof($valeurRetenue);

        DB::transaction(function () use ($retenues, $valeurRetenue, $btcXof, $maintenant) {
            foreach ($retenues as $source => $valeur) {
                CoursChangeModel::create([
                    'source' => $source,
                    'btc_eur' => round($valeur, 2),
                    'btc_xof' => Conversion::eurVersXof($valeur),
                    'nb_sources' => 1,
                    'recupere_at' => $maintenant,
                ]);
            }

            CoursChangeModel::create([
                'source' => CoursChangeModel::SOURCE_MEDIANE,
                'btc_eur' => round($valeurRetenue, 2),
                'btc_xof' => $btcXof,
                'nb_sources' => count($retenues),
                'recupere_at' => $maintenant,
            ]);
        });

        $cours = [
            'btc_eur' => round($valeurRetenue, 2),
            'btc_xof' => $btcXof,
            'sources' => count($retenues),
            'recupere_at' => $maintenant->getTimestamp(),
        ];

        Cache::put(self::CLE_CACHE, $cours, self::CACHE_S);

        return $cours;
    }

    /** Purge l'historique au-delà de 30 jours (une ligne par minute et par source : ~175 000 lignes/mois). */
    public function purger(int $jours = 30): int
    {
        return CoursChangeModel::query()->where('recupere_at', '<', now()->subDays($jours))->delete();
    }

    /** @return array<string, float> valeurs BTC/EUR par source ayant répondu correctement */
    private function interrogerSources(): array
    {
        $reponses = Http::pool(fn ($pool) => array_map(
            fn (string $nom, string $url) => $pool->as($nom)->timeout(self::DELAI_SOURCE_S)->connectTimeout(3)->acceptJson()
                ->withHeaders(['User-Agent' => 'SatsPoint/'.config('satspoint.version')])->get($url),
            array_keys(self::SOURCES),
            self::SOURCES,
        ));

        $valeurs = [];

        foreach (self::SOURCES as $nom => $url) {
            $reponse = $reponses[$nom] ?? null;

            if (! $reponse instanceof Response || ! $reponse->successful()) {
                Log::info('cours: source indisponible', ['source' => $nom]);

                continue;
            }

            $valeur = $this->extraire($nom, $reponse->json());

            if ($valeur === null || $valeur <= 0 || ! is_finite($valeur)) {
                Log::warning('cours: réponse illisible', ['source' => $nom]);

                continue;
            }

            $valeurs[$nom] = $valeur;
        }

        return $valeurs;
    }

    private function extraire(string $source, mixed $json): ?float
    {
        if (! is_array($json)) {
            return null;
        }

        $brut = match ($source) {
            'kraken' => (function () use ($json) {
                $resultat = $json['result'] ?? null;
                if (! is_array($resultat) || $resultat === []) {
                    return null;
                }
                $paire = $resultat['XXBTZEUR'] ?? reset($resultat);

                return is_array($paire) ? ($paire['c'][0] ?? null) : null;
            })(),
            'bitstamp' => $json['last'] ?? null,
            'coingecko' => $json['bitcoin']['eur'] ?? null,
            default => null,
        };

        return is_numeric($brut) ? (float) $brut : null;
    }

    /** @param  list<float>  $valeurs */
    private function mediane(array $valeurs): float
    {
        sort($valeurs);
        $n = count($valeurs);

        return $n % 2 === 1 ? $valeurs[intdiv($n, 2)] : ($valeurs[$n / 2 - 1] + $valeurs[$n / 2]) / 2;
    }
}

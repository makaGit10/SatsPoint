<?php

namespace App\Services;

use App\Models\CleAudio;
use App\Models\Langue;
use App\Models\Pays;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Catalogue public des pays et des langues (CONTRAT_API § 14.1) — source unique des langues de l'aide vocale.
 *
 * Lecture mise en cache (une requête par heure au plus) ; toute écriture sur `pays`, `langues` ou
 * `moyens_paiement` invalide le cache (événements des modèles). Si les tables n'existent pas encore
 * (migration en cours), repli documenté sur config('satspoint.langues_audio') et le Sénégal.
 */
class Catalogue
{
    public const CLE_CACHE = 'catalogue.public.v1';

    private const CACHE_S = 3600;

    /** @return array{pays: list<array<string, mixed>>, langues: list<array<string, mixed>>, codes_langues: list<string>} */
    public static function publique(): array
    {
        $enCache = Cache::get(self::CLE_CACHE);

        if (is_array($enCache)) {
            return $enCache;
        }

        [$catalogue, $fiable] = self::construire();

        // Le repli (tables absentes) n'est jamais mis en cache : la vraie liste sera relue dès que possible.
        if ($fiable) {
            Cache::put(self::CLE_CACHE, $catalogue, self::CACHE_S);
        }

        return $catalogue;
    }

    /** Langues actives (forme publique), triées par ordre. */
    public static function languesActives(): array
    {
        return self::publique()['langues'];
    }

    /** @return list<string> codes des langues actives */
    public static function codesLanguesActives(): array
    {
        return array_column(self::languesActives(), 'code');
    }

    /** @return list<string> codes de toutes les langues existantes (actives ou non) : manifestes, fichiers. */
    public static function codesLangues(): array
    {
        return self::publique()['codes_langues'];
    }

    /** @return list<string> codes des pays actifs */
    public static function codesPaysActifs(): array
    {
        return array_column(self::publique()['pays'], 'code');
    }

    /** Ancienne forme `langues_audio` de GET /config : { code, nom (= nom_fr), nom_local }. */
    public static function languesAudio(): array
    {
        return array_map(fn (array $l) => ['code' => $l['code'], 'nom' => $l['nom_fr'], 'nom_local' => $l['nom_local']], self::languesActives());
    }

    public static function invalider(): void
    {
        Cache::forget(self::CLE_CACHE);
    }

    /**
     * Clé vocale `langue.{code}` (nom de la langue dit dans la langue elle-même) : créée ou mise à jour pour qu'elle
     * s'enregistre au studio comme les clés du code. Jamais retirée par audio:synchroniser tant que la langue existe.
     */
    public static function assurerCleVocale(Langue $langue): CleAudio
    {
        $cle = CleAudio::query()->firstOrNew(['cle' => $langue->cleVocale()]);

        $cle->fill([
            'ecran' => 'langue',
            'contexte' => mb_substr('Tuile de langue : dit « '.$langue->nom_local.' » en '.$langue->nom_fr, 0, 200),
            'texte_fr' => $langue->nom_fr,
            'texte_en' => $langue->nom_en,
            'essentielle' => true,
            'presente_dans_code' => true,
        ]);

        if (! $cle->exists) {
            // Après les clés du code : le registre met les essentielles en tête, celle-ci arrive à la fin du bloc.
            $cle->ordre = (int) CleAudio::query()->max('ordre') + 1;
        }

        if ($cle->isDirty()) {
            $cle->save();
        }

        return $cle;
    }

    /** @return array{0: array, 1: bool} [catalogue, lu en base ?] */
    private static function construire(): array
    {
        try {
            $pays = Pays::query()->where('actif', true)->orderBy('ordre')->orderBy('nom_fr')->get();
            $langues = Langue::query()->orderBy('ordre')->orderBy('code')->get();

            return [[
                'pays' => $pays->map(fn (Pays $p) => $p->formePublique())->values()->all(),
                'langues' => $langues->where('actif', true)->map(fn (Langue $l) => $l->formePublique())->values()->all(),
                'codes_langues' => $langues->pluck('code')->values()->all(),
            ], true];
        } catch (\Throwable $e) {
            // Tables absentes (avant migration) : repli sur l'ancienne liste figée (config satspoint.langues_audio).
            Log::warning('catalogue: lecture impossible, repli sur la configuration', ['erreur' => $e::class]);

            $langues = array_map(fn (array $l, int $i) => [
                'code' => $l['code'], 'nom_local' => $l['nom_local'], 'nom_fr' => $l['nom'], 'nom_en' => $l['nom'],
                'pays' => $l['code'] === Langue::FRANCAIS ? [] : [Pays::SENEGAL], 'ordre' => $i + 1,
            ], (array) config('satspoint.langues_audio'), array_keys((array) config('satspoint.langues_audio')));

            return [[
                'pays' => [['code' => Pays::SENEGAL, 'nom_fr' => 'Sénégal', 'nom_en' => 'Senegal', 'indicatif' => '+221']],
                'langues' => $langues,
                'codes_langues' => array_column($langues, 'code'),
            ], false];
        }
    }
}

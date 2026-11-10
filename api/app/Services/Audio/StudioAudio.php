<?php

namespace App\Services\Audio;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Api\V1\ManifesteAudioController;
use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\User;
use App\Services\Catalogue;
use App\Services\Diffuseur;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Studio audio du super-admin (CAHIER § 6.13) : matrice clés × langues, dépôt, publication, suppression.
 */
class StudioAudio
{
    public function __construct(
        private readonly InspecteurAudio $inspecteur,
        private readonly Diffuseur $diffuseur,
        private readonly StockageAudio $stockage,
    ) {}

    /** @return list<string> langues ACTIVES du catalogue (CONTRAT_API § 14.5), triées par ordre */
    public static function langues(): array
    {
        return Catalogue::codesLanguesActives();
    }

    /**
     * Matrice (CONTRAT_API vague 3 § 1) : couverture par langue et liste des clés avec l'état par langue.
     *
     * @param  array{langue?: ?string, ecran?: ?string, manquants?: bool, q?: ?string}  $filtres
     */
    public function matrice(array $filtres = []): array
    {
        $langues = self::langues();

        $cles = CleAudio::query()
            ->where('presente_dans_code', true)
            ->when(filled($filtres['ecran'] ?? null), fn ($q) => $q->where('ecran', $filtres['ecran']))
            ->when(filled($filtres['q'] ?? null), function ($q) use ($filtres) {
                $terme = '%'.mb_strtolower(trim((string) $filtres['q'])).'%';
                $q->where(fn ($r) => $r->whereRaw('LOWER(cle) LIKE ?', [$terme])
                    ->orWhereRaw('f_unaccent(LOWER(texte_fr)) LIKE f_unaccent(?)', [$terme])
                    ->orWhereRaw('LOWER(texte_en) LIKE ?', [$terme])
                    ->orWhereRaw('f_unaccent(LOWER(COALESCE(contexte, \'\'))) LIKE f_unaccent(?)', [$terme]));
            })
            ->orderByDesc('essentielle')->orderBy('ordre')->orderBy('cle')
            ->get(['id', 'cle', 'ecran', 'contexte', 'texte_fr', 'texte_en', 'essentielle', 'ordre']);

        // Un seul passage sur les audios utiles (publiés + brouillons + traitements + erreurs ; pas les archives).
        $audios = Audio::query()
            ->whereIn('cle_audio_id', $cles->pluck('id'))
            ->whereIn('statut', [Audio::STATUT_PUBLIE, Audio::STATUT_BROUILLON, Audio::STATUT_EN_TRAITEMENT, Audio::STATUT_ERREUR])
            ->orderBy('id')
            ->get(['id', 'cle_audio_id', 'langue', 'chemin', 'statut', 'duree_ms', 'message_erreur', 'updated_at'])
            ->groupBy(fn (Audio $a) => $a->cle_audio_id.'|'.$a->langue);

        $couverture = [];
        foreach ($langues as $langue) {
            $couverture[$langue] = ['publies' => 0, 'brouillons' => 0, 'manquants' => 0, 'total' => 0, 'essentielles_manquantes' => 0];
        }

        $ecrans = CleAudio::query()->where('presente_dans_code', true)->distinct()->orderBy('ecran')->pluck('ecran')->all();
        $lignes = [];

        foreach ($cles as $cle) {
            $etats = [];
            $manqueQuelquePart = false;

            foreach ($langues as $langue) {
                /** @var Collection<int, Audio> $groupe */
                $groupe = $audios->get($cle->id.'|'.$langue, collect());
                $publie = $groupe->firstWhere('statut', Audio::STATUT_PUBLIE);
                // Dernière version non publiée (brouillon prêt, traitement en cours ou erreur).
                $enCours = $groupe->where('statut', '!=', Audio::STATUT_PUBLIE)->sortByDesc('id')->first();

                $couverture[$langue]['total']++;

                if ($publie !== null) {
                    $couverture[$langue]['publies']++;
                    $etat = $this->etat($publie);
                    if ($enCours !== null) {
                        // Ajout au contrat : nouvelle version en préparation, à côté de la version publiée.
                        $etat['nouvelle_version'] = $this->etat($enCours);
                    }
                } elseif ($enCours !== null && $enCours->statut !== Audio::STATUT_ERREUR) {
                    $couverture[$langue]['brouillons']++;
                    $etat = $this->etat($enCours);
                } else {
                    // Rien de prêt (aucun fichier, ou dernier dépôt en erreur) : la case reste « à enregistrer ».
                    $couverture[$langue]['manquants']++;
                    if ($cle->essentielle) {
                        $couverture[$langue]['essentielles_manquantes']++;
                    }
                    $manqueQuelquePart = true;
                    $etat = $enCours !== null ? $this->etat($enCours) : ['statut' => 'manquant'];
                }

                $etats[$langue] = $etat;
            }

            if (filled($filtres['langue'] ?? null)) {
                $langueFiltre = (string) $filtres['langue'];
                $statut = $etats[$langueFiltre]['statut'] ?? 'manquant';
                if (! empty($filtres['manquants']) && ! in_array($statut, ['manquant', 'erreur'], true)) {
                    continue;
                }
                $etats = [$langueFiltre => $etats[$langueFiltre] ?? ['statut' => 'manquant']];
            } elseif (! empty($filtres['manquants']) && ! $manqueQuelquePart) {
                continue;
            }

            $lignes[] = [
                'cle' => $cle->cle,
                'ecran' => $cle->ecran,
                'contexte' => $cle->contexte,
                'texte_fr' => $cle->texte_fr,
                'texte_en' => $cle->texte_en,
                'essentielle' => (bool) $cle->essentielle,
                'ordre' => (int) $cle->ordre,
                'etats' => $etats,
            ];
        }

        foreach ($couverture as &$c) {
            $c['pct'] = $c['total'] > 0 ? (int) round(100 * $c['publies'] / $c['total']) : 0; // ajout au contrat
        }
        unset($c);

        // Colonnes de la matrice : une par langue active ({ code, nom, nom_local, pays }), filtrables par pays côté studio.
        $languesExposees = array_map(fn (array $l) => [
            'code' => $l['code'], 'nom' => $l['nom_fr'], 'nom_local' => $l['nom_local'], 'pays' => $l['pays'],
        ], Catalogue::languesActives());

        return ['langues' => $languesExposees, 'ecrans' => $ecrans, 'couverture' => $couverture, 'cles' => $lignes];
    }

    /** Dépose un fichier : vérification du type réel, stockage hors racine web sous un nom généré, job de traitement. */
    public function deposer(CleAudio $cle, string $langue, UploadedFile $fichier, User $auteur): Audio
    {
        $inspection = $this->inspecteur->inspecter($fichier->getRealPath(), (int) config('satspoint.audio.duree_max_ms'));

        $audio = DB::transaction(function () use ($cle, $langue, $fichier, $auteur, $inspection) {
            $audio = Audio::create([
                'cle_audio_id' => $cle->id,
                'langue' => $langue,
                'chemin' => '',
                'empreinte' => hash_file('sha256', $fichier->getRealPath()),
                'duree_ms' => $inspection['duree_ms'],
                'taille' => (int) $fichier->getSize(),
                'statut' => Audio::STATUT_EN_TRAITEMENT,
                'enregistre_par' => $auteur->id,
            ]);

            $cheminSource = sprintf('%s/%d.%s', config('satspoint.audio.dossier_sources'), $audio->id, $inspection['format']);
            Storage::disk('local')->putFileAs(dirname($cheminSource), $fichier, basename($cheminSource));

            $audio->forceFill(['chemin_source' => $cheminSource])->save();

            return $audio;
        });

        TraiterAudio::dispatch($audio->id);

        Audit::enregistrer('audio.depose', $audio, ['cle' => $cle->cle, 'langue' => $langue, 'format' => $inspection['format'], 'duree_ms' => $inspection['duree_ms']]);

        return $audio->refresh();
    }

    /**
     * Publie des brouillons (par ids, ou le dernier brouillon d'un couple clé/langue). L'ancien publié passe en archive.
     *
     * @param  list<int>  $ids
     * @return list<Audio>
     */
    public function publier(array $ids, User $auteur): array
    {
        $publies = [];

        DB::transaction(function () use ($ids, &$publies) {
            $brouillons = Audio::query()->whereIn('id', $ids)->with('cle:id,cle')->lockForUpdate()->orderBy('id')->get();

            if ($brouillons->count() !== count(array_unique($ids))) {
                throw new ErreurMetier('AUDIO_INTROUVABLE', 'Un des audios demandés n\'existe pas.', 404);
            }

            foreach ($brouillons as $audio) {
                if ($audio->statut !== Audio::STATUT_BROUILLON) {
                    throw new ErreurMetier('AUDIO_NON_PUBLIABLE', 'Seul un brouillon prêt peut être publié.', 409);
                }

                Audio::query()
                    ->where('cle_audio_id', $audio->cle_audio_id)->where('langue', $audio->langue)
                    ->where('statut', Audio::STATUT_PUBLIE)->whereKeyNot($audio->id)
                    ->update(['statut' => Audio::STATUT_ARCHIVE, 'updated_at' => now()]);

                $audio->forceFill(['statut' => Audio::STATUT_PUBLIE, 'publie_at' => now()])->save();
                $publies[] = $audio;
            }
        });

        ManifesteAudioController::invaliderCache();

        foreach ($publies as $audio) {
            Audit::enregistrer('audio.publie', $audio, ['cle' => $audio->cle->cle, 'langue' => $audio->langue], $auteur);
        }

        // Signal public : toutes les applications ouvertes relisent le manifeste (le canal admin est émis par le middleware).
        $this->diffuseur->plateforme('audios', $auteur);

        return $publies;
    }

    /** Dernier brouillon prêt d'un couple clé / langue (404 sinon). */
    public function dernierBrouillon(string $cle, string $langue): Audio
    {
        return Audio::query()
            ->whereHas('cle', fn ($q) => $q->where('cle', $cle))
            ->where('langue', $langue)
            ->where('statut', Audio::STATUT_BROUILLON)
            ->orderByDesc('id')
            ->first() ?? throw new ErreurMetier('AUDIO_INTROUVABLE', 'Aucun brouillon prêt pour cette clé dans cette langue.', 404);
    }

    public function supprimer(Audio $audio, User $auteur): void
    {
        if (! $audio->estSupprimable()) {
            throw new ErreurMetier('AUDIO_NON_SUPPRIMABLE', 'Seul un brouillon ou une archive peut être supprimé.', 409);
        }

        $audio->loadMissing('cle:id,cle');
        $source = $audio->chemin_source;
        // Le contenu en base (audio_fichiers) part avec la ligne (cascade) ; la copie de cache est effacée.
        DB::transaction(fn () => $audio->delete());
        $this->stockage->oublierCache($audio);

        if ($source !== null) {
            Storage::disk('local')->delete($source);
        }

        Audit::enregistrer('audio.supprime', $audio, ['cle' => $audio->cle?->cle, 'langue' => $audio->langue, 'statut' => $audio->statut], $auteur);
    }

    /** État d'une case de la matrice (CONTRAT_API V3.3). */
    private function etat(Audio $audio): array
    {
        $etat = [
            'statut' => $audio->statut,
            'id' => $audio->id,
            'url' => $audio->estPublie() ? $audio->url() : ($audio->statut === Audio::STATUT_BROUILLON ? self::urlEcoute($audio) : null),
            'duree_ms' => $audio->statut === Audio::STATUT_EN_TRAITEMENT ? null : (int) $audio->duree_ms,
            'mis_a_jour_le' => $audio->updated_at?->toIso8601String(),
        ];

        if ($audio->statut === Audio::STATUT_ERREUR) {
            $etat['erreur'] = $audio->message_erreur;
        }

        return $etat;
    }

    /** URL d'écoute du studio (brouillon compris), relative à l'API. */
    public static function urlEcoute(Audio $audio): string
    {
        return url('/api/v1/admin/audio/'.$audio->id.'/ecouter');
    }
}

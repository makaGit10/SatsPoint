<?php

namespace App\Services;

use App\Facades\Audit;
use App\Models\Audio;
use App\Models\Boutique;
use App\Models\CleAudio;
use App\Models\ComptePaytech;
use App\Models\ConnexionWallet;
use App\Models\JournalAudit;
use App\Models\Membre;
use App\Models\Paiement;
use App\Models\User;
use App\Models\Vente;
use App\Services\Audio\StudioAudio;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Console plateforme (CAHIER § 6.16) : liste des boutiques (état de configuration et activité EN NOMBRE),
 * suspension / réactivation, journal d'audit global, indicateurs d'adoption.
 *
 * Le super-admin n'accède JAMAIS aux ventes, au portefeuille ni aux clés PayTech d'une boutique :
 * seules des agrégations (compteurs, dates, booléens) sortent d'ici.
 */
class ConsolePlateforme
{
    public const STATUTS = [Boutique::STATUT_ACTIVE, Boutique::STATUT_SUSPENDUE];

    public function __construct(private readonly Diffuseur $diffuseur) {}

    /**
     * @param  array{q?: ?string, statut?: ?string, curseur?: ?string, limite?: ?int}  $filtres
     */
    public function boutiques(array $filtres): array
    {
        $depuis = now()->subDays(7);

        $requete = Boutique::query()
            ->select('boutiques.*')
            ->selectSub(
                Vente::toutesBoutiques()->selectRaw('COUNT(*)')->whereColumn('ventes.boutique_id', 'boutiques.id')->where('ventes.created_at', '>=', $depuis),
                'ventes_7j',
            )
            ->selectSub(
                Vente::toutesBoutiques()->selectRaw('MAX(created_at)')->whereColumn('ventes.boutique_id', 'boutiques.id'),
                'derniere_vente_le',
            )
            ->selectSub(
                ConnexionWallet::toutesBoutiques()->selectRaw('COUNT(*)')->whereColumn('connexions_wallet.boutique_id', 'boutiques.id')->where('statut', ConnexionWallet::STATUT_ACTIVE),
                'wallet_actif',
            )
            ->selectSub(
                ComptePaytech::toutesBoutiques()->selectRaw('COUNT(*)')->whereColumn('comptes_paytech.boutique_id', 'boutiques.id')->where('statut', ComptePaytech::STATUT_ACTIF),
                'paytech_actif',
            )
            ->with(['membres' => fn ($q) => $q->where('role', Membre::ROLE_PROPRIETAIRE)->where('actif', true)->orderBy('id')->with('user:id,ulid,nom,email,telephone')])
            ->when(filled($filtres['statut'] ?? null), fn ($q) => $q->where('boutiques.statut', $filtres['statut']))
            ->when(filled($filtres['q'] ?? null), function (Builder $q) use ($filtres) {
                $terme = '%'.mb_strtolower(trim((string) $filtres['q'])).'%';
                $q->where(fn ($r) => $r->whereRaw('f_unaccent(LOWER(boutiques.nom)) LIKE f_unaccent(?)', [$terme])
                    ->orWhereRaw('f_unaccent(LOWER(boutiques.ville)) LIKE f_unaccent(?)', [$terme])
                    ->orWhere('boutiques.ulid', strtoupper(trim((string) $filtres['q']))));
            })
            ->orderByDesc('boutiques.created_at')->orderByDesc('boutiques.id');

        $page = $requete->cursorPaginate(min(100, max(1, (int) ($filtres['limite'] ?? 30))), ['*'], 'curseur', $filtres['curseur'] ?? null);

        $boutiques = array_map(fn (Boutique $b) => $this->boutiqueAdmin($b), $page->items());

        return ['boutiques' => $boutiques, 'curseur_suivant' => $page->nextCursor()?->encode()];
    }

    public function boutiqueAdmin(Boutique $b): array
    {
        /** @var Membre|null $proprietaire */
        $proprietaire = $b->relationLoaded('membres') ? $b->membres->first() : null;
        $reglages = $b->reglagesComplets();

        return [
            'ulid' => $b->ulid,
            'nom' => $b->nom,
            'ville' => $b->ville,
            'statut' => $b->statut,
            'cree_le' => $b->created_at?->toIso8601String(),
            'proprietaire' => $proprietaire?->user === null ? null : [
                'nom' => $proprietaire->user->nom,
                'contact' => $proprietaire->user->email ?? $proprietaire->user->telephone,
            ],
            'configuration' => [
                'wallet' => (int) ($b->getAttribute('wallet_actif') ?? 0) > 0,
                'paytech' => (int) ($b->getAttribute('paytech_actif') ?? 0) > 0,
                'paiement_test' => (bool) $reglages['paiement_test'],
            ],
            'activite' => [
                'ventes_7j' => (int) ($b->getAttribute('ventes_7j') ?? 0),
                'derniere_vente_le' => $b->getAttribute('derniere_vente_le') ? CarbonImmutable::parse($b->getAttribute('derniere_vente_le'))->toIso8601String() : null,
            ],
        ];
    }

    /** Suspension (membres déconnectés) ou réactivation, journalisée. */
    public function changerStatut(Boutique $boutique, string $statut, User $auteur): Boutique
    {
        $avant = $boutique->statut;

        if ($avant === $statut) {
            return $boutique;
        }

        DB::transaction(function () use ($boutique, $statut) {
            $boutique->forceFill(['statut' => $statut])->save();

            if ($statut === Boutique::STATUT_SUSPENDUE) {
                // Accès coupé immédiatement : toutes les sessions des membres sont révoquées (cookie « se souvenir » compris).
                User::query()->whereIn('id', $boutique->membres()->pluck('user_id'))->each(fn (User $u) => $u->revoquerSessions());
            }
        });

        // Les écrans ouverts de la boutique relisent leurs données (et reçoivent 403 BOUTIQUE_SUSPENDUE).
        $this->diffuseur->rubrique($boutique, 'parametres', $auteur);

        Audit::enregistrer(
            $statut === Boutique::STATUT_SUSPENDUE ? 'plateforme.boutique_suspendue' : 'plateforme.boutique_reactivee',
            $boutique,
            ['avant' => $avant, 'apres' => $statut, 'boutique' => $boutique->ulid],
            $auteur,
        );

        return $boutique->refresh();
    }

    /**
     * Journal d'audit global, filtrable. Les détails sont déjà assainis à l'écriture (service Audit).
     *
     * @param  array{action?: ?string, boutique?: ?string, utilisateur?: ?string, du?: ?string, au?: ?string, curseur?: ?string, limite?: ?int}  $filtres
     */
    public function journal(array $filtres): array
    {
        $requete = JournalAudit::query()
            ->with(['user:id,ulid,nom', 'boutique:id,ulid,nom'])
            ->when(filled($filtres['action'] ?? null), function (Builder $q) use ($filtres) {
                $action = (string) $filtres['action'];
                str_ends_with($action, '.*') || str_ends_with($action, '.')
                    ? $q->where('action', 'like', rtrim($action, '*').'%')
                    : $q->where('action', $action);
            })
            ->when(filled($filtres['boutique'] ?? null), fn ($q) => $q->whereHas('boutique', fn ($b) => $b->where('ulid', $filtres['boutique'])))
            ->when(filled($filtres['utilisateur'] ?? null), fn ($q) => $q->whereHas('user', fn ($u) => $u->where('ulid', $filtres['utilisateur'])))
            ->when(filled($filtres['du'] ?? null), fn ($q) => $q->where('created_at', '>=', CarbonImmutable::parse($filtres['du'], config('satspoint.boutique.fuseau'))->startOfDay()->utc()))
            ->when(filled($filtres['au'] ?? null), fn ($q) => $q->where('created_at', '<', CarbonImmutable::parse($filtres['au'], config('satspoint.boutique.fuseau'))->addDay()->startOfDay()->utc()))
            ->orderByDesc('created_at')->orderByDesc('id');

        $page = $requete->cursorPaginate(min(100, max(1, (int) ($filtres['limite'] ?? 50))), ['*'], 'curseur', $filtres['curseur'] ?? null);

        $entrees = array_map(fn (JournalAudit $j) => [
            'id' => $j->id,
            'action' => $j->action,
            'cible' => $j->cible_type === null ? null : ['type' => $j->cible_type, 'id' => $j->cible_id],
            'utilisateur' => $j->user === null ? null : ['ulid' => $j->user->ulid, 'nom' => $j->user->nom],
            'boutique' => $j->boutique === null ? null : ['ulid' => $j->boutique->ulid, 'nom' => $j->boutique->nom],
            'ip' => $j->ip,
            'details' => $j->details,
            'cree_le' => $j->created_at?->toIso8601String(),
        ], $page->items());

        return ['entrees' => $entrees, 'curseur_suivant' => $page->nextCursor()?->encode()];
    }

    /** Indicateurs du pitch (CAHIER § 6.16), calculés sur les paiements RÉUSSIS. */
    public function statistiques(): array
    {
        $semaine = now()->subDays(7);
        $mois = now()->subDays(30);

        $reussis = fn () => Paiement::toutesBoutiques()->where('statut', Paiement::STATUT_REUSSI);

        $actifs = (int) $reussis()->where('regle_at', '>=', $semaine)->distinct()->count('boutique_id');
        $paiementsSemaine = (int) $reussis()->where('regle_at', '>=', $semaine)->count();

        $ligne = $reussis()->where('regle_at', '>=', $mois)
            ->selectRaw(
                'COUNT(*) AS total, '
                .'SUM(CASE WHEN methode = ? THEN 1 ELSE 0 END) AS sats, '
                .'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (regle_at - created_at)) * 1000) AS delai_median_ms',
                [Paiement::METHODE_LIGHTNING],
            )
            ->first();

        $total = (int) ($ligne->total ?? 0);
        $sats = (int) ($ligne->sats ?? 0);

        return [
            'commercants_actifs_semaine' => $actifs,
            'paiements_par_commercant_semaine' => $actifs > 0 ? round($paiementsSemaine / $actifs, 1) : 0.0,
            'delai_median_confirmation_ms' => $ligne?->delai_median_ms === null ? null : (int) round((float) $ligne->delai_median_ms),
            'part_sats_pct' => $total > 0 ? (int) round(100 * $sats / $total) : 0,
            'part_mobile_money_pct' => $total > 0 ? (int) round(100 * ($total - $sats) / $total) : 0,
            'paiements_reussis_30j' => $total,
            'boutiques' => [
                'total' => (int) Boutique::query()->count(),
                'actives' => (int) Boutique::query()->where('statut', Boutique::STATUT_ACTIVE)->count(),
                'nouvelles_7j' => (int) Boutique::query()->where('created_at', '>=', $semaine)->count(),
            ],
            'couverture_audio' => $this->couvertureAudio(),
            'periode' => ['semaine_depuis' => $semaine->toIso8601String(), 'mois_depuis' => $mois->toIso8601String()],
        ];
    }

    /** @return array<string, int> pourcentage de clés (présentes dans le code) publiées, par langue */
    private function couvertureAudio(): array
    {
        $total = (int) CleAudio::query()->where('presente_dans_code', true)->count();

        $publies = Audio::query()
            ->join('cles_audio', 'cles_audio.id', '=', 'audios.cle_audio_id')
            ->where('cles_audio.presente_dans_code', true)
            ->where('audios.statut', Audio::STATUT_PUBLIE)
            ->groupBy('audios.langue')
            ->selectRaw('audios.langue, COUNT(*) AS nombre')
            ->pluck('nombre', 'langue');

        $couverture = [];
        foreach (StudioAudio::langues() as $langue) {
            $couverture[$langue] = $total > 0 ? (int) round(100 * (int) ($publies[$langue] ?? 0) / $total) : 0;
        }

        return $couverture;
    }
}

<?php

namespace App\Services;

use App\Models\Membre;
use App\Models\Paiement;
use App\Models\User;
use App\Models\Vente;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Filtres communs à GET /ventes, GET /exports/ventes et au tableau de bord (CONTRAT_API § 4).
 * Les dates sont interprétées dans le fuseau de la boutique ; « aujourd'hui » = journée locale.
 * Un caissier ne voit que SES ventes du jour (CAHIER § 3.3), quels que soient les filtres envoyés.
 */
class RequeteVentes
{
    public const PERIODES = ['aujourdhui', 'hier', '7j', '30j', 'perso'];

    /**
     * @return array{du: CarbonImmutable, au: CarbonImmutable} bornes UTC [du, au[ pour la période demandée
     */
    public static function bornes(string $periode, string $fuseau, ?string $du = null, ?string $au = null): array
    {
        $aujourdhui = CarbonImmutable::now($fuseau)->startOfDay();

        [$debut, $fin] = match ($periode) {
            'hier' => [$aujourdhui->subDay(), $aujourdhui],
            '7j' => [$aujourdhui->subDays(6), $aujourdhui->addDay()],
            '30j' => [$aujourdhui->subDays(29), $aujourdhui->addDay()],
            'perso' => [
                $du !== null ? CarbonImmutable::createFromFormat('Y-m-d', $du, $fuseau)->startOfDay() : $aujourdhui,
                ($au !== null ? CarbonImmutable::createFromFormat('Y-m-d', $au, $fuseau)->startOfDay() : $aujourdhui)->addDay(),
            ],
            default => [$aujourdhui, $aujourdhui->addDay()],
        };

        if ($fin <= $debut) {
            $fin = $debut->addDay();
        }

        return ['du' => $debut->utc(), 'au' => $fin->utc()];
    }

    /**
     * Construit la requête filtrée (sans tri ni pagination).
     *
     * @param  array{periode?: ?string, du?: ?string, au?: ?string, statut?: ?string, methode?: ?string, caissier?: ?string, q?: ?string}  $filtres
     */
    public static function construire(Membre $acteur, User $utilisateur, string $fuseau, array $filtres): Builder
    {
        $requete = Vente::query();

        if ($acteur->estCaissier()) {
            // Caissier : ses ventes, journée locale en cours, quoi qu'il demande.
            $bornes = self::bornes('aujourdhui', $fuseau);
            $requete->where('caissier_id', $utilisateur->id);
        } else {
            $bornes = self::bornes($filtres['periode'] ?? 'aujourdhui', $fuseau, $filtres['du'] ?? null, $filtres['au'] ?? null);

            if (! empty($filtres['caissier'])) {
                $requete->whereHas('caissier', fn ($q) => $q->where('ulid', $filtres['caissier']));
            }
        }

        $requete->where('ventes.created_at', '>=', $bornes['du'])->where('ventes.created_at', '<', $bornes['au']);

        if (! empty($filtres['statut'])) {
            $requete->where('ventes.statut', $filtres['statut']);
        }

        if (! empty($filtres['methode'])) {
            $methode = $filtres['methode'];
            $requete->where(function (Builder $q) use ($methode) {
                // Moyen de la tentative réussie, ou de la dernière tentative en attente si la vente n'est pas payée.
                $q->whereHas('paiementReussi', fn ($p) => $p->where('methode', $methode))
                    ->orWhere(fn ($r) => $r->whereNull('paiement_reussi_id')
                        ->whereHas('paiements', fn ($p) => $p->where('methode', $methode)->where('statut', Paiement::STATUT_EN_ATTENTE)));
            });
        }

        if (! empty($filtres['q'])) {
            self::rechercher($requete, (string) $filtres['q']);
        }

        return $requete;
    }

    /** Recherche par numéro (« V-000012 », « 12 ») ou par montant exact. */
    private static function rechercher(Builder $requete, string $q): void
    {
        $q = trim($q);

        if (preg_match('/^v?-?\s*0*(\d{1,12})$/i', $q, $m) === 1) {
            $nombre = (int) $m[1];
            $estNumeroExplicite = str_starts_with(mb_strtolower($q), 'v');

            $requete->where(function (Builder $r) use ($nombre, $estNumeroExplicite) {
                $r->where('numero', $nombre);
                if (! $estNumeroExplicite) {
                    $r->orWhere('montant_xof', $nombre);
                }
            });

            return;
        }

        // Aucun motif reconnu : aucune ligne (pas de LIKE sur du texte libre, pas de fuite par note).
        $requete->whereRaw('1 = 0');
    }

    /** Totaux sur l'ensemble filtré (pas seulement la page) : { nombre, montant_xof, payees_xof }. */
    public static function totaux(Builder $requete): array
    {
        $ligne = (clone $requete)
            ->reorder()
            ->selectRaw('COUNT(*) AS nombre, COALESCE(SUM(montant_xof), 0) AS montant_xof, COALESCE(SUM(CASE WHEN statut = ? THEN montant_xof ELSE 0 END), 0) AS payees_xof', [Vente::STATUT_PAYEE])
            ->first();

        return [
            'nombre' => (int) ($ligne->nombre ?? 0),
            'montant_xof' => (int) ($ligne->montant_xof ?? 0),
            'payees_xof' => (int) ($ligne->payees_xof ?? 0),
        ];
    }
}

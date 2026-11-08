<?php

namespace App\Services;

use App\Models\Boutique;
use App\Models\Membre;
use App\Models\Paiement;
use App\Models\User;
use App\Models\Vente;

/**
 * Tableau de bord (CAHIER § 6.8, CONTRAT_API § 6) : agrégats SQL (une requête par bloc, aucun N+1),
 * fuseau de la boutique, caissier limité à ses chiffres du jour.
 */
class TableauDeBord
{
    public function calculer(Boutique $boutique, Membre $acteur, User $utilisateur, string $periode): array
    {
        $fuseau = $boutique->fuseau ?: config('satspoint.boutique.fuseau');

        if ($acteur->estCaissier()) {
            $periode = 'aujourdhui';
        }

        $bornes = RequeteVentes::bornes($periode, $fuseau);
        $duree = $bornes['du']->diffInSeconds($bornes['au']);
        $precedent = ['du' => $bornes['du']->subSeconds($duree), 'au' => $bornes['du']];

        // Colonnes qualifiées : certaines requêtes joignent paiements (statut, montant_xof existent des deux côtés).
        $base = fn () => Vente::query()
            ->when($acteur->estCaissier(), fn ($q) => $q->where('ventes.caissier_id', $utilisateur->id));

        $payees = fn (array $b) => $base()
            ->where('ventes.statut', Vente::STATUT_PAYEE)
            ->where('ventes.payee_at', '>=', $b['du'])->where('ventes.payee_at', '<', $b['au']);

        // Chiffre d'affaires, nombre, panier moyen (une requête).
        $global = $payees($bornes)->selectRaw('COUNT(*) AS nombre, COALESCE(SUM(ventes.montant_xof), 0) AS total')->first();
        $nombre = (int) $global->nombre;
        $total = (int) $global->total;

        $totalPrecedent = (int) $payees($precedent)->sum('ventes.montant_xof');

        // Répartition par moyen de la tentative réussie (une requête, jointure sur paiements).
        $repartitionBrute = $payees($bornes)
            ->join('paiements', 'paiements.id', '=', 'ventes.paiement_reussi_id')
            ->groupBy('paiements.methode')
            ->selectRaw('paiements.methode AS methode, COUNT(*) AS nombre, COALESCE(SUM(ventes.montant_xof), 0) AS montant')
            ->get()
            ->keyBy('methode');

        $lightning = $repartitionBrute->get(Paiement::METHODE_LIGHTNING);
        $mobile = ['nombre' => 0, 'montant_xof' => 0];
        foreach ([Paiement::METHODE_PAYTECH, Paiement::METHODE_WAVE_MANUEL] as $m) {
            if ($ligne = $repartitionBrute->get($m)) {
                $mobile['nombre'] += (int) $ligne->nombre;
                $mobile['montant_xof'] += (int) $ligne->montant;
            }
        }

        // Série par jour local (une requête ; les jours sans vente sont complétés à zéro).
        $serieBrute = $payees($bornes)
            ->selectRaw("to_char(timezone(?, ventes.payee_at), 'YYYY-MM-DD') AS jour, COALESCE(SUM(ventes.montant_xof), 0) AS montant, COUNT(*) AS nombre", [$fuseau])
            ->groupBy('jour')
            ->orderBy('jour')
            ->get()
            ->keyBy('jour');

        $serie = [];
        for ($jour = $bornes['du']->setTimezone($fuseau); $jour < $bornes['au']->setTimezone($fuseau); $jour = $jour->addDay()) {
            $cle = $jour->format('Y-m-d');
            $ligne = $serieBrute->get($cle);
            $serie[] = ['jour' => $cle, 'montant_xof' => (int) ($ligne->montant ?? 0), 'nombre' => (int) ($ligne->nombre ?? 0)];
        }

        $dernieres = $base()
            ->with(['caissier:id,ulid,nom', 'paiementReussi:id,methode,operateur,montant_sats'])
            ->where('ventes.created_at', '>=', $bornes['du'])->where('ventes.created_at', '<', $bornes['au'])
            ->orderByDesc('ventes.created_at')->orderByDesc('ventes.id')
            ->limit(10)
            ->get();

        return [
            'periode' => $periode,
            'du' => $bornes['du']->setTimezone($fuseau)->format('Y-m-d'),
            'au' => $bornes['au']->setTimezone($fuseau)->subDay()->format('Y-m-d'),
            'chiffre_affaires_xof' => $total,
            'nombre_ventes' => $nombre,
            'panier_moyen_xof' => $nombre > 0 ? (int) round($total / $nombre) : 0,
            'repartition' => [
                'lightning' => ['nombre' => (int) ($lightning->nombre ?? 0), 'montant_xof' => (int) ($lightning->montant ?? 0)],
                'mobile_money' => $mobile,
            ],
            'comparaison_pct' => $totalPrecedent > 0 ? round(($total - $totalPrecedent) / $totalPrecedent * 100, 1) : null,
            'serie' => $serie,
            'dernieres_ventes' => $dernieres,
        ];
    }
}

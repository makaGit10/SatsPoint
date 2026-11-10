<?php

namespace App\Http\Resources;

use App\Models\Vente;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 1 `VenteCourte`. Relations attendues chargées : caissier, paiementReussi.
 *
 * @mixin Vente
 */
class VenteCourteResource extends JsonResource
{
    public static $wrap = 'vente';

    public function toArray(Request $request): array
    {
        $reussi = $this->paiementReussi;

        return [
            'ulid' => $this->ulid,
            'numero' => $this->numeroAffiche(),
            'montant_xof' => (int) $this->montant_xof,
            'statut' => $this->statut,
            'methode_reussie' => $reussi?->methode,
            'operateur_reussi' => $reussi?->operateur,
            // CONTRAT_API § 14.4 : nom du moyen du pays de la tentative réussie.
            'moyen_reussi' => $reussi?->nomMoyen(),
            'montant_sats_reussi' => $reussi?->montant_sats === null ? null : (int) $reussi->montant_sats,
            'caissier' => $this->caissier === null ? null : ['ulid' => $this->caissier->ulid, 'nom' => $this->caissier->nom],
            'note' => $this->note,
            'alerte' => $this->alerte,
            'cree_le' => $this->created_at?->toIso8601String(),
            'payee_le' => $this->payee_at?->toIso8601String(),
        ];
    }
}

<?php

namespace App\Http\Resources;

use App\Models\LigneVente;
use App\Models\Vente;
use Illuminate\Http\Request;

/**
 * Forme CONTRAT_API § 1 `Vente` (détail). Relations attendues : caissier, paiementReussi, lignes.article, paiements.
 *
 * @mixin Vente
 */
class VenteResource extends VenteCourteResource
{
    public function toArray(Request $request): array
    {
        return parent::toArray($request) + [
            'lignes' => $this->lignes->map(fn (LigneVente $l) => [
                'libelle' => $l->libelle,
                'quantite' => (int) $l->quantite,
                'prix_unitaire_xof' => (int) $l->prix_unitaire_xof,
                'article_ulid' => $l->article?->ulid,
            ])->values()->all(),
            'paiements' => PaiementResource::collection($this->paiements->sortBy('id')->values())->resolve($request),
            'paiement_reussi' => $this->paiementReussi === null ? null : (new PaiementResource($this->paiementReussi))->resolve($request),
            'recu_url' => $this->recuUrl(),
        ];
    }
}

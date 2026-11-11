<?php

namespace App\Http\Resources;

use App\Models\LigneVente;
use App\Models\Vente;
use Illuminate\Http\Request;

/**
 * Forme CONTRAT_API § 1 `Vente` (détail). Relations attendues : caissier, paiementReussi, lignes.article, paiements.
 * Charger `lignes.article` avec Vente::COLONNES_ARTICLE_LIGNE (visuel des lignes, sans requête paresseuse).
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
                // Visuel de l'article (état actuel ; null s'il a été supprimé) : vignette à côté du libellé.
                'pictogramme' => $l->article?->pictogramme,
                'couleur' => $l->article?->couleur,
                'photo_url' => $l->article?->photoUrl(),
            ])->values()->all(),
            'paiements' => PaiementResource::collection($this->paiements->sortBy('id')->values())->resolve($request),
            'paiement_reussi' => $this->paiementReussi === null ? null : (new PaiementResource($this->paiementReussi))->resolve($request),
            'recu_url' => $this->recuUrl(),
        ];
    }
}

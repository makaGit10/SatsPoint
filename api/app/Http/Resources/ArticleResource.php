<?php

namespace App\Http\Resources;

use App\Models\Article;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 9 `Article` (+ § 15 : pictogramme, photo_url, voix_url ; `nom` peut être null).
 *
 * @mixin Article
 */
class ArticleResource extends JsonResource
{
    public static $wrap = 'article';

    public function toArray(Request $request): array
    {
        return [
            'ulid' => $this->ulid,
            'nom' => $this->nom,
            'prix_xof' => (int) $this->prix_xof,
            'categorie' => $this->categorie,
            'couleur' => $this->couleur,
            'pictogramme' => $this->pictogramme,
            // URL versionnées (empreinte) servies par l'API, réservées aux membres de la boutique.
            'photo_url' => $this->photoUrl(),
            'voix_url' => $this->voixUrl(),
            'sku' => $this->sku,
            'actif' => (bool) $this->actif,
            'position' => (int) $this->position,
        ];
    }
}

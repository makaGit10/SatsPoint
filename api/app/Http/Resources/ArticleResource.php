<?php

namespace App\Http\Resources;

use App\Models\Article;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 9 `Article`.
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
            'sku' => $this->sku,
            'actif' => (bool) $this->actif,
            'position' => (int) $this->position,
        ];
    }
}

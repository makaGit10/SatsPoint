<?php

namespace App\Http\Resources;

use App\Models\Boutique;
use App\Models\Membre;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Boutique
 */
class BoutiqueResource extends JsonResource
{
    public static $wrap = 'boutique';

    public function __construct(Boutique $boutique, private readonly ?Membre $membre = null)
    {
        parent::__construct($boutique);
    }

    public function toArray(Request $request): array
    {
        return [
            'ulid' => $this->ulid,
            'nom' => $this->nom,
            'telephone' => $this->telephone,
            'ville' => $this->ville,
            'fuseau' => $this->fuseau,
            'devise' => $this->devise,
            'statut' => $this->statut,
            'reglages' => $this->reglagesExposes(),
            'configuration' => $this->configuration(),
            'paytech' => $this->etatPaytech(),
            'mon_role' => $this->membre?->role,
            'cree_le' => $this->created_at?->toIso8601String(),
        ];
    }
}

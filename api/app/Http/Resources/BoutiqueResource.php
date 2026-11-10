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
            'pays' => $this->pays ?? 'SN',
            'statut' => $this->statut,
            'reglages' => $this->reglagesExposes(),
            'configuration' => $this->configuration(),
            'paytech' => $this->etatPaytech(),
            // CONTRAT_API § 14.3 : moyens du pays activés (la caisse les propose ; valeur = numéro / lien montré au client).
            'moyens_pays' => $this->moyensPaysActives(),
            'mon_role' => $this->membre?->role,
            'cree_le' => $this->created_at?->toIso8601String(),
        ];
    }
}

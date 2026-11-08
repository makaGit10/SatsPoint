<?php

namespace App\Http\Resources;

use App\Models\Membre;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin User
 */
class UtilisateurResource extends JsonResource
{
    public static $wrap = 'utilisateur';

    public function __construct(User $utilisateur, private readonly ?Membre $membre = null)
    {
        parent::__construct($utilisateur);
    }

    public function toArray(Request $request): array
    {
        $boutique = $this->membre?->boutique;

        return [
            'ulid' => $this->ulid,
            'nom' => $this->nom,
            'email' => $this->email,
            'telephone' => $this->telephone,
            'role_plateforme' => $this->role_plateforme,
            'preferences' => $this->preferencesCompletes(),
            'boutique' => $boutique === null ? null : [
                'ulid' => $boutique->ulid,
                'nom' => $boutique->nom,
                'ville' => $boutique->ville,
                'devise' => $boutique->devise,
                'role' => $this->membre->role,
                'configuration' => $boutique->configuration(),
            ],
        ];
    }
}

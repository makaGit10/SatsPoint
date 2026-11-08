<?php

namespace App\Http\Resources;

use App\Models\Membre;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 10 : { ulid, nom, contact, role, actif, derniere_connexion_le, est_moi }.
 *
 * @mixin Membre
 */
class MembreResource extends JsonResource
{
    public static $wrap = 'membre';

    public function toArray(Request $request): array
    {
        return [
            'ulid' => $this->ulid,
            'nom' => $this->user->nom,
            'contact' => $this->user->email ?? $this->user->telephone,
            'role' => $this->role,
            'actif' => $this->actif,
            'derniere_connexion_le' => $this->user->derniere_connexion_at?->toIso8601String(),
            'est_moi' => $request->user() !== null && $request->user()->id === $this->user_id,
        ];
    }
}

<?php

namespace App\Http\Resources;

use App\Models\Invitation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 10 : { ulid, contact, role, expire_le } (+ lien, uniquement à la création d'une
 * invitation par téléphone, pour que le responsable le transmette lui-même).
 *
 * @mixin Invitation
 */
class InvitationResource extends JsonResource
{
    public static $wrap = 'invitation';

    private ?string $lien = null;

    /** Joint le lien d'invitation complet à la réponse (création par téléphone uniquement). */
    public function avecLien(?string $lien): static
    {
        $this->lien = ($lien === null || $lien === '') ? null : $lien;

        return $this;
    }

    public function toArray(Request $request): array
    {
        return [
            'ulid' => $this->ulid,
            'contact' => $this->contact,
            'role' => $this->role,
            'expire_le' => $this->expire_at?->toIso8601String(),
            'lien' => $this->when($this->lien !== null, $this->lien),
        ];
    }
}

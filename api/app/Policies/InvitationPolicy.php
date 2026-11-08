<?php

namespace App\Policies;

use App\Models\Invitation;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;

class InvitationPolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** Inviter : propriétaire ou gérant ; un gérant n'invite pas de propriétaire. */
    public function create(User $user, string $role = Membre::ROLE_CAISSIER): bool
    {
        $acteur = $this->acteur($user);

        if ($acteur === null || ! $acteur->peutAdministrer() || ! in_array($role, Membre::ROLES, true)) {
            return false;
        }

        return $role !== Membre::ROLE_PROPRIETAIRE || $acteur->estProprietaire();
    }

    public function delete(User $user, Invitation $invitation): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer() && $acteur->boutique_id === $invitation->boutique_id
            && ($invitation->role !== Membre::ROLE_PROPRIETAIRE || $acteur->estProprietaire());
    }

    /**
     * Accepter : l'invitation doit être valide et adressée à l'un des identifiants du compte connecté
     * (empêche l'usage d'un lien transféré à une autre personne).
     */
    public function accepter(User $user, Invitation $invitation): bool
    {
        if ($user->estSuperAdmin() || ! $invitation->estValide()) {
            return false;
        }

        $contact = mb_strtolower($invitation->contact);

        return ($user->email !== null && hash_equals(mb_strtolower($user->email), $contact))
            || ($user->telephone !== null && hash_equals($user->telephone, $invitation->contact));
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

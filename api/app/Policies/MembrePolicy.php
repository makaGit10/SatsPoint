<?php

namespace App\Policies;

use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;

/**
 * Gestion de l'équipe (CAHIER § 3.3 et § 6.11) :
 * - propriétaire : gère tout le monde ;
 * - gérant : gère gérants et caissiers, jamais les propriétaires, et ne promeut pas au rang de propriétaire ;
 * - caissier : rien.
 * Les invariants « dernier propriétaire » sont vérifiés dans le contrôleur (état de la boutique).
 */
class MembrePolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function viewAny(User $user): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer();
    }

    public function update(User $user, Membre $cible): bool
    {
        return $this->peutAgirSur($user, $cible);
    }

    public function delete(User $user, Membre $cible): bool
    {
        return $this->peutAgirSur($user, $cible);
    }

    /** Peut-on attribuer ce rôle ? Seul un propriétaire nomme un propriétaire. */
    public function attribuerRole(User $user, string $role): bool
    {
        $acteur = $this->acteur($user);

        if ($acteur === null || ! $acteur->peutAdministrer() || ! in_array($role, Membre::ROLES, true)) {
            return false;
        }

        return $role !== Membre::ROLE_PROPRIETAIRE || $acteur->estProprietaire();
    }

    private function peutAgirSur(User $user, Membre $cible): bool
    {
        $acteur = $this->acteur($user);

        if ($acteur === null || ! $acteur->peutAdministrer() || $acteur->boutique_id !== $cible->boutique_id) {
            return false;
        }

        if ($acteur->estProprietaire()) {
            return true;
        }

        // Gérant : jamais sur un propriétaire.
        return ! $cible->estProprietaire();
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

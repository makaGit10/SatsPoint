<?php

namespace App\Policies;

use App\Models\Membre;
use App\Models\User;
use App\Models\Vente;
use App\Services\BoutiqueCourante;

/**
 * Ventes (CAHIER § 3.3) : tout membre encaisse ; un caissier ne voit et n'annule que SES ventes ;
 * confirmation manuelle et export réservés au propriétaire / gérant. Refus par défaut.
 */
class VentePolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function viewAny(User $user): bool
    {
        return $this->acteur($user) !== null;
    }

    public function view(User $user, Vente $vente): bool
    {
        $acteur = $this->acteur($user);

        if ($acteur === null || $acteur->boutique_id !== $vente->boutique_id) {
            return false;
        }

        return $acteur->peutAdministrer() || $vente->caissier_id === $user->id;
    }

    public function create(User $user): bool
    {
        return $this->acteur($user) !== null;
    }

    /** Nouvelle tentative : mêmes droits que la lecture de la vente. */
    public function payer(User $user, Vente $vente): bool
    {
        return $this->view($user, $vente);
    }

    public function annuler(User $user, Vente $vente): bool
    {
        return $this->view($user, $vente);
    }

    public function confirmerManuellement(User $user, Vente $vente): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->boutique_id === $vente->boutique_id && $acteur->peutAdministrer();
    }

    public function exporter(User $user): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer();
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

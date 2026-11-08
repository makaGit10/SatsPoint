<?php

namespace App\Policies;

use App\Models\Membre;
use App\Models\Paiement;
use App\Models\User;
use App\Services\BoutiqueCourante;

/**
 * Tentatives de paiement : visibles par les membres (caissier : celles de SES ventes) ;
 * confirmation manuelle réservée au propriétaire / gérant.
 */
class PaiementPolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function view(User $user, Paiement $paiement): bool
    {
        $acteur = $this->acteur($user);

        if ($acteur === null || $acteur->boutique_id !== $paiement->boutique_id) {
            return false;
        }

        if ($acteur->peutAdministrer()) {
            return true;
        }

        $vente = $paiement->relationLoaded('vente') ? $paiement->vente : $paiement->vente()->first();

        return $vente !== null && $vente->caissier_id === $user->id;
    }

    public function verifier(User $user, Paiement $paiement): bool
    {
        return $this->view($user, $paiement);
    }

    public function simuler(User $user, Paiement $paiement): bool
    {
        return $this->view($user, $paiement);
    }

    public function confirmerManuellement(User $user, Paiement $paiement): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->boutique_id === $paiement->boutique_id && $acteur->peutAdministrer();
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

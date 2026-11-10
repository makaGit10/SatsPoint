<?php

namespace App\Policies;

use App\Models\Boutique;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;

/**
 * Refus par défaut. Le super-admin n'a AUCUN accès aux données des AUTRES boutiques (moindre privilège) :
 * il peut seulement créer et gérer SA propre boutique, comme n'importe quel commerçant (l'accès passe par
 * l'adhésion, jamais par le rôle plateforme).
 */
class BoutiquePolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** Créer une boutique : utilisateur sans adhésion active (il en devient propriétaire). */
    public function create(User $user): bool
    {
        return $this->membreActif($user) === null;
    }

    /** Lire la boutique : tout membre actif. */
    public function view(User $user, Boutique $boutique): bool
    {
        $membre = $this->membreActif($user);

        return $membre !== null && $membre->boutique_id === $boutique->id;
    }

    /** Modifier les réglages : propriétaire ou gérant. */
    public function update(User $user, Boutique $boutique): bool
    {
        $membre = $this->membreActif($user);

        return $membre !== null && $membre->boutique_id === $boutique->id && $membre->peutAdministrer();
    }

    /** Voir le solde et l'historique du portefeuille : propriétaire ou gérant. */
    public function voirWallet(User $user, Boutique $boutique): bool
    {
        return $this->update($user, $boutique);
    }

    /** Envoyer des sats : propriétaire uniquement (avec mot de passe revérifié). */
    public function envoyerSats(User $user, Boutique $boutique): bool
    {
        return $this->gererPaiements($user, $boutique);
    }

    /** Tableau de bord : tout membre actif (le caissier n'y voit que ses chiffres du jour). */
    public function voirTableauDeBord(User $user, Boutique $boutique): bool
    {
        return $this->view($user, $boutique);
    }

    /** Portefeuille, PayTech, suppression : propriétaire uniquement. */
    public function gererPaiements(User $user, Boutique $boutique): bool
    {
        $membre = $this->membreActif($user);

        return $membre !== null && $membre->boutique_id === $boutique->id && $membre->estProprietaire();
    }

    public function delete(User $user, Boutique $boutique): bool
    {
        return $this->gererPaiements($user, $boutique);
    }

    /** Voir / gérer l'équipe : propriétaire ou gérant. */
    public function gererEquipe(User $user, Boutique $boutique): bool
    {
        return $this->update($user, $boutique);
    }

    private function membreActif(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        if ($membre !== null && $membre->user_id === $user->id && $membre->actif) {
            return $membre;
        }

        return null;
    }
}

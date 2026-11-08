<?php

namespace App\Policies;

use App\Models\Import;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;

/** Imports d'articles : propriétaire / gérant uniquement (comme la gestion des articles). */
class ImportPolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function create(User $user): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer();
    }

    public function view(User $user, Import $import): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer() && $acteur->boutique_id === $import->boutique_id;
    }

    public function executer(User $user, Import $import): bool
    {
        return $this->view($user, $import);
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

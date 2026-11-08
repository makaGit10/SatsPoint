<?php

namespace App\Policies;

use App\Models\Article;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;

/** Articles (CAHIER § 3.3) : lecture pour tout membre, gestion pour propriétaire / gérant. */
class ArticlePolicy
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    public function viewAny(User $user): bool
    {
        return $this->acteur($user) !== null;
    }

    public function view(User $user, Article $article): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->boutique_id === $article->boutique_id;
    }

    public function create(User $user): bool
    {
        $acteur = $this->acteur($user);

        return $acteur !== null && $acteur->peutAdministrer();
    }

    public function update(User $user, Article $article): bool
    {
        return $this->view($user, $article) && $this->create($user);
    }

    public function delete(User $user, Article $article): bool
    {
        return $this->update($user, $article);
    }

    public function ordonner(User $user): bool
    {
        return $this->create($user);
    }

    private function acteur(User $user): ?Membre
    {
        $membre = $this->courante->membre();

        return ($membre !== null && $membre->user_id === $user->id && $membre->actif) ? $membre : null;
    }
}

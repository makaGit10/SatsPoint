<?php

namespace App\Services;

use App\Exceptions\BoutiqueCouranteAbsente;
use App\Models\Boutique;
use App\Models\Membre;
use App\Models\Scopes\BoutiqueScope;
use App\Models\User;
use Closure;
use Illuminate\Contracts\Auth\Factory as AuthFactory;

/**
 * Boutique « courante » d'une requête : alimente le scope global de cloisonnement.
 *
 * - En HTTP : résolue paresseusement depuis l'utilisateur connecté (son membre actif).
 * - En console, seeder ou job : fixée explicitement avec definir() / pour().
 */
class BoutiqueCourante
{
    private ?Boutique $boutique = null;

    private ?Membre $membre = null;

    private bool $resolue = false;

    private ?int $utilisateurResolu = null;

    public function __construct(private readonly AuthFactory $auth) {}

    /** Fixe explicitement la boutique courante (console, seeders, jobs, après création). */
    public function definir(Boutique $boutique, ?Membre $membre = null): void
    {
        $this->boutique = $boutique;
        $this->membre = $membre;
        $this->resolue = true;
        $this->utilisateurResolu = $membre?->user_id;
    }

    /** Oublie la boutique courante (fin de job, tests). */
    public function oublier(): void
    {
        $this->boutique = null;
        $this->membre = null;
        $this->resolue = false;
        $this->utilisateurResolu = null;
    }

    /** Exécute $callback avec la boutique donnée, puis restaure l'état précédent. */
    public function pour(Boutique $boutique, Closure $callback, ?Membre $membre = null): mixed
    {
        [$b, $m, $r, $u] = [$this->boutique, $this->membre, $this->resolue, $this->utilisateurResolu];

        $this->definir($boutique, $membre);

        try {
            return $callback($boutique);
        } finally {
            [$this->boutique, $this->membre, $this->resolue, $this->utilisateurResolu] = [$b, $m, $r, $u];
        }
    }

    public function obtenir(): ?Boutique
    {
        $this->resoudre();

        return $this->boutique;
    }

    public function membre(): ?Membre
    {
        $this->resoudre();

        return $this->membre;
    }

    public function id(): ?int
    {
        return $this->obtenir()?->id;
    }

    public function existe(): bool
    {
        return $this->obtenir() !== null;
    }

    /** Boutique courante obligatoire : lève une exception explicite sinon. */
    public function exiger(string $modele = ''): Boutique
    {
        return $this->obtenir() ?? throw new BoutiqueCouranteAbsente($modele);
    }

    /** Force une nouvelle résolution depuis l'utilisateur connecté (après adhésion, par exemple). */
    public function rafraichir(): void
    {
        $this->resolue = false;
        $this->boutique = null;
        $this->membre = null;
        $this->utilisateurResolu = null;
    }

    private function resoudre(): void
    {
        $utilisateur = $this->utilisateurConnecte();

        // Déjà résolue pour cet utilisateur (ou fixée explicitement) : on ne refait rien.
        if ($this->resolue && ($this->utilisateurResolu === null || $this->utilisateurResolu === $utilisateur?->id)) {
            return;
        }

        $this->resolue = true;
        $this->boutique = null;
        $this->membre = null;
        $this->utilisateurResolu = $utilisateur?->id;

        if ($utilisateur === null) {
            return;
        }

        $membre = Membre::query()
            ->withoutGlobalScope(BoutiqueScope::class)
            ->with(['boutique'])
            ->where('user_id', $utilisateur->id)
            ->where('actif', true)
            ->orderBy('id')
            ->first();

        if ($membre !== null && $membre->boutique !== null) {
            $this->membre = $membre;
            $this->boutique = $membre->boutique;
        }
    }

    private function utilisateurConnecte(): ?User
    {
        try {
            $utilisateur = $this->auth->guard()->user();
        } catch (\Throwable) {
            return null;
        }

        return $utilisateur instanceof User ? $utilisateur : null;
    }
}

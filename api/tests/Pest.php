<?php

use App\Models\Boutique;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Testing\RefreshDatabase;

/*
|--------------------------------------------------------------------------
| Pest — configuration des tests SatsPoint
|--------------------------------------------------------------------------
*/

pest()->extend(Tests\TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(Tests\TestCase::class)->in('Unit');

/*
|--------------------------------------------------------------------------
| Fonctions d'aide
|--------------------------------------------------------------------------
*/

const MDP_TEST = 'MotDePasseTest-2026!';

/**
 * Crée une boutique avec un membre du rôle demandé.
 *
 * @return array{boutique: Boutique, user: User, membre: Membre}
 */
function boutiqueAvec(string $role = Membre::ROLE_PROPRIETAIRE, ?Boutique $boutique = null, ?User $user = null): array
{
    $boutique ??= Boutique::factory()->create();
    $user ??= User::factory()->create();

    $membre = Membre::factory()->create([
        'boutique_id' => $boutique->id,
        'user_id' => $user->id,
        'role' => $role,
        'actif' => true,
    ]);

    return ['boutique' => $boutique, 'user' => $user, 'membre' => $membre->setRelation('boutique', $boutique)->setRelation('user', $user)];
}

/** Connecte un utilisateur (session web) et réinitialise la boutique courante. */
function connecte(User $user): Tests\TestCase
{
    app(BoutiqueCourante::class)->oublier();
    // Les gardes (dont le RequestGuard de Sanctum) mémorisent l'utilisateur : on repart de zéro.
    app('auth')->forgetGuards();
    test()->flushSession();

    return test()->actingAs($user, 'web');
}

/** Exécute $callback avec une boutique courante explicite (comme un job ou un seeder). */
function avecBoutique(Boutique $boutique, Closure $callback): mixed
{
    return app(BoutiqueCourante::class)->pour($boutique, $callback);
}

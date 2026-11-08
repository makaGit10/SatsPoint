<?php

namespace Database\Factories;

use App\Models\Boutique;
use App\Models\Membre;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Membre>
 */
class MembreFactory extends Factory
{
    public function definition(): array
    {
        return [
            'boutique_id' => Boutique::factory(),
            'user_id' => User::factory(),
            'role' => Membre::ROLE_CAISSIER,
            'actif' => true,
        ];
    }

    public function proprietaire(): static
    {
        return $this->state(fn () => ['role' => Membre::ROLE_PROPRIETAIRE]);
    }

    public function gerant(): static
    {
        return $this->state(fn () => ['role' => Membre::ROLE_GERANT]);
    }
}

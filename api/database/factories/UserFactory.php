<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'nom' => fake()->name(),
            'email' => fake()->unique()->safeEmail(),
            'telephone' => null,
            'password' => static::$password ??= Hash::make('MotDePasseTest-2026!'),
            'preferences' => config('satspoint.preferences_defaut'),
        ];
    }

    public function parTelephone(): static
    {
        return $this->state(fn () => [
            'email' => null,
            'telephone' => '+2217'.fake()->unique()->numerify('########'),
        ]);
    }

    public function superAdmin(): static
    {
        return $this->afterCreating(fn (User $user) => $user->forceFill(['role_plateforme' => User::ROLE_SUPER_ADMIN])->save());
    }
}

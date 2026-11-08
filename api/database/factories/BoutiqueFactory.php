<?php

namespace Database\Factories;

use App\Models\Boutique;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Boutique>
 */
class BoutiqueFactory extends Factory
{
    public function definition(): array
    {
        return [
            'nom' => 'Boutique '.fake()->lastName(),
            'telephone' => '+2217'.fake()->numerify('########'),
            'ville' => fake()->randomElement(['Dakar', 'Thiès', 'Saint-Louis', 'Ziguinchor', 'Kaolack']),
            'fuseau' => 'Africa/Dakar',
            'devise' => 'XOF',
            'reglages' => config('satspoint.boutique.reglages_defaut'),
        ];
    }
}

<?php

namespace Database\Factories;

use App\Models\Article;
use App\Models\Boutique;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Article>
 */
class ArticleFactory extends Factory
{
    public function definition(): array
    {
        return [
            'boutique_id' => Boutique::factory(),
            'nom' => fake()->randomElement(['Café Touba', 'Bissap', 'Thiéboudienne', 'Pain', 'Eau 1,5 L', 'Beignets']),
            'prix_xof' => fake()->numberBetween(100, 5000),
            'categorie' => fake()->randomElement(['Boissons', 'Plats', 'Divers']),
            'couleur' => fake()->randomElement(['#F59E0B', '#10B981', '#3B82F6', '#EF4444']),
            'sku' => null,
            'actif' => true,
            'position' => fake()->numberBetween(0, 50),
        ];
    }
}

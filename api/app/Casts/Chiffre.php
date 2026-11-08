<?php

namespace App\Casts;

use App\Services\ChiffrementDonnees;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * Cast Eloquent : la colonne est chiffrée en base (AES-256-GCM, clé dédiée) et
 * déchiffrée en mémoire à la lecture. Le nom de la colonne sert de contexte (AAD).
 *
 * Usage : protected function casts(): array { return ['uri_chiffree' => Chiffre::class]; }
 */
class Chiffre implements CastsAttributes
{
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return app(ChiffrementDonnees::class)->dechiffrer($value, $this->contexte($model, $key));
    }

    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        return app(ChiffrementDonnees::class)->chiffrer((string) $value, $this->contexte($model, $key));
    }

    private function contexte(Model $model, string $key): string
    {
        return $model->getTable().'.'.$key;
    }
}

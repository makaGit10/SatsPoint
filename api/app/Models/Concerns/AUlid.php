<?php

namespace App\Models\Concerns;

use Illuminate\Support\Str;

/**
 * Identifiant public opaque (ULID) généré à la création, utilisé dans les URL
 * à la place de l'identifiant interne (règle n° 3 : anti-IDOR).
 */
trait AUlid
{
    public const ULID_REGEX = '[0-7][0-9A-HJKMNP-TV-Z]{25}';

    public static function bootAUlid(): void
    {
        static::creating(function ($model) {
            if (empty($model->ulid)) {
                $model->ulid = (string) Str::ulid();
            }
        });
    }

    public function getRouteKeyName(): string
    {
        return 'ulid';
    }
}

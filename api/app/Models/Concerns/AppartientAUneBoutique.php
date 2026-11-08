<?php

namespace App\Models\Concerns;

use App\Models\Boutique;
use App\Models\Scopes\BoutiqueScope;
use App\Services\BoutiqueCourante;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Modèle métier cloisonné par boutique : scope global + boutique_id rempli
 * automatiquement à la création depuis la boutique courante.
 */
trait AppartientAUneBoutique
{
    public static function bootAppartientAUneBoutique(): void
    {
        static::addGlobalScope(new BoutiqueScope);

        static::creating(function ($model) {
            if (empty($model->boutique_id)) {
                $model->boutique_id = app(BoutiqueCourante::class)->exiger(static::class)->id;
            }
        });
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }
}

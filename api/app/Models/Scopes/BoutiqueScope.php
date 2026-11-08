<?php

namespace App\Models\Scopes;

use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Scope global de cloisonnement : toute requête sur un modèle métier est filtrée
 * par la boutique courante. Sans boutique courante, la requête est REFUSÉE
 * (exception BoutiqueCouranteAbsente), sauf contournement explicite :
 *   Modele::pourBoutique($boutique)   → filtre sur une boutique donnée
 *   Modele::toutesBoutiques()         → aucune restriction (console, admin, passerelle)
 */
class BoutiqueScope implements Scope
{
    public function apply(Builder $builder, Model $model): void
    {
        $boutique = app(BoutiqueCourante::class)->exiger($model::class);

        $builder->where($model->qualifyColumn('boutique_id'), $boutique->id);
    }

    public function extend(Builder $builder): void
    {
        $builder->macro('pourBoutique', function (Builder $builder, Boutique|int $boutique) {
            $id = $boutique instanceof Boutique ? $boutique->id : $boutique;

            return $builder
                ->withoutGlobalScope($this)
                ->where($builder->getModel()->qualifyColumn('boutique_id'), $id);
        });

        $builder->macro('toutesBoutiques', function (Builder $builder) {
            return $builder->withoutGlobalScope($this);
        });
    }
}

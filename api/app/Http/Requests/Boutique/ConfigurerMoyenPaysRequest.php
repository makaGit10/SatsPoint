<?php

namespace App\Http\Requests\Boutique;

use App\Models\Boutique;
use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /boutique/moyens-pays/{moyen} { active, valeur? } (CONTRAT_API § 14.3).
 *
 * Le droit (propriétaire / gérant) est vérifié AVANT toute validation (règle 12, comme /wallet/*) ; le corps n'est
 * validé qu'après s'être assuré que le moyen appartient au pays de la boutique (sinon 404, sans rien révéler).
 */
class ConfigurerMoyenPaysRequest extends FormRequest
{
    public function authorize(): bool
    {
        $boutique = app(BoutiqueCourante::class)->obtenir();

        return $this->user() !== null && $boutique instanceof Boutique && $this->user()->can('gererMoyensPays', $boutique);
    }

    /**
     * Aucune règle ici : le corps est validé par le contrôleur APRÈS la vérification du moyen (404 identique pour un
     * moyen inconnu ou d'un autre pays, quel que soit le corps envoyé). Voir REGLES.
     */
    public function rules(): array
    {
        return [];
    }

    /** Règles du corps, appliquées par le contrôleur une fois le moyen résolu. */
    public const REGLES = [
        'active' => ['required', 'boolean'],
        'valeur' => ['sometimes', 'nullable', 'string', 'max:300'],
    ];
}

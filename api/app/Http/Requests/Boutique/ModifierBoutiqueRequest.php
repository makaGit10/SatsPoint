<?php

namespace App\Http\Requests\Boutique;

use App\Services\Catalogue;
use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Réglages de la boutique (CAHIER § 6.2, CONTRAT_API § 8) : champs partiels, bornes strictes, listes fermées.
 * L'autorisation (propriétaire / gérant) est vérifiée par la Policy dans le contrôleur.
 */
class ModifierBoutiqueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'nom' => ['sometimes', 'string', 'min:2', 'max:120'],
            'ville' => ['sometimes', 'string', 'min:2', 'max:80'],
            // Pays (propriétaire seulement : vérifié par la Policy « changerPays » dans le contrôleur).
            'pays' => ['sometimes', 'string', 'size:2', Rule::in(Catalogue::codesPaysActifs())],
            'telephone' => ['sometimes', 'nullable', 'string', 'max:30', function (string $attribute, mixed $value, \Closure $fail) {
                if ($value !== null && $value !== '' && Identifiant::normaliserTelephone((string) $value) === null) {
                    $fail('Le numéro de téléphone de la boutique est invalide.');
                }
            }],
            // Marque le démarrage guidé comme terminé (test de paiement effectué).
            'paiement_test' => ['sometimes', 'boolean'],
            'reglages' => ['sometimes', 'array:expiration_facture_min,montant_max_xof,moyens,message_recu,wave_lien'],
            'reglages.expiration_facture_min' => ['sometimes', 'integer', 'min:2', 'max:15'],
            'reglages.montant_max_xof' => ['sometimes', 'integer', 'min:100', 'max:50000000'],
            'reglages.moyens' => ['sometimes', 'array:'.implode(',', config('satspoint.boutique.moyens'))],
            'reglages.moyens.*' => ['boolean'],
            'reglages.message_recu' => ['sometimes', 'nullable', 'string', 'max:200'],
            'reglages.wave_lien' => ['sometimes', 'nullable', 'string', 'max:300', 'url:https', 'starts_with:https://pay.wave.com/'],
        ];
    }

    public function messages(): array
    {
        return [
            'reglages.wave_lien.starts_with' => 'Le lien Wave doit commencer par https://pay.wave.com/.',
        ];
    }

    public function telephoneNormalise(): ?string
    {
        $brut = $this->input('telephone');

        return ($brut === null || $brut === '') ? null : Identifiant::normaliserTelephone((string) $brut);
    }
}

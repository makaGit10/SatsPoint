<?php

namespace App\Http\Requests\Boutique;

use App\Models\Boutique;
use App\Services\Catalogue;
use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class CreerBoutiqueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null && $this->user()->can('create', Boutique::class);
    }

    public function rules(): array
    {
        return [
            'nom' => ['required', 'string', 'min:2', 'max:120'],
            'ville' => ['required', 'string', 'min:2', 'max:80'],
            // CONTRAT_API § 14.3 : pays de la boutique (défaut SN), parmi les pays actifs.
            'pays' => ['sometimes', 'nullable', 'string', 'size:2', Rule::in(Catalogue::codesPaysActifs())],
            'telephone' => ['sometimes', 'nullable', 'string', 'max:30', function (string $attribute, mixed $value, \Closure $fail) {
                if ($value !== null && $value !== '' && Identifiant::normaliserTelephone((string) $value) === null) {
                    $fail('Le numéro de téléphone de la boutique est invalide.');
                }
            }],
        ];
    }

    public function telephoneNormalise(): ?string
    {
        $brut = $this->input('telephone');

        return ($brut === null || $brut === '') ? null : Identifiant::normaliserTelephone((string) $brut);
    }
}

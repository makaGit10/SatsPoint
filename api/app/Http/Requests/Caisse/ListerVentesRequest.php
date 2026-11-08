<?php

namespace App\Http\Requests\Caisse;

use App\Models\Boutique;
use App\Models\Paiement;
use App\Models\Vente;
use App\Services\RequeteVentes;
use Illuminate\Foundation\Http\FormRequest;

/** Filtres de GET /ventes et GET /exports/ventes (CONTRAT_API § 4). Toute valeur hors liste est refusée. */
class ListerVentesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'periode' => ['sometimes', 'string', 'in:'.implode(',', RequeteVentes::PERIODES)],
            'du' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'required_if:periode,perso'],
            'au' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:du'],
            'statut' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Vente::STATUTS)],
            'methode' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Paiement::METHODES)],
            'caissier' => ['sometimes', 'nullable', 'string', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
            'q' => ['sometimes', 'nullable', 'string', 'max:40'],
            'curseur' => ['sometimes', 'nullable', 'string', 'max:500'],
            'limite' => ['sometimes', 'integer', 'min:1', 'max:100'],
            'format' => ['sometimes', 'string', 'in:csv,xlsx,pdf'],
        ];
    }

    /** @return array<string, mixed> */
    public function filtres(): array
    {
        return $this->safe()->only(['periode', 'du', 'au', 'statut', 'methode', 'caissier', 'q']);
    }
}

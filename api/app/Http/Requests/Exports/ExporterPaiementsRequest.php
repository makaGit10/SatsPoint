<?php

namespace App\Http\Requests\Exports;

use App\Models\Paiement;
use App\Services\RequeteVentes;
use Illuminate\Foundation\Http\FormRequest;

/** GET /exports/paiements?format=csv&periode=&du=&au=&statut=&methode= */
class ExporterPaiementsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'format' => ['sometimes', 'string', 'in:csv'],
            'periode' => ['sometimes', 'string', 'in:'.implode(',', RequeteVentes::PERIODES)],
            'du' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'required_if:periode,perso'],
            'au' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:du'],
            'statut' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Paiement::STATUTS)],
            'methode' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Paiement::METHODES)],
        ];
    }
}

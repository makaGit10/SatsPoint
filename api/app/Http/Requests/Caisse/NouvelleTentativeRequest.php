<?php

namespace App\Http\Requests\Caisse;

use App\Models\Paiement;
use Illuminate\Foundation\Http\FormRequest;

class NouvelleTentativeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'methode' => ['required', 'string', 'in:'.implode(',', Paiement::METHODES)],
            'operateur' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Paiement::OPERATEURS)],
        ];
    }
}

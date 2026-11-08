<?php

namespace App\Http\Requests\Caisse;

use Illuminate\Foundation\Http\FormRequest;

/** POST /paiements/{ulid}/confirmer-manuellement { confirmation: true } — geste explicite exigé. */
class ConfirmerManuellementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'confirmation' => ['required', 'accepted'],
        ];
    }

    public function messages(): array
    {
        return ['confirmation.accepted' => 'Confirmez explicitement avoir reçu le paiement.'];
    }
}

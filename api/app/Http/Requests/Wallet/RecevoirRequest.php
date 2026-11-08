<?php

namespace App\Http\Requests\Wallet;

use Illuminate\Foundation\Http\FormRequest;

/** POST /wallet/recevoir { montant_xof? | montant_sats?, description? } — l'un des deux montants. */
class RecevoirRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'montant_xof' => ['required_without:montant_sats', 'nullable', 'integer', 'min:1', 'max:50000000'],
            'montant_sats' => ['required_without:montant_xof', 'nullable', 'integer', 'min:1', 'max:100000000'],
            'description' => ['sometimes', 'nullable', 'string', 'max:120'],
        ];
    }
}

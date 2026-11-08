<?php

namespace App\Http\Requests\Wallet;

use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Http\FormRequest;

/** POST /wallet/recevoir { montant_xof? | montant_sats?, description? } — l'un des deux montants. */
class RecevoirRequest extends FormRequest
{
    /** Droit vérifié AVANT la validation (règle n° 1) : un rôle non autorisé reçoit 403, jamais le détail des champs. */
    public function authorize(): bool
    {
        $boutique = app(BoutiqueCourante::class)->obtenir();

        return $this->user() !== null && $boutique !== null && $this->user()->can('voirWallet', $boutique);
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

<?php

namespace App\Http\Requests\Boutique;

use Illuminate\Foundation\Http\FormRequest;

/** PUT /boutique/wallet { uri, budget_sats? } — URI NWC (ou mock://demo hors production). */
class ConnecterWalletRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $motif = app()->isProduction()
            ? '/^nostr(\+walletconnect|walletconnect):\/\/[0-9a-f]{64}\?.+$/i'
            : '/^(nostr(\+walletconnect|walletconnect):\/\/[0-9a-f]{64}\?.+|mock:\/\/[a-z0-9_-]{1,40})$/i';

        return [
            'uri' => ['required', 'string', 'max:2048', 'regex:'.$motif],
            'budget_sats' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:2100000000000000'],
        ];
    }

    public function messages(): array
    {
        return ['uri.regex' => 'L\'URI de connexion au portefeuille est invalide (attendu : nostr+walletconnect://…).'];
    }
}

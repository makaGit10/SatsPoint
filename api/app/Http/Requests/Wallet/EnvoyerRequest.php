<?php

namespace App\Http\Requests\Wallet;

use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /wallet/envoyer/apercu { destination, montant_sats? } et POST /wallet/envoyer { destination, montant_sats?, password }.
 * Destination : BOLT11, adresse Lightning (nom@domaine) ou LNURL ; caractères imprimables uniquement.
 */
class EnvoyerRequest extends FormRequest
{
    /** Droit vérifié AVANT la validation (règle n° 1) : un rôle non autorisé reçoit 403, jamais le détail des champs. */
    public function authorize(): bool
    {
        $boutique = app(BoutiqueCourante::class)->obtenir();

        return $this->user() !== null && $boutique !== null && $this->user()->can('envoyerSats', $boutique);
    }

    public function rules(): array
    {
        $regles = [
            'destination' => ['required', 'string', 'min:6', 'max:2048', 'regex:/^[\x21-\x7E]+$/'],
            'montant_sats' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100000000'],
        ];

        if ($this->estEnvoiDefinitif()) {
            $regles['password'] = ['required', 'string', 'max:1024'];
        }

        return $regles;
    }

    public function estEnvoiDefinitif(): bool
    {
        return ! str_ends_with((string) $this->route()?->uri(), 'apercu');
    }

    public function messages(): array
    {
        return ['destination.regex' => 'La destination contient des caractères invalides.'];
    }
}

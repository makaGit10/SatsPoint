<?php

namespace App\Http\Requests\Auth;

use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class ReinitialisationMotDePasseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'jeton' => ['required', 'string', 'max:200'],
            'identifiant' => ['required', 'string', 'max:190'],
            'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
        ];
    }

    /** @return array{type: string, valeur: string}|null */
    public function identifiantNormalise(): ?array
    {
        return Identifiant::normaliser($this->input('identifiant'));
    }
}

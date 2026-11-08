<?php

namespace App\Http\Requests\Auth;

use App\Rules\IdentifiantValide;
use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class InscriptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() === null;
    }

    public function rules(): array
    {
        return [
            'nom' => ['required', 'string', 'min:2', 'max:80'],
            'identifiant' => ['required', 'string', 'max:190', new IdentifiantValide],
            'password' => ['required', 'string', 'max:200', 'confirmed', Password::defaults()],
            'locale' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', config('satspoint.locales'))],
        ];
    }

    /** @return array{type: string, valeur: string} */
    public function identifiantNormalise(): array
    {
        return Identifiant::normaliser($this->input('identifiant'));
    }
}

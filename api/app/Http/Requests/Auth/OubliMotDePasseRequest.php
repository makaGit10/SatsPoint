<?php

namespace App\Http\Requests\Auth;

use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;

class OubliMotDePasseRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'identifiant' => ['required', 'string', 'max:190'],
        ];
    }

    /** @return array{type: string, valeur: string}|null */
    public function identifiantNormalise(): ?array
    {
        return Identifiant::normaliser($this->input('identifiant'));
    }
}

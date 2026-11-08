<?php

namespace App\Http\Requests\Equipe;

use App\Models\Membre;
use App\Rules\IdentifiantValide;
use App\Support\Identifiant;
use Illuminate\Foundation\Http\FormRequest;

class InviterRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'contact' => ['required', 'string', 'max:190', new IdentifiantValide],
            'role' => ['required', 'string', 'in:'.implode(',', Membre::ROLES)],
        ];
    }

    /** @return array{type: string, valeur: string} */
    public function contactNormalise(): array
    {
        return Identifiant::normaliser($this->input('contact'));
    }
}

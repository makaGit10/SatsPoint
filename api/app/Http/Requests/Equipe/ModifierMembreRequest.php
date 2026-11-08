<?php

namespace App\Http\Requests\Equipe;

use App\Models\Membre;
use Illuminate\Foundation\Http\FormRequest;

class ModifierMembreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'role' => ['sometimes', 'string', 'in:'.implode(',', Membre::ROLES)],
            'actif' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (! $this->has('role') && ! $this->has('actif')) {
                $validator->errors()->add('role', 'Indiquez au moins un changement (rôle ou activation).');
            }
        });
    }
}

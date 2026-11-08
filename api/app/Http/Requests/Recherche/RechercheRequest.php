<?php

namespace App\Http\Requests\Recherche;

use Illuminate\Foundation\Http\FormRequest;

/** GET /recherche?q= : 2 à 80 caractères. */
class RechercheRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'q' => ['required', 'string', 'min:2', 'max:80'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['q' => trim((string) $this->input('q'))]);
    }
}

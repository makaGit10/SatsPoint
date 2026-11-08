<?php

namespace App\Http\Requests\Admin;

use App\Services\ConsolePlateforme;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** GET /admin/boutiques?q=&statut=&curseur=&limite= */
class ListerBoutiquesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:80'],
            'statut' => ['sometimes', 'nullable', 'string', Rule::in(ConsolePlateforme::STATUTS)],
            'curseur' => ['sometimes', 'nullable', 'string', 'max:500'],
            'limite' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function filtres(): array
    {
        return $this->safe()->only(['q', 'statut', 'curseur', 'limite']);
    }
}

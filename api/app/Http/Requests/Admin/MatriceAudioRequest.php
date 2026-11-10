<?php

namespace App\Http\Requests\Admin;

use App\Services\Catalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** GET /admin/audio/matrice?langue=&ecran=&manquants=1&q= */
class MatriceAudioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'langue' => ['sometimes', 'nullable', 'string', Rule::in(Catalogue::codesLanguesActives())],
            'ecran' => ['sometimes', 'nullable', 'string', 'max:60', 'regex:/^[a-zA-Z0-9_-]+$/'],
            'manquants' => ['sometimes', 'nullable', 'boolean'],
            'q' => ['sometimes', 'nullable', 'string', 'max:60'],
        ];
    }

    /** @return array{langue: ?string, ecran: ?string, manquants: bool, q: ?string} */
    public function filtres(): array
    {
        return [
            'langue' => $this->input('langue') ?: null,
            'ecran' => $this->input('ecran') ?: null,
            'manquants' => $this->boolean('manquants'),
            'q' => $this->input('q') ?: null,
        ];
    }
}

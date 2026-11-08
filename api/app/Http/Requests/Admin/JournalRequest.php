<?php

namespace App\Http\Requests\Admin;

use App\Models\Boutique;
use Illuminate\Foundation\Http\FormRequest;

/** GET /admin/journal?action=&boutique=&utilisateur=&du=&au=&curseur=&limite= */
class JournalRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'action' => ['sometimes', 'nullable', 'string', 'max:80', 'regex:/^[a-z0-9_.]+\*?$/'],
            'boutique' => ['sometimes', 'nullable', 'string', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
            'utilisateur' => ['sometimes', 'nullable', 'string', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
            'du' => ['sometimes', 'nullable', 'date_format:Y-m-d'],
            'au' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'after_or_equal:du'],
            'curseur' => ['sometimes', 'nullable', 'string', 'max:500'],
            'limite' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ];
    }

    public function filtres(): array
    {
        return $this->safe()->only(['action', 'boutique', 'utilisateur', 'du', 'au', 'curseur', 'limite']);
    }
}

<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\AvecPagination;
use App\Models\Boutique;
use Illuminate\Foundation\Http\FormRequest;

/** GET /admin/journal?action=&boutique=&utilisateur=&du=&au=&page=&par_page= */
class JournalRequest extends FormRequest
{
    use AvecPagination;

    public const PAR_PAGE = 30;

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
            ...$this->reglesPagination(),
        ];
    }

    public function filtres(): array
    {
        return [...$this->safe()->only(['action', 'boutique', 'utilisateur', 'du', 'au']), ...$this->pagination(self::PAR_PAGE)];
    }
}

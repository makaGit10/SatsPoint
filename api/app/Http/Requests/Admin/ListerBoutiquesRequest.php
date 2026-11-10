<?php

namespace App\Http\Requests\Admin;

use App\Http\Requests\Concerns\AvecPagination;
use App\Services\ConsolePlateforme;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** GET /admin/boutiques?q=&statut=&page=&par_page= */
class ListerBoutiquesRequest extends FormRequest
{
    use AvecPagination;

    public const PAR_PAGE = 20;

    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'q' => ['sometimes', 'nullable', 'string', 'max:80'],
            'statut' => ['sometimes', 'nullable', 'string', Rule::in(ConsolePlateforme::STATUTS)],
            ...$this->reglesPagination(),
        ];
    }

    public function filtres(): array
    {
        return [...$this->safe()->only(['q', 'statut']), ...$this->pagination(self::PAR_PAGE)];
    }
}

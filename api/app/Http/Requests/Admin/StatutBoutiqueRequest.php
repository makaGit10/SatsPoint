<?php

namespace App\Http\Requests\Admin;

use App\Services\ConsolePlateforme;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** PATCH /admin/boutiques/{boutique} { statut: 'active' | 'suspendue' } */
class StatutBoutiqueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'statut' => ['required', 'string', Rule::in(ConsolePlateforme::STATUTS)],
        ];
    }
}

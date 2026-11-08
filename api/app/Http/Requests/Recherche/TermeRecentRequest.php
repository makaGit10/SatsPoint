<?php

namespace App\Http\Requests\Recherche;

use Illuminate\Foundation\Http\FormRequest;

/** POST /recherche/recentes { terme } */
class TermeRecentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'terme' => ['required', 'string', 'min:1', 'max:120'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['terme' => trim((string) $this->input('terme'))]);
    }
}

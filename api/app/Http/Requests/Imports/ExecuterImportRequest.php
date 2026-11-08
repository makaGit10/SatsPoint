<?php

namespace App\Http\Requests\Imports;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** POST /imports/{ulid}/executer { correspondance: { colonne: champ|null }, mode } */
class ExecuterImportRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'correspondance' => ['required', 'array', 'min:1', 'max:60'],
            'correspondance.*' => ['nullable', 'string', Rule::in(config('satspoint.import.champs'))],
            'mode' => ['required', 'string', Rule::in(config('satspoint.import.modes'))],
        ];
    }
}

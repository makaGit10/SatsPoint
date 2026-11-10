<?php

namespace App\Http\Requests;

use App\Services\Catalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class PreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'locale' => ['sometimes', 'string', 'in:'.implode(',', config('satspoint.locales'))],
            // null = aucune langue audio (interface en anglais : l'aide vocale est coupée).
            // Langues actives du catalogue (CONTRAT_API § 14.5).
            'langue_audio' => ['sometimes', 'nullable', 'string', 'max:12', Rule::in(Catalogue::codesLanguesActives())],
            'theme' => ['sometimes', 'string', 'in:'.implode(',', config('satspoint.themes'))],
            'aide_vocale' => ['sometimes', 'boolean'],
        ];
    }
}

<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class PreferencesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $languesAudio = array_column(config('satspoint.langues_audio'), 'code');

        return [
            'locale' => ['sometimes', 'string', 'in:'.implode(',', config('satspoint.locales'))],
            // null = aucune langue audio (interface en anglais : l'aide vocale est coupée).
            'langue_audio' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', $languesAudio)],
            'theme' => ['sometimes', 'string', 'in:'.implode(',', config('satspoint.themes'))],
            'aide_vocale' => ['sometimes', 'boolean'],
        ];
    }
}

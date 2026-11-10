<?php

namespace App\Http\Requests\Admin;

use App\Models\CleAudio;
use App\Services\Catalogue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** POST /admin/audio/publier { ids: number[] } ou { cle, langue }. */
class PublierAudioRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'ids' => ['required_without:cle', 'array', 'min:1', 'max:200'],
            'ids.*' => ['integer', 'min:1', 'distinct'],
            'cle' => ['required_without:ids', 'string', 'max:120', 'regex:'.CleAudio::REGEX],
            'langue' => ['required_with:cle', 'string', Rule::in(Catalogue::codesLanguesActives())],
        ];
    }
}

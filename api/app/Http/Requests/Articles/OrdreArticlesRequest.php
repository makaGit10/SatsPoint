<?php

namespace App\Http\Requests\Articles;

use App\Models\Boutique;
use Illuminate\Foundation\Http\FormRequest;

/** POST /articles/ordre { ulids: string[] } */
class OrdreArticlesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'ulids' => ['required', 'array', 'min:1', 'max:500'],
            'ulids.*' => ['required', 'string', 'distinct', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
        ];
    }
}

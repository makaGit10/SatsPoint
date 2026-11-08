<?php

namespace App\Http\Requests\Exports;

use Illuminate\Foundation\Http\FormRequest;

/** GET /exports/articles?format=csv|xlsx&actifs=1 */
class ExporterArticlesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'format' => ['sometimes', 'string', 'in:csv,xlsx'],
            'actifs' => ['sometimes', 'nullable', 'boolean'],
        ];
    }
}

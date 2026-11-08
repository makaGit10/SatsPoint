<?php

namespace App\Http\Requests\Boutique;

use App\Models\ComptePaytech;
use Illuminate\Foundation\Http\FormRequest;

/** PUT /boutique/paytech { api_key, api_secret, environnement } — champ vide = conserver la valeur existante. */
class ConfigurerPaytechRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'api_key' => ['sometimes', 'nullable', 'string', 'min:8', 'max:255', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'api_secret' => ['sometimes', 'nullable', 'string', 'min:8', 'max:255', 'regex:/^[A-Za-z0-9._\-]+$/'],
            'environnement' => ['required', 'string', 'in:'.ComptePaytech::ENV_TEST.','.ComptePaytech::ENV_PROD],
        ];
    }
}

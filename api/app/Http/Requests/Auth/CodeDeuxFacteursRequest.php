<?php

namespace App\Http\Requests\Auth;

use Illuminate\Foundation\Http\FormRequest;

/** { code } : 6 chiffres (TOTP) ou code de secours XXXX-XXXX. */
class CodeDeuxFacteursRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'min:6', 'max:12', 'regex:/^(\d{6}|[A-Za-z0-9]{4}-?[A-Za-z0-9]{4})$/'],
        ];
    }

    public function messages(): array
    {
        return ['code.regex' => 'Saisissez le code à 6 chiffres de votre application, ou un code de secours.'];
    }
}

<?php

namespace App\Http\Requests\Admin;

use App\Models\Pays;
use Illuminate\Foundation\Http\FormRequest;

/** GET /admin/moyens-paiement?pays= — super-admin. */
class ListerMoyensRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'pays' => ['sometimes', 'nullable', 'string', 'regex:/^'.Pays::CODE_REGEX.'$/'],
        ];
    }
}

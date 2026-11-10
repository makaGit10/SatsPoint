<?php

namespace App\Http\Requests\Admin;

use App\Models\Langue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/langues et PATCH /admin/langues/{code} — super-admin (CONTRAT_API § 14.2).
 * Création : tous les champs ; modification : champs partiels, le code ne change jamais.
 */
class LangueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        $creation = $this->isMethod('post');
        $requis = $creation ? 'required' : 'sometimes';
        $nom = [$requis, 'string', 'min:2', 'max:40', 'regex:'.ModifierPaysRequest::REGEX_NOM];

        return [
            'code' => $creation
                ? ['required', 'string', 'max:12', 'regex:/^'.Langue::CODE_REGEX.'$/', Rule::unique('langues', 'code')]
                : ['prohibited'],
            'nom_local' => $nom,
            'nom_fr' => $nom,
            'nom_en' => $nom,
            // Pays où la langue est proposée ; vide = tous les pays.
            'pays' => [$creation ? 'present' : 'sometimes', 'array', 'max:8'],
            'pays.*' => ['string', 'size:2', 'distinct', Rule::exists('pays', 'code')],
            'actif' => ['sometimes', 'boolean'],
            'ordre' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ];
    }

    public function messages(): array
    {
        return [
            'code.regex' => 'Code de langue invalide : 2 à 8 lettres minuscules, éventuellement suivies d\'un tiret et de 2 ou 3 lettres (ex. bm, dyu, ff-ml).',
            'code.unique' => 'Ce code de langue existe déjà.',
        ];
    }
}

<?php

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** PATCH /admin/pays/{code} { nom_fr?, nom_en?, actif? } — super-admin (CONTRAT_API § 14.2). */
class ModifierPaysRequest extends FormRequest
{
    /** Nom affiché : lettres (accents compris), chiffres, espace, apostrophes, tiret, point. */
    public const REGEX_NOM = '/^[\pL\pM\pN][\pL\pM\pN \'’.\-]*$/u';

    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        return [
            'nom_fr' => ['sometimes', 'string', 'min:2', 'max:40', 'regex:'.self::REGEX_NOM],
            'nom_en' => ['sometimes', 'string', 'min:2', 'max:40', 'regex:'.self::REGEX_NOM],
            'actif' => ['sometimes', 'boolean'],
            // Liste fermée : ni le code, ni l'indicatif, ni la devise ne se modifient par l'API.
            'code' => ['prohibited'],
            'indicatif' => ['prohibited'],
            'devise' => ['prohibited'],
        ];
    }
}

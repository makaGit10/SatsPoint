<?php

namespace App\Http\Requests\Admin;

use App\Models\MoyenPaiement;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * POST /admin/moyens-paiement et PATCH /admin/moyens-paiement/{ulid} — super-admin (CONTRAT_API § 14.2).
 * Le pays et le type ne changent pas après création (une boutique a pu activer le moyen avec un numéro / un lien).
 */
class MoyenPaiementRequest extends FormRequest
{
    /** Nom : lettres, chiffres, espace, ' ’ - . & + / (ex. « Mixx by Yas », « T-Money », « MTN MoMo »). */
    public const REGEX_NOM = '/^[\pL\pM\pN][\pL\pM\pN \'’.\-&+\/]*$/u';

    /** Instructions : texte brut d'une ligne — ni balise, ni caractère de contrôle (retour à la ligne compris). */
    public const REGEX_INTERDIT_INSTRUCTIONS = '/[<>\x00-\x1F\x7F]/u';

    public function authorize(): bool
    {
        return $this->user()?->estSuperAdmin() === true;
    }

    public function rules(): array
    {
        $creation = $this->isMethod('post');
        $existant = $creation ? null : MoyenPaiement::query()->where('ulid', (string) $this->route('moyen'))->first(['id', 'pays']);
        $pays = $creation ? (string) $this->input('pays') : $existant?->pays;

        $unique = Rule::unique('moyens_paiement', 'nom')->where('pays', $pays);
        if ($existant !== null) {
            $unique->ignore($existant->id);
        }

        $instructions = ['sometimes', 'nullable', 'string', 'max:160', 'not_regex:'.self::REGEX_INTERDIT_INSTRUCTIONS];

        return [
            'pays' => $creation ? ['required', 'string', 'size:2', Rule::exists('pays', 'code')] : ['prohibited'],
            'type' => $creation ? ['required', 'string', Rule::in(MoyenPaiement::TYPES)] : ['prohibited'],
            'nom' => [$creation ? 'required' : 'sometimes', 'string', 'min:2', 'max:40', 'regex:'.self::REGEX_NOM, $unique],
            'couleur' => [$creation ? 'required' : 'sometimes', 'string', Rule::in(MoyenPaiement::COULEURS)],
            'instructions_fr' => $instructions,
            'instructions_en' => $instructions,
            'actif' => ['sometimes', 'boolean'],
            'ordre' => ['sometimes', 'integer', 'min:0', 'max:999'],
        ];
    }

    public function messages(): array
    {
        return [
            'nom.unique' => 'Ce moyen de paiement existe déjà pour ce pays.',
            'instructions_fr.not_regex' => 'Les instructions sont du texte simple, sur une ligne, sans < ni >.',
            'instructions_en.not_regex' => 'Les instructions sont du texte simple, sur une ligne, sans < ni >.',
        ];
    }
}

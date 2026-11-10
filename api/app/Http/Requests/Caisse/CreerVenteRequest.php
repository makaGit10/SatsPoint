<?php

namespace App\Http\Requests\Caisse;

use App\Models\Boutique;
use App\Models\Paiement;
use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * POST /ventes (CONTRAT_API § 3) : montant borné (100 ≤ montant ≤ maximum de la boutique),
 * lignes facultatives dont la somme doit égaler le montant, moyen et opérateur dans des listes fermées.
 */
class CreerVenteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $max = (int) (app(BoutiqueCourante::class)->obtenir()?->reglagesComplets()['montant_max_xof'] ?? config('satspoint.boutique.reglages_defaut.montant_max_xof'));

        return [
            'montant_xof' => ['required', 'integer', 'min:100', 'max:'.$max],
            'note' => ['sometimes', 'nullable', 'string', 'max:200'],
            'methode' => ['required', 'string', 'in:'.implode(',', Paiement::METHODES)],
            'operateur' => ['sometimes', 'nullable', 'string', 'in:'.implode(',', Paiement::OPERATEURS)],
            // Moyen du pays (CONTRAT_API § 14.4) : ulid du moyen du catalogue, requis avec la méthode moyen_pays.
            'moyen' => ['required_if:methode,'.Paiement::METHODE_MOYEN_PAYS, 'nullable', 'string', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
            'lignes' => ['sometimes', 'array', 'max:100'],
            'lignes.*' => ['array:article_ulid,libelle,quantite,prix_unitaire_xof'],
            'lignes.*.article_ulid' => ['sometimes', 'nullable', 'string', 'regex:/^'.Boutique::ULID_REGEX.'$/'],
            'lignes.*.libelle' => ['required', 'string', 'min:1', 'max:120'],
            'lignes.*.quantite' => ['required', 'integer', 'min:1', 'max:10000'],
            'lignes.*.prix_unitaire_xof' => ['required', 'integer', 'min:0', 'max:50000000'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $lignes = $this->input('lignes');

            if (is_array($lignes) && $lignes !== [] && ! $v->errors()->has('lignes') && ! $v->errors()->has('montant_xof')) {
                $somme = 0;
                foreach ($lignes as $ligne) {
                    $somme += (int) ($ligne['quantite'] ?? 0) * (int) ($ligne['prix_unitaire_xof'] ?? 0);
                }
                if ($somme !== (int) $this->input('montant_xof')) {
                    $v->errors()->add('montant_xof', 'Le montant doit être égal à la somme des lignes.');
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'montant_xof.min' => 'Le montant minimum est de 100 FCFA.',
            'montant_xof.max' => 'Le montant dépasse le maximum autorisé pour la boutique.',
        ];
    }
}

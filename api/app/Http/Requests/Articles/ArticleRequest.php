<?php

namespace App\Http\Requests\Articles;

use App\Models\Article;
use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** POST /articles et PATCH /articles/{ulid} (CONTRAT_API § 9). */
class ArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $creation = $this->isMethod('POST');
        $requis = $creation ? 'required' : 'sometimes';

        /** @var Article|null $article */
        $article = $this->route('article');

        return [
            'nom' => [$requis, 'string', 'min:1', 'max:120'],
            'prix_xof' => [$requis, 'integer', 'min:0', 'max:50000000'],
            'categorie' => ['sometimes', 'nullable', 'string', 'max:60'],
            'couleur' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'sku' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('articles', 'sku')->where('boutique_id', app(BoutiqueCourante::class)->id() ?? 0)->ignore($article?->id)],
            'actif' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];
    }

    public function messages(): array
    {
        return [
            'couleur.regex' => 'La couleur doit être au format #RRGGBB.',
            'sku.unique' => 'Cette référence existe déjà dans la boutique.',
        ];
    }
}

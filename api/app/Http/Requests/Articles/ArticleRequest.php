<?php

namespace App\Http\Requests\Articles;

use App\Models\Article;
use App\Services\BoutiqueCourante;
use App\Support\Pictogrammes;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/**
 * POST /articles (JSON ou multipart avec `photo` / `voix`) et PATCH /articles/{ulid} (JSON) — CONTRAT_API § 9 et § 15.
 *
 * Le nom écrit est FACULTATIF : un article garde au moins une identité parmi nom écrit, pictogramme, photo
 * ou nom dit à voix haute (sinon 422 sur `nom`). Le type réel des fichiers est vérifié par MediasArticle
 * (signature + ré-encodage), jamais d'après l'extension.
 */
class ArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        $creation = $this->isMethod('POST');

        /** @var Article|null $article */
        $article = $this->route('article');

        $regles = [
            'nom' => ['sometimes', 'nullable', 'string', 'min:1', 'max:120'],
            'prix_xof' => [$creation ? 'required' : 'sometimes', 'integer', 'min:0', 'max:50000000'],
            'categorie' => ['sometimes', 'nullable', 'string', 'max:60'],
            'couleur' => ['sometimes', 'nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'pictogramme' => ['sometimes', 'nullable', 'string', Rule::in(Pictogrammes::ids())],
            'sku' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9._-]+$/',
                Rule::unique('articles', 'sku')->where('boutique_id', app(BoutiqueCourante::class)->id() ?? 0)->ignore($article?->id)],
            'actif' => ['sometimes', 'boolean'],
            'position' => ['sometimes', 'integer', 'min:0', 'max:100000'],
        ];

        // Création en une seule requête (multipart) : photo et nom vocal facultatifs.
        if ($creation) {
            $regles['photo'] = ['sometimes', 'file', 'max:'.(int) config('satspoint.articles_medias.photo_max_ko', 4096)];
            $regles['voix'] = ['sometimes', 'file', 'max:'.(int) config('satspoint.articles_medias.voix_max_ko', 1024)];
        }

        return $regles;
    }

    public function after(): array
    {
        return [function (Validator $v) {
            if ($v->errors()->isNotEmpty()) {
                return;
            }

            /** @var Article|null $article */
            $article = $this->route('article');

            $nom = $this->has('nom') ? $this->input('nom') : $article?->nom;
            $pictogramme = $this->has('pictogramme') ? $this->input('pictogramme') : $article?->pictogramme;
            $photo = $article?->photo_empreinte !== null || $this->hasFile('photo');
            $voix = $article?->voix_empreinte !== null || $this->hasFile('voix');

            if (trim((string) $nom) === '' && $pictogramme === null && ! $photo && ! $voix) {
                $v->errors()->add('nom', 'Donnez un nom, une image, une photo ou un nom dit à voix haute.');
            }
        }];
    }

    /** Champs de l'article (sans les fichiers). */
    public function champs(): array
    {
        return collect($this->validated())->except(['photo', 'voix'])->all();
    }

    public function messages(): array
    {
        return [
            'couleur.regex' => 'La couleur doit être au format #RRGGBB.',
            'sku.unique' => 'Cette référence existe déjà dans la boutique.',
            'pictogramme.in' => 'Cette image n\'existe pas.',
            'photo.max' => 'La photo dépasse 4 Mo.',
            'photo.file' => 'La photo n\'a pas pu être envoyée.',
            'voix.max' => 'L\'enregistrement dépasse 1 Mo.',
            'voix.file' => 'L\'enregistrement n\'a pas pu être envoyé.',
        ];
    }
}

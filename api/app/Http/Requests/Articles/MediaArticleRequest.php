<?php

namespace App\Http\Requests\Articles;

use App\Models\Article;
use Illuminate\Foundation\Http\FormRequest;

/**
 * POST /articles/{ulid}/photo et POST /articles/{ulid}/voix (multipart `fichier`).
 * Droit vérifié AVANT toute validation (règle 12, comme /wallet/*) : caissier → 403, jamais le détail des champs.
 * Taille bornée ici ; type réel, dimensions et durée vérifiés par MediasArticle (signature + ré-encodage).
 */
class MediaArticleRequest extends FormRequest
{
    public function authorize(): bool
    {
        $article = $this->route('article');

        return $article instanceof Article && $this->user()?->can('update', $article) === true;
    }

    public function rules(): array
    {
        $photo = str_ends_with($this->path(), '/photo');
        $max = $photo ? (int) config('satspoint.articles_medias.photo_max_ko', 4096) : (int) config('satspoint.articles_medias.voix_max_ko', 1024);

        return ['fichier' => ['required', 'file', 'max:'.$max]];
    }

    public function messages(): array
    {
        $photo = str_ends_with($this->path(), '/photo');

        return [
            'fichier.required' => $photo ? 'Ajoutez une photo.' : 'Ajoutez un enregistrement.',
            'fichier.file' => 'Le fichier n\'a pas pu être envoyé.',
            'fichier.max' => $photo ? 'La photo dépasse 4 Mo.' : 'L\'enregistrement dépasse 1 Mo.',
        ];
    }
}

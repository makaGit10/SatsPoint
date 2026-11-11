<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Contenu d'une photo (WebP) ou d'un nom vocal (MP3) d'article, EN BASE (bytea), cloisonné par boutique.
 * Le contenu n'est jamais lu par une liste : seulement pour servir le fichier (MediasArticle).
 */
class ArticleFichier extends Model
{
    use AppartientAUneBoutique;

    public const TYPE_PHOTO = 'photo';

    public const TYPE_VOIX = 'voix';

    protected $table = 'article_fichiers';

    /** Le contenu binaire passe par une requête préparée (MediasArticle), jamais par l'assignation en masse. */
    protected $fillable = [];

    protected $hidden = ['contenu'];

    protected function casts(): array
    {
        return [
            'octets' => 'integer',
            'largeur' => 'integer',
            'hauteur' => 'integer',
            'duree_ms' => 'integer',
        ];
    }

    public function article(): BelongsTo
    {
        return $this->belongsTo(Article::class);
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use App\Support\Pictogrammes;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Article de la grille de caisse. Identifié par AU MOINS un nom écrit, un pictogramme, une photo ou un nom
 * dit à voix haute (contrainte en base + validation) : un commerçant qui ne sait pas écrire crée ses articles.
 * Les fichiers (photo WebP, voix MP3) sont dans `article_fichiers` ; l'article ne porte que leur empreinte.
 */
class Article extends Model
{
    use AppartientAUneBoutique, AUlid, HasFactory;

    protected $fillable = [
        'nom',
        'prix_xof',
        'categorie',
        'couleur',
        'pictogramme',
        'sku',
        'actif',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'prix_xof' => 'integer',
            'actif' => 'boolean',
            'position' => 'integer',
            'voix_duree_ms' => 'integer',
        ];
    }

    public function fichiers(): HasMany
    {
        return $this->hasMany(ArticleFichier::class);
    }

    /** URL versionnée de la photo (empreinte dans `v`) ou null. */
    public function photoUrl(): ?string
    {
        return $this->photo_empreinte ? sprintf('/api/v1/articles/%s/photo?v=%s', $this->ulid, substr((string) $this->photo_empreinte, 0, 12)) : null;
    }

    /** URL versionnée du nom dit à voix haute ou null. */
    public function voixUrl(): ?string
    {
        return $this->voix_empreinte ? sprintf('/api/v1/articles/%s/voix?v=%s', $this->ulid, substr((string) $this->voix_empreinte, 0, 12)) : null;
    }

    /** Vrai si l'article garde au moins une identité (nom écrit, pictogramme, photo ou voix). */
    public function aUneIdentite(): bool
    {
        return trim((string) $this->nom) !== '' || $this->pictogramme !== null || $this->photo_empreinte !== null || $this->voix_empreinte !== null;
    }

    /** Libellé lisible : nom écrit, sinon libellé du pictogramme, sinon « Article ». */
    public function libelle(): string
    {
        return trim((string) $this->nom) !== '' ? (string) $this->nom : (Pictogrammes::libelle($this->pictogramme) ?? 'Article');
    }
}

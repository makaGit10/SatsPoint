<?php

namespace App\Models;

use App\Services\Catalogue;
use Illuminate\Database\Eloquent\Model;

/**
 * Langue de l'aide vocale (CONTRAT_API § 14) — gérée par le super-admin, jamais supprimée si elle a des audios.
 * `pays` : codes des pays où elle est proposée ; vide = tous les pays (le français).
 */
class Langue extends Model
{
    /** Code court : 2 à 8 lettres minuscules, suffixe régional facultatif (ex. ff-ml) — 12 caractères au plus. */
    public const CODE_REGEX = '[a-z]{2,8}(?:-[a-z]{2,3})?';

    /** Langue de repli de toute l'aide vocale : jamais désactivée ni supprimée. */
    public const FRANCAIS = 'fr';

    protected $table = 'langues';

    protected $fillable = ['code', 'nom_local', 'nom_fr', 'nom_en', 'pays', 'actif', 'ordre'];

    protected function casts(): array
    {
        return [
            'pays' => 'array',
            'actif' => 'boolean',
            'ordre' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalogue::invalider());
        static::deleted(fn () => Catalogue::invalider());
    }

    public static function codeValide(string $code): bool
    {
        return strlen($code) <= 12 && preg_match('/^'.self::CODE_REGEX.'$/', $code) === 1;
    }

    public function estProtegee(): bool
    {
        return $this->code === self::FRANCAIS;
    }

    /** Clé vocale du nom de la langue (tuile du sélecteur de langue). */
    public function cleVocale(): string
    {
        return 'langue.'.$this->code;
    }

    /** Forme publique (GET /config). */
    public function formePublique(): array
    {
        return [
            'code' => $this->code,
            'nom_local' => $this->nom_local,
            'nom_fr' => $this->nom_fr,
            'nom_en' => $this->nom_en,
            'pays' => array_values((array) $this->pays),
            'ordre' => (int) $this->ordre,
        ];
    }

    /** Forme console (GET /admin/langues) ; `audios_publies` vient d'une sous-requête. */
    public function formeAdmin(): array
    {
        return $this->formePublique() + [
            'actif' => (bool) $this->actif,
            'audios_publies' => (int) ($this->getAttribute('audios_publies') ?? 0),
        ];
    }
}

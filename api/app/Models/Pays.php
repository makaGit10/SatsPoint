<?php

namespace App\Models;

use App\Services\Catalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Pays de la zone XOF (CONTRAT_API § 14) : liste fermée, seuls les noms et l'état actif sont modifiables
 * (super-admin). Clé primaire = code ISO 3166-1 alpha-2.
 */
class Pays extends Model
{
    public const SENEGAL = 'SN';

    public const CODE_REGEX = '[A-Z]{2}';

    protected $table = 'pays';

    protected $primaryKey = 'code';

    protected $keyType = 'string';

    public $incrementing = false;

    protected $fillable = ['nom_fr', 'nom_en', 'actif', 'ordre'];

    protected function casts(): array
    {
        return [
            'actif' => 'boolean',
            'ordre' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalogue::invalider());
        static::deleted(fn () => Catalogue::invalider());
    }

    public function moyensPaiement(): HasMany
    {
        return $this->hasMany(MoyenPaiement::class, 'pays', 'code');
    }

    public function boutiques(): HasMany
    {
        return $this->hasMany(Boutique::class, 'pays', 'code');
    }

    public function estProtege(): bool
    {
        return $this->code === self::SENEGAL;
    }

    /** Forme publique (GET /config). */
    public function formePublique(): array
    {
        return ['code' => $this->code, 'nom_fr' => $this->nom_fr, 'nom_en' => $this->nom_en, 'indicatif' => $this->indicatif];
    }

    /** Forme console (GET /admin/pays) ; `boutiques_count` vient de withCount. */
    public function formeAdmin(): array
    {
        return [
            'code' => $this->code,
            'nom_fr' => $this->nom_fr,
            'nom_en' => $this->nom_en,
            'indicatif' => $this->indicatif,
            'devise' => $this->devise,
            'actif' => (bool) $this->actif,
            'ordre' => (int) $this->ordre,
            'boutiques' => (int) ($this->boutiques_count ?? 0),
        ];
    }
}

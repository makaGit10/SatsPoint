<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Clé d'aide vocale (globale à la plateforme, gérée par le super-admin).
 * La clé vocale EST la clé i18n du front (CAHIER § 6.12) : `caisse.encaisser`, `nav.ventes`…
 */
class CleAudio extends Model
{
    protected $table = 'cles_audio';

    /** Forme autorisée d'une clé : segments alphanumériques (_ -) séparés par des points — jamais de « / » ni de « .. ». */
    public const REGEX = '/^[a-zA-Z0-9]+(?:[_-][a-zA-Z0-9]+)*(?:\.[a-zA-Z0-9]+(?:[_-][a-zA-Z0-9]+)*)+$/';

    protected $fillable = [
        'cle',
        'ecran',
        'contexte',
        'texte_fr',
        'texte_en',
        'essentielle',
        'ordre',
        'presente_dans_code',
    ];

    protected function casts(): array
    {
        return [
            'essentielle' => 'boolean',
            'ordre' => 'integer',
            'presente_dans_code' => 'boolean',
        ];
    }

    public function audios(): HasMany
    {
        return $this->hasMany(Audio::class, 'cle_audio_id');
    }

    public static function estValide(string $cle): bool
    {
        return strlen($cle) <= 120 && preg_match(self::REGEX, $cle) === 1;
    }
}

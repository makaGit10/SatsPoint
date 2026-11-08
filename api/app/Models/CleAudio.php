<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** Clé d'aide vocale (globale à la plateforme, gérée par le super-admin). */
class CleAudio extends Model
{
    protected $table = 'cles_audio';

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
}

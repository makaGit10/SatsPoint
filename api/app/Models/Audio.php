<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Audio extends Model
{
    protected $table = 'audios';

    public const STATUT_BROUILLON = 'brouillon';

    public const STATUT_PUBLIE = 'publie';

    protected $fillable = [
        'cle_audio_id',
        'langue',
        'chemin',
        'empreinte',
        'duree_ms',
        'taille',
        'statut',
        'enregistre_par',
        'publie_at',
    ];

    protected function casts(): array
    {
        return [
            'duree_ms' => 'integer',
            'taille' => 'integer',
            'publie_at' => 'datetime',
        ];
    }

    public function cle(): BelongsTo
    {
        return $this->belongsTo(CleAudio::class, 'cle_audio_id');
    }

    public function enregistrePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enregistre_par');
    }
}

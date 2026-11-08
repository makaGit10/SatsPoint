<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Cours BTC (global à la plateforme, non scopé). Une ligne par source retenue à chaque
 * rafraîchissement, plus une ligne « mediane » (celle qui fait foi, avec le nombre de sources).
 */
class CoursChange extends Model
{
    protected $table = 'cours_change';

    public const UPDATED_AT = null;

    public const SOURCE_MEDIANE = 'mediane';

    protected $fillable = [
        'source',
        'btc_eur',
        'btc_xof',
        'nb_sources',
        'recupere_at',
    ];

    protected function casts(): array
    {
        return [
            'btc_eur' => 'decimal:2',
            'btc_xof' => 'decimal:2',
            'nb_sources' => 'integer',
            'recupere_at' => 'datetime',
        ];
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Cours BTC (global à la plateforme, non scopé). */
class CoursChange extends Model
{
    protected $table = 'cours_change';

    public const UPDATED_AT = null;

    protected $fillable = [
        'source',
        'btc_eur',
        'btc_xof',
        'recupere_at',
    ];

    protected function casts(): array
    {
        return [
            'btc_eur' => 'decimal:2',
            'btc_xof' => 'decimal:2',
            'recupere_at' => 'datetime',
        ];
    }
}

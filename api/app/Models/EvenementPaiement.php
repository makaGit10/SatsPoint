<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Trace technique d'idempotence des notifications de paiement (non scopée : accès via le paiement).
 */
class EvenementPaiement extends Model
{
    protected $table = 'evenements_paiement';

    public const UPDATED_AT = null;

    public const SOURCES = ['nwc', 'paytech_ipn', 'verification', 'manuel'];

    protected $fillable = [
        'paiement_id',
        'source',
        'type',
        'empreinte_payload',
        'recu_at',
    ];

    protected function casts(): array
    {
        return [
            'recu_at' => 'datetime',
        ];
    }

    public function paiement(): BelongsTo
    {
        return $this->belongsTo(Paiement::class);
    }
}

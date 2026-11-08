<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Journal d'audit : écriture technique (non scopée) alimentée uniquement par le service Audit.
 */
class JournalAudit extends Model
{
    protected $table = 'journal_audit';

    public const UPDATED_AT = null;

    /** Aucune assignation en masse : le service Audit remplit tout via forceFill. */
    protected $guarded = ['*'];

    protected function casts(): array
    {
        return [
            'details' => 'array',
            'created_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function boutique(): BelongsTo
    {
        return $this->belongsTo(Boutique::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RechercheRecente extends Model
{
    protected $table = 'recherches_recentes';

    public const UPDATED_AT = null;

    protected $fillable = [
        'user_id',
        'terme',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

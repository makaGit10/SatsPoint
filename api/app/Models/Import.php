<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Import extends Model
{
    use AppartientAUneBoutique, AUlid;

    public const STATUTS = ['analyse', 'en_cours', 'termine', 'echoue'];

    protected $fillable = [
        'user_id',
        'type',
        'fichier',
        'correspondance',
        'statut',
        'rapport',
    ];

    protected $hidden = ['fichier'];

    protected function casts(): array
    {
        return [
            'correspondance' => 'array',
            'rapport' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

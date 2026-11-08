<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Invitation extends Model
{
    use AppartientAUneBoutique, AUlid;

    protected $fillable = [
        'contact',
        'role',
        'expire_at',
    ];

    protected $hidden = ['jeton_hash'];

    protected function casts(): array
    {
        return [
            'expire_at' => 'datetime',
            'acceptee_at' => 'datetime',
        ];
    }

    public function invitant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invite_par');
    }

    public function accepteePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'acceptee_par');
    }

    public static function hacher(#[\SensitiveParameter] string $jeton): string
    {
        return hash('sha256', $jeton);
    }

    public function estValide(): bool
    {
        return $this->acceptee_at === null && $this->expire_at !== null && $this->expire_at->isFuture();
    }
}

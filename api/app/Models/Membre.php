<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Membre extends Model
{
    use AppartientAUneBoutique, AUlid, HasFactory;

    public const ROLE_PROPRIETAIRE = 'proprietaire';

    public const ROLE_GERANT = 'gerant';

    public const ROLE_CAISSIER = 'caissier';

    public const ROLES = [self::ROLE_PROPRIETAIRE, self::ROLE_GERANT, self::ROLE_CAISSIER];

    protected $fillable = [
        'user_id',
        'role',
        'actif',
        'invite_par',
    ];

    protected $hidden = ['pin_hash'];

    protected function casts(): array
    {
        return [
            'actif' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function invitant(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invite_par');
    }

    public function estProprietaire(): bool
    {
        return $this->role === self::ROLE_PROPRIETAIRE;
    }

    public function estGerant(): bool
    {
        return $this->role === self::ROLE_GERANT;
    }

    public function estCaissier(): bool
    {
        return $this->role === self::ROLE_CAISSIER;
    }

    /** Propriétaire ou gérant : peut administrer la boutique (hors portefeuille / PayTech). */
    public function peutAdministrer(): bool
    {
        return $this->actif && in_array($this->role, [self::ROLE_PROPRIETAIRE, self::ROLE_GERANT], true);
    }
}

<?php

namespace App\Models;

use App\Casts\Chiffre;
use App\Models\Concerns\AUlid;
use App\Models\Scopes\BoutiqueScope;
use App\Notifications\ReinitialisationMotDePasse;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Str;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use AUlid, HasFactory, Notifiable;

    public const ROLE_SUPER_ADMIN = 'super_admin';

    /** Assignation en masse strictement limitée : rôle plateforme, ulid et 2FA se posent explicitement. */
    protected $fillable = [
        'nom',
        'email',
        'telephone',
        'password',
        'preferences',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'two_factor_secret',
        'two_factor_recovery_codes',
        'two_factor_confirmed_at',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'preferences' => 'array',
            'two_factor_secret' => Chiffre::class,
            'two_factor_recovery_codes' => Chiffre::class,
            'two_factor_confirmed_at' => 'datetime',
            'derniere_connexion_at' => 'datetime',
            'sessions_revoquees_at' => 'datetime',
        ];
    }

    // ------------------------------------------------------------ relations

    /** Toutes les adhésions (sans le scope : un utilisateur peut lire ses propres adhésions). */
    public function membres(): HasMany
    {
        return $this->hasMany(Membre::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function journalAudit(): HasMany
    {
        return $this->hasMany(JournalAudit::class);
    }

    // ------------------------------------------------------------- méthodes

    public function estSuperAdmin(): bool
    {
        return $this->role_plateforme === self::ROLE_SUPER_ADMIN;
    }

    /** 2FA activée (secret confirmé par un premier code valide). */
    public function deuxFaActive(): bool
    {
        return $this->two_factor_confirmed_at !== null && filled($this->two_factor_secret);
    }

    /** La 2FA est exigée pour la console plateforme (super-admin). */
    public function deuxFaRequise(): bool
    {
        return $this->estSuperAdmin() && config('satspoint.deux_fa_super_admin', true);
    }

    /** Préférences complétées par les valeurs par défaut. */
    public function preferencesCompletes(): array
    {
        $defaut = config('satspoint.preferences_defaut');

        return array_intersect_key(array_merge($defaut, (array) $this->preferences), $defaut);
    }

    public function identifiantPrincipal(): ?string
    {
        return $this->email ?? $this->telephone;
    }

    /** Révoque toutes les sessions (cookie « se souvenir » compris). */
    public function revoquerSessions(): void
    {
        $this->forceFill([
            'sessions_revoquees_at' => now(),
            'remember_token' => Str::random(60),
        ])->save();
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new ReinitialisationMotDePasse($token));
    }

    public function routeNotificationForMail(): ?string
    {
        return $this->email;
    }
}

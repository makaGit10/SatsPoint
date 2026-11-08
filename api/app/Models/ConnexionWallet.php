<?php

namespace App\Models;

use App\Casts\Chiffre;
use App\Models\Concerns\AppartientAUneBoutique;
use Illuminate\Database\Eloquent\Model;

/**
 * Connexion NWC d'une boutique. L'URI (qui contient le secret) est chiffrée en base
 * et n'est JAMAIS renvoyée au navigateur.
 */
class ConnexionWallet extends Model
{
    use AppartientAUneBoutique;

    protected $table = 'connexions_wallet';

    public const STATUT_ACTIVE = 'active';

    public const STATUT_ERREUR = 'erreur';

    public const STATUT_REVOQUEE = 'revoquee';

    protected $fillable = [
        'uri_chiffree',
        'pubkey_wallet',
        'relais',
        'permissions',
        'budget_sats',
        'statut',
        'verifiee_at',
        'alias',
        'lud16',
    ];

    protected $hidden = ['uri_chiffree'];

    protected function casts(): array
    {
        return [
            'uri_chiffree' => Chiffre::class,
            'relais' => 'array',
            'permissions' => 'array',
            'budget_sats' => 'integer',
            'verifiee_at' => 'datetime',
        ];
    }

    public function estSimulee(): bool
    {
        return str_starts_with((string) $this->uri_chiffree, 'mock://');
    }
}

<?php

namespace App\Models;

use App\Casts\Chiffre;
use App\Models\Concerns\AppartientAUneBoutique;
use Illuminate\Database\Eloquent\Model;

class ComptePaytech extends Model
{
    use AppartientAUneBoutique;

    protected $table = 'comptes_paytech';

    public const ENV_TEST = 'test';

    public const ENV_PROD = 'prod';

    public const STATUT_ACTIF = 'actif';

    public const STATUT_ERREUR = 'erreur';

    public const STATUT_REVOQUE = 'revoque';

    protected $fillable = [
        'api_key_chiffree',
        'api_secret_chiffree',
        'environnement',
        'statut',
        'verifie_at',
    ];

    protected $hidden = ['api_key_chiffree', 'api_secret_chiffree'];

    protected function casts(): array
    {
        return [
            'api_key_chiffree' => Chiffre::class,
            'api_secret_chiffree' => Chiffre::class,
            'verifie_at' => 'datetime',
        ];
    }

    public function estEnTest(): bool
    {
        return $this->environnement === self::ENV_TEST;
    }
}

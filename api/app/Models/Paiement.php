<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Paiement extends Model
{
    use AppartientAUneBoutique, AUlid;

    public const METHODES = ['lightning', 'paytech', 'wave_manuel'];

    public const STATUT_EN_ATTENTE = 'en_attente';

    public const STATUT_REUSSI = 'reussi';

    public const STATUT_EXPIRE = 'expire';

    public const STATUT_ECHOUE = 'echoue';

    public const STATUT_ANNULE = 'annule';

    public const STATUTS = [self::STATUT_EN_ATTENTE, self::STATUT_REUSSI, self::STATUT_EXPIRE, self::STATUT_ECHOUE, self::STATUT_ANNULE];

    public const OPERATEURS = ['wave', 'orange_money', 'free_money'];

    protected $fillable = [
        'vente_id',
        'methode',
        'statut',
        'montant_xof',
        'montant_sats',
        'cours_xof_par_btc',
        'bolt11',
        'payment_hash',
        'expire_at',
        'paytech_token',
        'paytech_ref',
        'operateur',
    ];

    protected $hidden = ['preimage', 'paytech_token'];

    protected function casts(): array
    {
        return [
            'montant_xof' => 'integer',
            'montant_sats' => 'integer',
            'cours_xof_par_btc' => 'decimal:2',
            'expire_at' => 'datetime',
            'confirme_at' => 'datetime',
            'regle_at' => 'datetime',
        ];
    }

    public function vente(): BelongsTo
    {
        return $this->belongsTo(Vente::class);
    }

    public function confirmePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'confirme_par');
    }

    public function evenements(): HasMany
    {
        return $this->hasMany(EvenementPaiement::class);
    }
}

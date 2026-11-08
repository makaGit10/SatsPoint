<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Vente extends Model
{
    use AppartientAUneBoutique, AUlid;

    public const STATUT_EN_ATTENTE = 'en_attente';

    public const STATUT_PAYEE = 'payee';

    public const STATUT_ANNULEE = 'annulee';

    public const STATUT_EXPIREE = 'expiree';

    public const STATUTS = [self::STATUT_EN_ATTENTE, self::STATUT_PAYEE, self::STATUT_ANNULEE, self::STATUT_EXPIREE];

    public const ALERTES = ['trop_percu', 'payee_apres_annulation'];

    protected $fillable = [
        'numero',
        'caissier_id',
        'montant_xof',
        'note',
        'statut',
    ];

    protected $hidden = ['recu_jeton'];

    protected function casts(): array
    {
        return [
            'numero' => 'integer',
            'montant_xof' => 'integer',
            'payee_at' => 'datetime',
        ];
    }

    public function caissier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'caissier_id');
    }

    public function lignes(): HasMany
    {
        return $this->hasMany(LigneVente::class);
    }

    public function paiements(): HasMany
    {
        return $this->hasMany(Paiement::class);
    }

    public function paiementReussi(): BelongsTo
    {
        return $this->belongsTo(Paiement::class, 'paiement_reussi_id');
    }
}

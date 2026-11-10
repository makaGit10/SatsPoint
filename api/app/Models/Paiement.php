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

    public const METHODE_LIGHTNING = 'lightning';

    public const METHODE_PAYTECH = 'paytech';

    public const METHODE_WAVE_MANUEL = 'wave_manuel';

    /** Moyen de paiement du pays de la boutique (catalogue, CONTRAT_API § 14.4) : confirmation manuelle, comme Wave direct. */
    public const METHODE_MOYEN_PAYS = 'moyen_pays';

    public const METHODES = [self::METHODE_LIGHTNING, self::METHODE_PAYTECH, self::METHODE_WAVE_MANUEL, self::METHODE_MOYEN_PAYS];

    /** Méthodes confirmées à la main par le propriétaire / gérant (aucune confirmation automatique possible). */
    public const METHODES_MANUELLES = [self::METHODE_WAVE_MANUEL, self::METHODE_MOYEN_PAYS];

    /** Méthodes rangées dans « mobile money » (tableau de bord, console). */
    public const METHODES_MOBILE_MONEY = [self::METHODE_PAYTECH, self::METHODE_WAVE_MANUEL, self::METHODE_MOYEN_PAYS];

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
        'paytech_redirect_url',
        'operateur',
        'moyen_paiement_id',
        'moyen',
        'simule',
    ];

    protected $hidden = ['preimage', 'paytech_token'];

    protected function casts(): array
    {
        return [
            'montant_xof' => 'integer',
            'montant_sats' => 'integer',
            'cours_xof_par_btc' => 'decimal:2',
            'simule' => 'boolean',
            'moyen' => 'array',
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

    // ------------------------------------------------------------- méthodes

    public function estEnAttente(): bool
    {
        return $this->statut === self::STATUT_EN_ATTENTE;
    }

    public function estReussi(): bool
    {
        return $this->statut === self::STATUT_REUSSI;
    }

    public function estLightning(): bool
    {
        return $this->methode === self::METHODE_LIGHTNING;
    }

    public function estPaytech(): bool
    {
        return $this->methode === self::METHODE_PAYTECH;
    }

    public function estWaveManuel(): bool
    {
        return $this->methode === self::METHODE_WAVE_MANUEL;
    }

    public function estMoyenPays(): bool
    {
        return $this->methode === self::METHODE_MOYEN_PAYS;
    }

    /** Wave direct ou moyen du pays : seule une confirmation humaine clôt la tentative. */
    public function seConfirmeManuellement(): bool
    {
        return in_array($this->methode, self::METHODES_MANUELLES, true);
    }

    /** Nom du moyen du pays (photographie), sinon null. */
    public function nomMoyen(): ?string
    {
        $moyen = $this->moyen;

        return $this->estMoyenPays() && is_array($moyen) && isset($moyen['nom']) ? (string) $moyen['nom'] : null;
    }

    /** Les 8 premiers caractères du hash : seule forme journalisée ou exposée. */
    public function hashAbrege(): ?string
    {
        return $this->payment_hash === null ? null : substr($this->payment_hash, 0, 8);
    }

    /** Montant attendu en millisats (Lightning). */
    public function montantMsats(): ?int
    {
        return $this->montant_sats === null ? null : (int) $this->montant_sats * 1000;
    }

    /** Cours figé, en entier XOF par BTC (le décimal en base garde deux décimales à zéro). */
    public function coursEntier(): ?int
    {
        return $this->cours_xof_par_btc === null ? null : (int) round((float) $this->cours_xof_par_btc);
    }
}

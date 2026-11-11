<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Vente extends Model
{
    use AppartientAUneBoutique, AUlid;

    public const STATUT_EN_ATTENTE = 'en_attente';

    public const STATUT_PAYEE = 'payee';

    public const STATUT_ANNULEE = 'annulee';

    public const STATUT_EXPIREE = 'expiree';

    public const STATUTS = [self::STATUT_EN_ATTENTE, self::STATUT_PAYEE, self::STATUT_ANNULEE, self::STATUT_EXPIREE];

    public const ALERTE_TROP_PERCU = 'trop_percu';

    public const ALERTE_PAYEE_APRES_ANNULATION = 'payee_apres_annulation';

    public const ALERTES = [self::ALERTE_TROP_PERCU, self::ALERTE_PAYEE_APRES_ANNULATION];

    /** Longueur du jeton de reçu public (caractères alphanumériques aléatoires). */
    public const LONGUEUR_JETON_RECU = 32;

    /** Colonnes de l'article chargées avec les lignes (visuel : pictogramme, couleur, photo). */
    public const COLONNES_ARTICLE_LIGNE = 'id,ulid,pictogramme,couleur,photo_empreinte';

    /** Délai sans tentative au-delà duquel une vente en attente expire (CAHIER § 7.2). */
    public const EXPIRATION_SANS_TENTATIVE_MIN = 30;

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

    // ------------------------------------------------------------- méthodes

    /** « V-000012 » */
    public function numeroAffiche(): string
    {
        return self::formaterNumero((int) $this->numero);
    }

    public static function formaterNumero(int $numero): string
    {
        return 'V-'.str_pad((string) $numero, 6, '0', STR_PAD_LEFT);
    }

    public function estEnAttente(): bool
    {
        return $this->statut === self::STATUT_EN_ATTENTE;
    }

    public function estPayee(): bool
    {
        return $this->statut === self::STATUT_PAYEE;
    }

    /** Chemin public du reçu (relatif : le front le rend absolu), seulement si payée. */
    public function recuUrl(): ?string
    {
        return ($this->estPayee() && $this->recu_jeton !== null) ? '/r/'.$this->recu_jeton : null;
    }

    public static function genererJetonRecu(): string
    {
        return Str::random(self::LONGUEUR_JETON_RECU);
    }
}

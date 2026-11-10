<?php

namespace App\Models;

use App\Models\Concerns\AUlid;
use App\Models\Scopes\BoutiqueScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

/**
 * La boutique est l'unité de cloisonnement : elle n'est pas elle-même scopée.
 */
class Boutique extends Model
{
    use AUlid, HasFactory;

    public const STATUT_ACTIVE = 'active';

    public const STATUT_SUSPENDUE = 'suspendue';

    protected $fillable = [
        'nom',
        'telephone',
        'ville',
        'fuseau',
        'devise',
        'pays',
        'reglages',
    ];

    protected function casts(): array
    {
        return [
            'reglages' => 'array',
        ];
    }

    // ------------------------------------------------------------ relations
    // Les relations enfants contournent le scope : on part DE la boutique, le filtre est implicite.

    public function membres(): HasMany
    {
        return $this->hasMany(Membre::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(Invitation::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function connexionWallet(): HasOne
    {
        return $this->hasOne(ConnexionWallet::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function comptePaytech(): HasOne
    {
        return $this->hasOne(ComptePaytech::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function articles(): HasMany
    {
        return $this->hasMany(Article::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function ventes(): HasMany
    {
        return $this->hasMany(Vente::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function paiements(): HasMany
    {
        return $this->hasMany(Paiement::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    public function moyensPaiementBoutique(): HasMany
    {
        return $this->hasMany(MoyenPaiementBoutique::class)->withoutGlobalScope(BoutiqueScope::class);
    }

    // ------------------------------------------------------------- méthodes

    /**
     * Moyens du pays ACTIVÉS par la boutique (CONTRAT_API § 14.3) : actifs au catalogue, du pays courant de la boutique,
     * avec une valeur (numéro ou lien marchand). Une seule requête (jointure), triés par ordre puis nom.
     *
     * @return list<array{ulid: string, nom: string, type: string, couleur: string, instructions_fr: ?string, instructions_en: ?string, active: bool, valeur: ?string}>
     */
    public function moyensPaysActives(): array
    {
        return MoyenPaiementBoutique::pourBoutique($this)
            ->join('moyens_paiement', 'moyens_paiement.id', '=', 'moyens_paiement_boutique.moyen_paiement_id')
            ->where('moyens_paiement_boutique.active', true)
            ->whereNotNull('moyens_paiement_boutique.valeur')
            ->where('moyens_paiement.actif', true)
            ->where('moyens_paiement.pays', $this->pays ?? Pays::SENEGAL)
            ->orderBy('moyens_paiement.ordre')->orderBy('moyens_paiement.nom')
            ->get([
                'moyens_paiement.ulid', 'moyens_paiement.nom', 'moyens_paiement.type', 'moyens_paiement.couleur',
                'moyens_paiement.instructions_fr', 'moyens_paiement.instructions_en', 'moyens_paiement_boutique.valeur',
            ])
            ->map(fn ($l) => [
                'ulid' => $l->ulid,
                'nom' => $l->nom,
                'type' => $l->type,
                'couleur' => $l->couleur,
                'instructions_fr' => $l->instructions_fr,
                'instructions_en' => $l->instructions_en,
                'active' => true,
                'valeur' => $l->valeur,
            ])
            ->values()
            ->all();
    }

    public function estActive(): bool
    {
        return $this->statut === self::STATUT_ACTIVE;
    }

    /** Réglages complétés par les valeurs par défaut (clés inconnues ignorées). */
    public function reglagesComplets(): array
    {
        $defaut = config('satspoint.boutique.reglages_defaut');
        $actuels = (array) $this->reglages;

        $complets = array_intersect_key(array_merge($defaut, $actuels), $defaut);
        $complets['moyens'] = array_intersect_key(array_merge($defaut['moyens'], (array) ($actuels['moyens'] ?? [])), $defaut['moyens']);
        $complets['paiement_test'] = (bool) $complets['paiement_test'];

        return $complets;
    }

    /** Réglages tels qu'exposés au front (sans l'indicateur paiement_test, porté par « configuration »). */
    public function reglagesExposes(): array
    {
        $reglages = $this->reglagesComplets();
        unset($reglages['paiement_test']);

        return $reglages;
    }

    /** État de configuration exposé au front : jamais de secret, seulement des booléens. */
    public function configuration(): array
    {
        $wallet = $this->relationLoaded('connexionWallet') ? $this->connexionWallet : $this->connexionWallet()->first();
        $paytech = $this->relationLoaded('comptePaytech') ? $this->comptePaytech : $this->comptePaytech()->first();

        return [
            'wallet' => $wallet !== null && $wallet->statut === ConnexionWallet::STATUT_ACTIVE,
            'paytech' => $paytech !== null && $paytech->statut === ComptePaytech::STATUT_ACTIF,
            'paiement_test' => $this->reglagesComplets()['paiement_test'],
        ];
    }

    /** État PayTech exposé au front (jamais les clés). */
    public function etatPaytech(): array
    {
        $paytech = $this->relationLoaded('comptePaytech') ? $this->comptePaytech : $this->comptePaytech()->first();

        return [
            'configure' => $paytech !== null && $paytech->statut === ComptePaytech::STATUT_ACTIF,
            'environnement' => $paytech?->environnement ?? config('satspoint.paytech.env', ComptePaytech::ENV_TEST),
        ];
    }
}

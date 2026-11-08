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
        'reglages',
    ];

    protected function casts(): array
    {
        return [
            'reglages' => 'array',
            'sequence_vente' => 'integer',
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

    // ------------------------------------------------------------- méthodes

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

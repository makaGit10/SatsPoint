<?php

namespace App\Models;

use App\Models\Concerns\AUlid;
use App\Services\Catalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Moyen de paiement d'un pays (catalogue global géré par le super-admin, CONTRAT_API § 14.2).
 * Une boutique l'active avec SON numéro ou SON lien marchand (MoyenPaiementBoutique).
 */
class MoyenPaiement extends Model
{
    use AUlid;

    public const TYPE_LIEN = 'lien';

    public const TYPE_NUMERO = 'numero';

    public const TYPES = [self::TYPE_LIEN, self::TYPE_NUMERO];

    /** Jetons de couleur d'accent (liste fermée, traduite en classes par le front). */
    public const COULEURS = ['bleu', 'ciel', 'orange', 'jaune', 'vert', 'rouge', 'violet', 'gris'];

    protected $table = 'moyens_paiement';

    protected $fillable = ['pays', 'nom', 'type', 'couleur', 'instructions_fr', 'instructions_en', 'actif', 'ordre'];

    protected function casts(): array
    {
        return [
            'actif' => 'boolean',
            'ordre' => 'integer',
        ];
    }

    protected static function booted(): void
    {
        static::saved(fn () => Catalogue::invalider());
        static::deleted(fn () => Catalogue::invalider());
    }

    public function paysAssocie(): BelongsTo
    {
        return $this->belongsTo(Pays::class, 'pays', 'code');
    }

    /** Forme MoyenCatalogue (console). `boutiques_actives` vient d'une sous-requête. */
    public function formeAdmin(): array
    {
        return [
            'ulid' => $this->ulid,
            'pays' => $this->pays,
            'nom' => $this->nom,
            'type' => $this->type,
            'couleur' => $this->couleur,
            'instructions_fr' => $this->instructions_fr,
            'instructions_en' => $this->instructions_en,
            'actif' => (bool) $this->actif,
            'ordre' => (int) $this->ordre,
            'boutiques_actives' => (int) ($this->getAttribute('boutiques_actives') ?? 0),
        ];
    }

    /** Forme MoyenBoutique (réglages et caisse d'une boutique). */
    public function formeBoutique(?MoyenPaiementBoutique $config): array
    {
        return [
            'ulid' => $this->ulid,
            'nom' => $this->nom,
            'type' => $this->type,
            'couleur' => $this->couleur,
            'instructions_fr' => $this->instructions_fr,
            'instructions_en' => $this->instructions_en,
            'active' => (bool) ($config?->active ?? false),
            'valeur' => $config?->valeur,
        ];
    }

    /** Photographie enregistrée sur une tentative de paiement (Paiement.moyen). */
    public function photographie(string $valeur): array
    {
        return [
            'ulid' => $this->ulid,
            'nom' => $this->nom,
            'type' => $this->type,
            'couleur' => $this->couleur,
            'valeur' => $valeur,
            'instructions_fr' => $this->instructions_fr,
            'instructions_en' => $this->instructions_en,
        ];
    }
}

<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Import d'articles (CAHIER § 6.15) : fichier déposé (hors racine web, nom généré), analyse
 * (colonnes, aperçu, suggestions), correspondance choisie, exécution en file et rapport.
 */
class Import extends Model
{
    use AppartientAUneBoutique, AUlid;

    public const STATUT_ANALYSE = 'analyse';

    public const STATUT_EN_COURS = 'en_cours';

    public const STATUT_TERMINE = 'termine';

    public const STATUT_ECHOUE = 'echoue';

    public const STATUTS = [self::STATUT_ANALYSE, self::STATUT_EN_COURS, self::STATUT_TERMINE, self::STATUT_ECHOUE];

    public const TYPE_ARTICLES = 'articles';

    public const MODE_CREER = 'creer';

    public const MODE_CREER_ET_MAJ = 'creer_et_mettre_a_jour';

    public const MODE_IGNORER_ERREURS = 'ignorer_erreurs';

    protected $fillable = [
        'user_id',
        'type',
        'fichier',
        'nom_fichier',
        'correspondance',
        'analyse',
        'statut',
        'mode',
        'rapport',
    ];

    protected $hidden = ['fichier'];

    protected function casts(): array
    {
        return [
            'correspondance' => 'array',
            'analyse' => 'array',
            'rapport' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** Rapport complété par les compteurs à zéro. */
    public function rapportComplet(): array
    {
        return array_merge(['total' => 0, 'traitees' => 0, 'creees' => 0, 'mises_a_jour' => 0, 'lignes_en_erreur' => 0, 'erreurs' => []], (array) $this->rapport);
    }
}

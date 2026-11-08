<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Fichier audio d'une clé vocale dans une langue (plateforme, non scopé).
 *
 * Cycle de vie : en_traitement → brouillon → publie → archive (remplacé par une nouvelle publication),
 * ou erreur (traitement ffmpeg impossible). Une seule ligne « publie » par (clé, langue) — index partiel unique.
 */
class Audio extends Model
{
    protected $table = 'audios';

    public const STATUT_EN_TRAITEMENT = 'en_traitement';

    public const STATUT_BROUILLON = 'brouillon';

    public const STATUT_PUBLIE = 'publie';

    public const STATUT_ARCHIVE = 'archive';

    public const STATUT_ERREUR = 'erreur';

    public const STATUTS = [self::STATUT_EN_TRAITEMENT, self::STATUT_BROUILLON, self::STATUT_PUBLIE, self::STATUT_ARCHIVE, self::STATUT_ERREUR];

    /** Longueur de l'empreinte dans le nom de fichier servi (URL versionnée immuable). */
    public const EMPREINTE_FICHIER = 8;

    protected $fillable = [
        'cle_audio_id',
        'langue',
        'chemin',
        'chemin_source',
        'empreinte',
        'duree_ms',
        'taille',
        'statut',
        'message_erreur',
        'enregistre_par',
        'publie_at',
    ];

    protected $hidden = ['chemin', 'chemin_source'];

    protected function casts(): array
    {
        return [
            'duree_ms' => 'integer',
            'taille' => 'integer',
            'publie_at' => 'datetime',
        ];
    }

    public function cle(): BelongsTo
    {
        return $this->belongsTo(CleAudio::class, 'cle_audio_id');
    }

    public function enregistrePar(): BelongsTo
    {
        return $this->belongsTo(User::class, 'enregistre_par');
    }

    // ------------------------------------------------------------- méthodes

    public function estPublie(): bool
    {
        return $this->statut === self::STATUT_PUBLIE;
    }

    /** Un brouillon, une archive ou un fichier en erreur peut être supprimé ; jamais la version publiée ni un traitement en cours. */
    public function estSupprimable(): bool
    {
        return in_array($this->statut, [self::STATUT_BROUILLON, self::STATUT_ARCHIVE, self::STATUT_ERREUR], true);
    }

    /** Un fichier publié ou archivé reste servi publiquement (les manifestes en cache peuvent encore le référencer). */
    public function estServiPubliquement(): bool
    {
        return in_array($this->statut, [self::STATUT_PUBLIE, self::STATUT_ARCHIVE], true);
    }

    /** Nom de fichier servi : {cle}.{empreinte8}.mp3 */
    public static function nomFichier(string $cle, string $empreinte): string
    {
        return sprintf('%s.%s.mp3', $cle, substr($empreinte, 0, self::EMPREINTE_FICHIER));
    }

    /** Chemin relatif au disque « public » : audio/{langue}/{cle}.{empreinte8}.mp3 */
    public static function cheminPublic(string $langue, string $cle, string $empreinte): string
    {
        return sprintf('%s/%s/%s', config('satspoint.audio.dossier_public', 'audio'), $langue, self::nomFichier($cle, $empreinte));
    }

    /** URL publique absolue du fichier (GET /audio/{langue}/{fichier}), seulement pour un fichier servi. */
    public function url(): ?string
    {
        if ($this->chemin === null || ! $this->estServiPubliquement()) {
            return null;
        }

        return url('/'.ltrim($this->chemin, '/'));
    }
}

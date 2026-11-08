<?php

namespace App\Http\Resources;

use App\Models\Audio;
use App\Services\Audio\StudioAudio;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API V3.3 `{ id, cle, langue, statut, duree_ms, url_ecoute, erreur? }` (studio). Relation attendue : cle.
 *
 * @mixin Audio
 */
class AudioResource extends JsonResource
{
    public static $wrap = 'audio';

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'cle' => $this->cle->cle,
            'langue' => $this->langue,
            'statut' => $this->statut,
            'duree_ms' => $this->statut === Audio::STATUT_EN_TRAITEMENT ? null : (int) $this->duree_ms,
            // Écoute dans le studio (brouillon compris) ; null tant que le traitement n'a pas produit le MP3.
            'url_ecoute' => filled($this->chemin) ? StudioAudio::urlEcoute($this->resource) : null,
            'erreur' => $this->statut === Audio::STATUT_ERREUR ? $this->message_erreur : null,
            // Ajouts au contrat : URL publique (publié / archivé seulement), taille, dates.
            'url' => $this->url(),
            'taille' => (int) $this->taille,
            'publie_le' => $this->publie_at?->toIso8601String(),
            'mis_a_jour_le' => $this->updated_at?->toIso8601String(),
        ];
    }
}

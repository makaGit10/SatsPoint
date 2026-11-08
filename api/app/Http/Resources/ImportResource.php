<?php

namespace App\Http\Resources;

use App\Models\Import;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API vague 3 `Import`.
 *
 * @mixin Import
 */
class ImportResource extends JsonResource
{
    public static $wrap = 'import';

    public function toArray(Request $request): array
    {
        $analyse = (array) $this->analyse;
        $rapport = $this->rapportComplet();

        return [
            'ulid' => $this->ulid,
            'statut' => $this->statut,
            'mode' => $this->mode,
            'nom_fichier' => $this->nom_fichier,
            'format' => $analyse['format'] ?? null,
            'encodage' => $analyse['encodage'] ?? null,
            'separateur' => $analyse['separateur'] ?? null,
            'colonnes' => array_values((array) ($analyse['colonnes'] ?? [])),
            'apercu' => array_values((array) ($analyse['apercu'] ?? [])),
            'suggestions' => (object) ($analyse['suggestions'] ?? []),
            'memorisee' => (object) ($analyse['memorisee'] ?? []),
            'correspondance' => (object) ((array) $this->correspondance),
            'total' => (int) ($rapport['total'] ?: ($analyse['total'] ?? 0)),
            'traitees' => (int) $rapport['traitees'],
            'creees' => (int) $rapport['creees'],
            'mises_a_jour' => (int) $rapport['mises_a_jour'],
            'erreurs' => array_values($rapport['erreurs']),
            'lignes_en_erreur' => (int) $rapport['lignes_en_erreur'], // ajout : total réel (la liste est bornée à 100)
            'rapport_url' => in_array($this->statut, [Import::STATUT_TERMINE, Import::STATUT_ECHOUE], true) ? '/api/v1/imports/'.$this->ulid.'/rapport' : null,
            'cree_le' => $this->created_at?->toIso8601String(),
            'mis_a_jour_le' => $this->updated_at?->toIso8601String(),
        ];
    }
}

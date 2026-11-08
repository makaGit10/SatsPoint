<?php

namespace App\Http\Resources;

use App\Models\Boutique;
use App\Models\Paiement;
use App\Services\BoutiqueCourante;
use App\Services\Caisse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Forme CONTRAT_API § 1 `Paiement`. Jamais la préimage ni la facture d'une tentative close.
 *
 * @mixin Paiement
 */
class PaiementResource extends JsonResource
{
    public static $wrap = 'paiement';

    public function toArray(Request $request): array
    {
        $ouverte = in_array($this->statut, [Paiement::STATUT_EN_ATTENTE, Paiement::STATUT_REUSSI], true);

        return [
            'ulid' => $this->ulid,
            'methode' => $this->methode,
            'operateur' => $this->operateur,
            'statut' => $this->statut,
            'montant_xof' => (int) $this->montant_xof,
            'montant_sats' => $this->montant_sats === null ? null : (int) $this->montant_sats,
            'cours_xof_par_btc' => $this->coursEntier(),
            'bolt11' => $this->estLightning() && $ouverte ? $this->bolt11 : null,
            'payment_hash_abrege' => $this->hashAbrege(),
            'paytech' => $this->estPaytech() && $this->paytech_redirect_url !== null
                ? ['redirect_url' => $this->paytech_redirect_url, 'token' => (string) $this->paytech_token]
                : null,
            'wave_lien' => $this->estWaveManuel() ? $this->lienWave() : null,
            'simule' => (bool) $this->simule,
            'cree_le' => $this->created_at?->toIso8601String(),
            'expire_le' => $this->expire_at?->toIso8601String(),
            'regle_le' => $this->regle_at?->toIso8601String(),
        ];
    }

    private function lienWave(): ?string
    {
        $boutique = $this->resource->relationLoaded('boutique') ? $this->resource->boutique : app(BoutiqueCourante::class)->obtenir();

        return $boutique instanceof Boutique ? Caisse::lienWave($boutique, (int) $this->montant_xof) : null;
    }
}

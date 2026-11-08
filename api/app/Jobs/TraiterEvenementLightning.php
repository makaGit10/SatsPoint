<?php

namespace App\Jobs;

use App\Models\Boutique;
use App\Models\Paiement;
use App\Services\Diffuseur;
use App\Services\MachineEtatPaiement;
use App\Services\PaiementsLightning;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Traite une notification du portefeuille relayée par la passerelle (payment_received / payment_sent).
 *
 * `payment_received` : retrouve la tentative par payment_hash (dans la boutique indiquée), puis REVÉRIFIE
 * par lookup auprès du portefeuille avant toute transition (statut « reglee », même hash, montant suffisant).
 * Idempotent (source « nwc » + empreinte de l'événement). Diffuse « paiements » et « ventes » à la boutique.
 */
class TraiterEvenementLightning implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public int $backoff = 5;

    /**
     * @param  array{type: string, id: string, payment_hash: string, montant_msats: int, regle_le: string, preimage?: string}  $evenement
     */
    public function __construct(public readonly array $evenement)
    {
        $this->onQueue('paiements');
    }

    public function handle(PaiementsLightning $lightning, Diffuseur $diffuseur): void
    {
        $type = (string) ($this->evenement['type'] ?? '');
        $hash = strtolower((string) ($this->evenement['payment_hash'] ?? ''));
        $boutiqueUlid = (string) ($this->evenement['id'] ?? '');

        // Jamais la facture complète ni la préimage dans les logs : 8 premiers caractères du hash seulement.
        $contexte = ['type' => $type, 'boutique' => $boutiqueUlid, 'payment_hash' => substr($hash, 0, 8), 'montant_msats' => $this->evenement['montant_msats'] ?? null];

        Log::info('lightning: événement reçu de la passerelle', $contexte);

        $boutique = Boutique::query()->where('ulid', $boutiqueUlid)->first();

        if ($boutique === null) {
            Log::warning('lightning: boutique inconnue', $contexte);

            return;
        }

        if ($type === 'payment_sent') {
            // Paiement sortant (portefeuille) : l'écran portefeuille se rafraîchit.
            $diffuseur->rubrique($boutique, 'wallet');

            return;
        }

        $paiement = Paiement::pourBoutique($boutique)->where('payment_hash', $hash)->first();

        if ($paiement === null) {
            // Facture créée hors caisse (ex. « Recevoir » du portefeuille) : rien à solder, mais le solde a changé.
            Log::info('lightning: aucune tentative pour ce hash (facture libre ?)', $contexte);
            $diffuseur->rubrique($boutique, 'wallet');

            return;
        }

        $paiement->setRelation('boutique', $boutique);

        $evenementNormalise = [
            'type' => $type,
            'id' => $boutiqueUlid,
            'payment_hash' => $hash,
            'montant_msats' => (int) ($this->evenement['montant_msats'] ?? 0),
            'regle_le' => (string) ($this->evenement['regle_le'] ?? ''),
        ];

        $resultat = $lightning->verifier($paiement, MachineEtatPaiement::SOURCE_NWC, $evenementNormalise);

        Log::info('lightning: événement traité', $contexte + ['effet' => $resultat['effet']]);

        if (in_array($resultat['effet'], ['reussi', 'trop_percu', 'payee_apres_annulation', 'expire'], true)) {
            $diffuseur->rubrique($boutique, 'paiements');
            $diffuseur->rubrique($boutique, 'ventes');
            $diffuseur->rubrique($boutique, 'wallet');
        }
    }
}

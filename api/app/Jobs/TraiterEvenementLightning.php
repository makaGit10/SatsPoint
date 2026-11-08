<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Traite une notification du portefeuille relayée par la passerelle
 * (payment_received / payment_sent). Pour l'instant : journalisation seulement.
 *
 * Étape suivante (module Paiement) : retrouver le paiement par payment_hash,
 * REVÉRIFIER via PasserelleLightning::facture() avant tout marquage « réglé »,
 * enregistrer l'événement idempotent (evenements_paiement) et diffuser la rubrique « paiements ».
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

    public function handle(): void
    {
        // Jamais la facture complète ni la préimage dans les logs : 8 premiers caractères du hash seulement.
        Log::info('lightning: événement reçu de la passerelle', [
            'type' => $this->evenement['type'] ?? null,
            'boutique' => $this->evenement['id'] ?? null,
            'payment_hash' => substr((string) ($this->evenement['payment_hash'] ?? ''), 0, 8),
            'montant_msats' => $this->evenement['montant_msats'] ?? null,
            'regle_le' => $this->evenement['regle_le'] ?? null,
        ]);
    }
}

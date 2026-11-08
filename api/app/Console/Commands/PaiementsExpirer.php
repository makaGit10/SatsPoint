<?php

namespace App\Console\Commands;

use App\Models\Boutique;
use App\Models\Paiement;
use App\Models\Vente;
use App\Services\Diffuseur;
use App\Services\MachineEtatPaiement;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Planifiée chaque minute (CAHIER § 7.2) :
 *  1. tentatives en attente dont `expire_at` est passé → `expire` ;
 *  2. ventes en attente sans tentative en attente depuis 30 min → `expiree`.
 * Chaque boutique touchée reçoit les signaux « paiements » / « ventes ».
 */
class PaiementsExpirer extends Command
{
    protected $signature = 'paiements:expirer';

    protected $description = 'Expire les factures arrivées à échéance et les ventes restées sans tentative';

    public function handle(MachineEtatPaiement $machine, Diffuseur $diffuseur): int
    {
        $boutiquesTouchees = [];
        $paiementsExpires = 0;
        $ventesExpirees = 0;

        $paiements = Paiement::toutesBoutiques()
            ->where('statut', Paiement::STATUT_EN_ATTENTE)
            ->whereNotNull('expire_at')
            ->where('expire_at', '<', now())
            ->orderBy('id')
            ->limit(500)
            ->get();

        foreach ($paiements as $paiement) {
            $resultat = $machine->expirer($paiement);
            if ($resultat['effet'] === 'expire') {
                $paiementsExpires++;
                $boutiquesTouchees[$paiement->boutique_id]['paiements'] = true;
            }
        }

        $limite = now()->subMinutes(Vente::EXPIRATION_SANS_TENTATIVE_MIN);

        $ventes = Vente::toutesBoutiques()
            ->where('ventes.statut', Vente::STATUT_EN_ATTENTE)
            ->where('ventes.created_at', '<', $limite)
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('paiements')
                ->whereColumn('paiements.vente_id', 'ventes.id')
                ->where('paiements.statut', Paiement::STATUT_EN_ATTENTE))
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('paiements')
                ->whereColumn('paiements.vente_id', 'ventes.id')
                ->where('paiements.created_at', '>=', $limite))
            ->orderBy('ventes.id')
            ->limit(500)
            ->get();

        foreach ($ventes as $vente) {
            if ($machine->expirerVente($vente) !== null) {
                $ventesExpirees++;
                $boutiquesTouchees[$vente->boutique_id]['ventes'] = true;
            }
        }

        if ($boutiquesTouchees !== []) {
            $boutiques = Boutique::query()->whereIn('id', array_keys($boutiquesTouchees))->get(['id', 'ulid'])->keyBy('id');
            foreach ($boutiquesTouchees as $id => $rubriques) {
                $boutique = $boutiques->get($id);
                if ($boutique === null) {
                    continue;
                }
                $diffuseur->rubrique($boutique, 'paiements');
                $diffuseur->rubrique($boutique, 'ventes');
            }
        }

        $this->info("Expirés : {$paiementsExpires} paiement(s), {$ventesExpirees} vente(s).");

        return self::SUCCESS;
    }
}

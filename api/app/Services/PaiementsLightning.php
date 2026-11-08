<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Exceptions\PasserelleErreur;
use App\Facades\Audit;
use App\Models\Boutique;
use App\Models\ConnexionWallet;
use App\Models\Paiement;
use App\Models\Vente;
use App\Support\Conversion;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Tentatives Lightning (CAHIER § 6.4) : création de facture via la passerelle, cours figé,
 * vérification par lookup avant tout marquage « réglé », expiration.
 */
class PaiementsLightning
{
    public function __construct(
        private readonly PasserelleLightning $passerelle,
        private readonly CoursChange $cours,
        private readonly MachineEtatPaiement $machine,
    ) {}

    /** Crée la facture et la tentative (appelé dans la transaction de création de la vente / tentative). */
    public function creerTentative(Vente $vente, Boutique $boutique, ConnexionWallet $connexion): Paiement
    {
        $btcXof = $this->cours->exigerBtcXof();
        $sats = Conversion::xofVersSats((int) $vente->montant_xof, $btcXof);

        if ($sats < 1) {
            throw new ErreurMetier('MONTANT_TROP_FAIBLE', 'Le montant est trop faible pour une facture Lightning.');
        }

        $expirationS = (int) $boutique->reglagesComplets()['expiration_facture_min'] * 60;
        $description = sprintf('SatsPoint · %s · %s', mb_substr($boutique->nom, 0, 60), $vente->numeroAffiche());

        try {
            $facture = $this->passerelle->creerFacture($boutique->ulid, Conversion::satsVersMsats($sats), $description, $expirationS);
        } catch (PasserelleErreur $e) {
            Log::warning('lightning: création de facture impossible', ['code' => $e->codeErreur, 'boutique' => $boutique->ulid]);

            throw new ErreurMetier('PORTEFEUILLE_INDISPONIBLE', 'Le portefeuille Lightning ne répond pas. Réessayez ou proposez le mobile money.', 502);
        }

        $bolt11 = (string) ($facture['bolt11'] ?? '');
        $hash = strtolower((string) ($facture['payment_hash'] ?? ''));

        if ($bolt11 === '' || ! preg_match('/^[a-f0-9]{64}$/', $hash)) {
            throw new ErreurMetier('PORTEFEUILLE_INDISPONIBLE', 'Réponse du portefeuille invalide.', 502);
        }

        $expireAt = isset($facture['expire_le']) ? Carbon::parse($facture['expire_le']) : now()->addSeconds($expirationS);

        return Paiement::create([
            'vente_id' => $vente->id,
            'methode' => Paiement::METHODE_LIGHTNING,
            'statut' => Paiement::STATUT_EN_ATTENTE,
            'montant_xof' => $vente->montant_xof,
            'montant_sats' => $sats,
            'cours_xof_par_btc' => $btcXof,
            'bolt11' => $bolt11,
            'payment_hash' => $hash,
            'expire_at' => $expireAt,
            'simule' => $connexion->estSimulee(),
        ]);
    }

    /**
     * Vérifie l'état réel de la facture auprès du portefeuille (lookup_invoice) et applique la transition.
     * Le statut « payé » n'est accepté QUE si : statut `reglee`, même payment_hash, montant ≥ montant enregistré
     * (un montant absent ou nul — Coinos avant règlement — vaut repli sur le montant enregistré).
     *
     * @param  array|null  $evenement  notification de la passerelle à l'origine de la vérification (idempotence « nwc »)
     * @return array{paiement: Paiement, vente: ?Vente, effet: string}
     */
    public function verifier(Paiement $paiement, string $source = MachineEtatPaiement::SOURCE_VERIFICATION, ?array $evenement = null): array
    {
        if (! $paiement->estLightning() || $paiement->payment_hash === null) {
            return ['paiement' => $paiement, 'vente' => null, 'effet' => 'sans_effet'];
        }

        if ($paiement->estReussi()) {
            return ['paiement' => $paiement, 'vente' => null, 'effet' => 'deja_regle'];
        }

        $boutique = $paiement->relationLoaded('boutique') ? $paiement->boutique : Boutique::query()->findOrFail($paiement->boutique_id);

        try {
            $facture = $this->passerelle->facture($boutique->ulid, $paiement->payment_hash);
        } catch (PasserelleErreur $e) {
            if ($e->estDe('FACTURE_INCONNUE') || $e->estDe('CONNEXION_INCONNUE')) {
                Log::warning('lightning: facture inconnue du portefeuille', ['paiement' => $paiement->ulid, 'code' => $e->codeErreur]);

                return ['paiement' => $paiement, 'vente' => null, 'effet' => 'inconnue'];
            }

            throw new ErreurMetier('PORTEFEUILLE_INDISPONIBLE', 'Le portefeuille Lightning ne répond pas ; la vérification reprendra automatiquement.', 502);
        }

        $hashRetour = strtolower((string) ($facture['payment_hash'] ?? ''));

        if (! hash_equals($paiement->payment_hash, $hashRetour)) {
            Log::error('lightning: payment_hash différent au lookup', ['paiement' => $paiement->ulid, 'attendu' => $paiement->hashAbrege(), 'recu' => substr($hashRetour, 0, 8)]);
            Audit::enregistrer('paiement.hash_incoherent', $paiement, ['attendu' => $paiement->hashAbrege(), 'recu' => substr($hashRetour, 0, 8)]);

            return ['paiement' => $paiement, 'vente' => null, 'effet' => 'hash_incoherent'];
        }

        $statut = (string) ($facture['statut'] ?? '');

        if ($statut === 'reglee') {
            $montantMsats = isset($facture['montant_msats']) && is_numeric($facture['montant_msats']) ? (int) $facture['montant_msats'] : 0;
            $attendu = (int) $paiement->montantMsats();

            if ($montantMsats > 0 && $montantMsats < $attendu) {
                // Impossible en théorie (facture à montant fixe) : jamais ignoré, jamais marqué payé non plus.
                Log::critical('lightning: montant réglé inférieur au montant attendu', ['paiement' => $paiement->ulid, 'recu_msats' => $montantMsats, 'attendu_msats' => $attendu]);
                Audit::enregistrer('paiement.montant_insuffisant', $paiement, ['recu_msats' => $montantMsats, 'attendu_msats' => $attendu]);

                return ['paiement' => $paiement, 'vente' => null, 'effet' => 'montant_insuffisant'];
            }

            $payload = $evenement ?? ['payment_hash' => $paiement->payment_hash, 'statut' => 'reglee', 'regle_le' => $facture['regle_le'] ?? null];

            return $this->machine->reussir($paiement, $source, 'payment_received', $payload, [
                'regle_at' => isset($facture['regle_le']) ? Carbon::parse($facture['regle_le']) : now(),
                'preimage' => isset($facture['preimage']) && preg_match('/^[a-f0-9]{64}$/i', (string) $facture['preimage']) ? strtolower((string) $facture['preimage']) : null,
            ]);
        }

        if ($statut === 'expiree' || ($paiement->expire_at !== null && $paiement->expire_at->isPast())) {
            return $this->machine->expirer($paiement);
        }

        return ['paiement' => $paiement, 'vente' => null, 'effet' => 'en_attente'];
    }

    /** Mode démo : règle la facture du portefeuille simulé (la passerelle renverra l'événement payment_received). */
    public function simuler(Paiement $paiement, Boutique $boutique): void
    {
        try {
            $this->passerelle->simulerPaiement($boutique->ulid, (string) $paiement->payment_hash);
        } catch (PasserelleErreur $e) {
            Log::warning('lightning: simulation impossible', ['code' => $e->codeErreur]);

            throw new ErreurMetier('SIMULATION_IMPOSSIBLE', 'La simulation du paiement a échoué.', 502);
        }
    }
}

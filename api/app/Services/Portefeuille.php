<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Exceptions\PasserelleErreur;
use App\Facades\Audit;
use App\Models\Boutique;
use App\Models\ConnexionWallet;
use App\Models\User;
use App\Support\Conversion;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Portefeuille Lightning de la boutique (CAHIER § 6.9) : solde, historique, recevoir, envoyer, connexion.
 * L'URI NWC est chiffrée en base, déchiffrée en mémoire pour la passerelle, jamais renvoyée au navigateur.
 */
class Portefeuille
{
    public const CACHE_SOLDE_S = 15;

    public function __construct(
        private readonly PasserelleLightning $passerelle,
        private readonly CoursChange $cours,
    ) {}

    public function connexion(Boutique $boutique): ?ConnexionWallet
    {
        return $boutique->relationLoaded('connexionWallet') ? $boutique->connexionWallet : $boutique->connexionWallet()->first();
    }

    /** Forme CONTRAT_API § 7 de GET /wallet. */
    public function etat(Boutique $boutique): array
    {
        $connexion = $this->connexion($boutique);

        if ($connexion === null || $connexion->statut === ConnexionWallet::STATUT_REVOQUEE) {
            return ['connecte' => false, 'alias' => null, 'lud16' => null, 'permissions' => [], 'budget_sats' => null, 'verifie_le' => null, 'solde' => null, 'simule' => false];
        }

        // Le solde d'abord : l'appel à la passerelle met à jour le statut (active / erreur) exposé ensuite.
        $solde = $this->solde($boutique, $connexion);

        return [
            'connecte' => $connexion->statut === ConnexionWallet::STATUT_ACTIVE,
            'alias' => $connexion->alias,
            'lud16' => $connexion->lud16,
            'permissions' => array_values((array) $connexion->permissions),
            'budget_sats' => $connexion->budget_sats,
            'verifie_le' => $connexion->verifiee_at?->toIso8601String(),
            'solde' => $solde,
            'simule' => $connexion->estSimulee(),
        ];
    }

    /** Solde via la passerelle (cache 15 s par boutique) converti en FCFA avec le cours courant. */
    public function solde(Boutique $boutique, ConnexionWallet $connexion): ?array
    {
        $cle = 'wallet:solde:'.$boutique->ulid;

        $sats = Cache::get($cle);

        if ($sats === null) {
            try {
                $sats = Conversion::msatsVersSats((int) ($this->passerelle->solde($boutique->ulid)['msats'] ?? 0));
            } catch (PasserelleErreur $e) {
                $this->marquerErreur($connexion, $e);

                return null;
            }

            if ($connexion->statut !== ConnexionWallet::STATUT_ACTIVE) {
                $connexion->forceFill(['statut' => ConnexionWallet::STATUT_ACTIVE])->save();
            }

            Cache::put($cle, $sats, self::CACHE_SOLDE_S);
        }

        $cours = $this->cours->actuel();
        $btcXof = $cours['btc_xof'];

        return [
            'sats' => (int) $sats,
            'xof' => $btcXof === null ? null : Conversion::satsVersXof((int) $sats, $btcXof),
            'cours_xof_par_btc' => $btcXof,
        ];
    }

    public function oublierSolde(Boutique $boutique): void
    {
        Cache::forget('wallet:solde:'.$boutique->ulid);
    }

    /** @return list<array{type: string, statut: string, montant_sats: int, frais_sats: int, description: ?string, regle_le: ?string, cree_le: ?string}> */
    public function transactions(Boutique $boutique, int $limite, int $decalage): array
    {
        try {
            $reponse = $this->passerelle->transactions($boutique->ulid, $limite, $decalage);
        } catch (PasserelleErreur $e) {
            throw $this->erreurPortefeuille($e);
        }

        return array_map(fn (array $t) => [
            'type' => $t['type'] ?? 'entrante',
            'statut' => $t['statut'] ?? 'reglee',
            'montant_sats' => Conversion::msatsVersSats((int) ($t['montant_msats'] ?? 0)),
            'frais_sats' => Conversion::msatsVersSats((int) ($t['frais_msats'] ?? 0)),
            'description' => isset($t['description']) ? mb_substr((string) $t['description'], 0, 200) : null,
            'regle_le' => $t['regle_le'] ?? null,
            'cree_le' => $t['cree_le'] ?? null,
        ], array_values((array) ($reponse['transactions'] ?? [])));
    }

    /** Facture libre (« Recevoir ») : montant en FCFA (converti au cours) ou en sats. */
    public function recevoir(Boutique $boutique, ?int $montantXof, ?int $montantSats, ?string $description): array
    {
        $btcXof = $this->cours->actuel()['btc_xof'];

        if ($montantSats === null) {
            $montantSats = Conversion::xofVersSats((int) $montantXof, $this->cours->exigerBtcXof());
        } elseif ($montantXof === null && $btcXof !== null) {
            $montantXof = Conversion::satsVersXof($montantSats, $btcXof);
        }

        if ($montantSats < 1) {
            throw new ErreurMetier('MONTANT_TROP_FAIBLE', 'Le montant est trop faible pour une facture Lightning.');
        }

        $expirationS = (int) $boutique->reglagesComplets()['expiration_facture_min'] * 60;
        $libelle = filled($description) ? mb_substr((string) $description, 0, 120) : 'SatsPoint · '.mb_substr($boutique->nom, 0, 60);

        try {
            $facture = $this->passerelle->creerFacture($boutique->ulid, Conversion::satsVersMsats($montantSats), $libelle, $expirationS);
        } catch (PasserelleErreur $e) {
            throw $this->erreurPortefeuille($e);
        }

        return [
            'bolt11' => (string) $facture['bolt11'],
            'payment_hash_abrege' => substr((string) ($facture['payment_hash'] ?? ''), 0, 8),
            'montant_sats' => $montantSats,
            'montant_xof' => $montantXof,
            'expire_le' => $facture['expire_le'] ?? now()->addSeconds($expirationS)->toIso8601String(),
        ];
    }

    /** Aperçu avant envoi : BOLT11, adresse Lightning ou LNURL. */
    public function apercuEnvoi(Boutique $boutique, string $destination, ?int $montantSats): array
    {
        try {
            $apercu = $this->passerelle->apercuPaiement($boutique->ulid, $destination, $montantSats === null ? null : Conversion::satsVersMsats($montantSats));
        } catch (PasserelleErreur $e) {
            throw $this->erreurPortefeuille($e);
        }

        $btcXof = $this->cours->actuel()['btc_xof'];
        $sats = Conversion::msatsVersSats((int) ($apercu['montant_msats'] ?? 0));

        return [
            'type' => $apercu['type'] ?? 'bolt11',
            'montant_sats' => $sats,
            'montant_xof' => $btcXof === null ? null : Conversion::satsVersXof($sats, $btcXof),
            'destinataire' => isset($apercu['destinataire']) ? mb_substr((string) $apercu['destinataire'], 0, 190) : null,
            'description' => isset($apercu['description']) ? mb_substr((string) $apercu['description'], 0, 200) : null,
            'min_sats' => isset($apercu['min_msats']) ? Conversion::msatsVersSats((int) $apercu['min_msats']) : null,
            'max_sats' => isset($apercu['max_msats']) ? Conversion::msatsVersSats((int) $apercu['max_msats']) : null,
            'payment_hash_abrege' => isset($apercu['payment_hash']) ? substr((string) $apercu['payment_hash'], 0, 8) : null,
        ];
    }

    /**
     * Envoi (propriétaire seulement, mot de passe revérifié par le contrôleur). Audité avant et après.
     * `DELAI_DEPASSE` ⇒ PAIEMENT_INCERTAIN : le paiement a peut-être été exécuté, l'utilisateur doit vérifier l'historique.
     */
    public function envoyer(Boutique $boutique, User $par, string $destination, ?int $montantSats): array
    {
        $this->exigerPermission($boutique, 'pay_invoice');

        $estBolt11 = (bool) preg_match('/^(lightning:)?ln(bc|tb|bcrt)[0-9a-z]+$/i', $destination);

        if (! $estBolt11 && $montantSats === null) {
            throw new ErreurMetier('MONTANT_REQUIS', 'Indiquez le montant à envoyer pour une adresse Lightning ou une LNURL.');
        }

        $journal = Audit::enregistrer('wallet.envoi_demande', $boutique, ['type' => $estBolt11 ? 'bolt11' : 'destination', 'montant_sats' => $montantSats], $par);

        try {
            $resultat = $estBolt11
                ? $this->passerelle->payerFacture($boutique->ulid, preg_replace('/^lightning:/i', '', $destination))
                : $this->passerelle->payerDestination($boutique->ulid, $destination, Conversion::satsVersMsats((int) $montantSats));
        } catch (PasserelleErreur $e) {
            if ($e->paiementIncertain()) {
                Log::error('wallet: paiement sortant incertain (délai dépassé)', ['boutique' => $boutique->ulid]);
                Audit::enregistrer('wallet.envoi_incertain', $boutique, ['montant_sats' => $montantSats], $par);

                throw new ErreurMetier('PAIEMENT_INCERTAIN', 'Le portefeuille n\'a pas répondu à temps : le paiement a peut-être été effectué. Vérifiez l\'historique avant de réessayer.', 409);
            }

            Audit::enregistrer('wallet.envoi_echec', $boutique, ['code' => $e->codeErreur, 'montant_sats' => $montantSats], $par);

            throw $this->erreurPortefeuille($e);
        }

        $this->oublierSolde($boutique);

        $sats = Conversion::msatsVersSats((int) ($resultat['montant_msats'] ?? 0));
        $frais = Conversion::msatsVersSats((int) ($resultat['frais_msats'] ?? 0));
        $hash = substr((string) ($resultat['payment_hash'] ?? ''), 0, 8);

        Audit::enregistrer('wallet.envoi_reussi', $boutique, ['montant_sats' => $sats, 'frais_sats' => $frais, 'payment_hash_abrege' => $hash, 'demande' => $journal?->id], $par);

        return ['payment_hash_abrege' => $hash, 'montant_sats' => $sats, 'frais_sats' => $frais];
    }

    /** PUT /boutique/wallet : vérifie via la passerelle puis chiffre et mémorise. L'URI n'est jamais renvoyée. */
    public function connecter(Boutique $boutique, User $par, #[\SensitiveParameter] string $uri, ?int $budgetSats): ConnexionWallet
    {
        try {
            $infos = $this->passerelle->enregistrerConnexion($boutique->ulid, $uri, $budgetSats === null ? null : Conversion::satsVersMsats($budgetSats));
        } catch (PasserelleErreur $e) {
            throw $this->erreurPortefeuille($e, 'Connexion du portefeuille impossible : vérifiez l\'URI NWC et que le portefeuille est en ligne.');
        }

        $connexion = $this->connexion($boutique) ?? new ConnexionWallet;
        $connexion->boutique_id = $boutique->id;
        $connexion->fill([
            'uri_chiffree' => $uri,
            'pubkey_wallet' => isset($infos['pubkey']) ? mb_substr((string) $infos['pubkey'], 0, 64) : null,
            'relais' => array_values((array) ($infos['relais'] ?? [])),
            'permissions' => array_values((array) ($infos['methods'] ?? [])),
            'budget_sats' => $budgetSats,
            'statut' => ConnexionWallet::STATUT_ACTIVE,
            'verifiee_at' => now(),
            'alias' => isset($infos['alias']) ? mb_substr((string) $infos['alias'], 0, 120) : null,
            'lud16' => isset($infos['lud16']) ? mb_substr((string) $infos['lud16'], 0, 190) : null,
        ])->save();

        $this->oublierSolde($boutique);

        Audit::enregistrer('wallet.connecte', $boutique, ['simule' => $connexion->estSimulee(), 'permissions' => $connexion->permissions, 'budget_sats' => $budgetSats], $par);

        return $connexion;
    }

    /** DELETE /boutique/wallet : supprime côté passerelle puis le secret côté SatsPoint. */
    public function revoquer(Boutique $boutique, User $par): void
    {
        try {
            $this->passerelle->supprimerConnexion($boutique->ulid);
        } catch (PasserelleErreur $e) {
            // Même injoignable, on supprime le secret : la passerelle se réhydratera sans cette connexion.
            Log::warning('wallet: suppression côté passerelle impossible', ['code' => $e->codeErreur]);
        }

        $this->connexion($boutique)?->delete();
        $this->oublierSolde($boutique);

        Audit::enregistrer('wallet.revoque', $boutique, [], $par);
    }

    // ---------------------------------------------------------------- interne

    private function exigerPermission(Boutique $boutique, string $methode): void
    {
        $connexion = $this->connexion($boutique);

        if ($connexion === null || $connexion->statut !== ConnexionWallet::STATUT_ACTIVE) {
            throw new ErreurMetier('WALLET_NON_CONNECTE', 'Aucun portefeuille Lightning n\'est connecté.', 409);
        }

        $permissions = (array) $connexion->permissions;

        if ($permissions !== [] && ! in_array($methode, $permissions, true)) {
            throw new ErreurMetier('PERMISSION_MANQUANTE', 'Le portefeuille connecté n\'autorise pas l\'envoi depuis SatsPoint (permission pay_invoice absente).', 403);
        }
    }

    private function marquerErreur(ConnexionWallet $connexion, PasserelleErreur $e): void
    {
        Log::warning('wallet: solde indisponible', ['code' => $e->codeErreur]);

        if ($connexion->statut === ConnexionWallet::STATUT_ACTIVE && in_array($e->codeErreur, ['PORTEFEUILLE_INJOIGNABLE', 'CONNEXION_INCONNUE', 'DELAI_DEPASSE'], true)) {
            $connexion->forceFill(['statut' => ConnexionWallet::STATUT_ERREUR])->save();
        }
    }

    private function erreurPortefeuille(PasserelleErreur $e, ?string $messageDefaut = null): ErreurMetier
    {
        return match ($e->codeErreur) {
            'SOLDE_INSUFFISANT' => new ErreurMetier('SOLDE_INSUFFISANT', 'Solde insuffisant dans le portefeuille.', 422),
            'BUDGET_DEPASSE' => new ErreurMetier('BUDGET_DEPASSE', 'Budget de dépense atteint pour cette connexion.', 422),
            'DESTINATION_INVALIDE', 'FACTURE_INVALIDE', 'URI_INVALIDE' => new ErreurMetier('DESTINATION_INVALIDE', 'Destination ou facture invalide.', 422),
            'PERMISSION_MANQUANTE' => new ErreurMetier('PERMISSION_MANQUANTE', 'Le portefeuille refuse cette opération (permission manquante).', 403),
            'PAIEMENT_ECHOUE' => new ErreurMetier('PAIEMENT_ECHOUE', 'Le portefeuille a refusé le paiement.', 422),
            'CONNEXION_INCONNUE' => new ErreurMetier('WALLET_NON_CONNECTE', 'Le portefeuille n\'est plus connecté à la passerelle : reconnectez-le.', 409),
            default => new ErreurMetier('PORTEFEUILLE_INDISPONIBLE', $messageDefaut ?? 'Le portefeuille Lightning ne répond pas.', 502),
        };
    }
}

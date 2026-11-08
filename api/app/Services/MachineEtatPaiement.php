<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Models\Boutique;
use App\Models\EvenementPaiement;
use App\Models\Paiement;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Machine d'état des paiements et des ventes (CAHIER § 7.2, à la lettre).
 *
 *   Vente :    en_attente → payee | annulee | expiree
 *   Paiement : en_attente → reussi | expire | echoue | annule
 *
 * - Chaque transition se fait en transaction SQL avec verrou (SELECT … FOR UPDATE) sur le paiement ET la vente.
 * - Idempotence par `evenements_paiement` (unique source + empreinte du payload) : le même événement reçu
 *   deux fois n'a qu'un seul effet.
 * - Rien n'est jamais ignoré : un règlement réellement reçu est TOUJOURS enregistré, même si le paiement
 *   était expiré/annulé ou si la vente était déjà payée (alerte « trop-perçu ») ou annulée/expirée
 *   (alerte « payée après annulation »).
 * - La machine n'émet pas elle-même de signal temps réel : en HTTP c'est le middleware DiffuserEcritures ;
 *   les jobs et commandes appellent le Diffuseur avec les boutiques retournées.
 */
class MachineEtatPaiement
{
    public const SOURCE_NWC = 'nwc';

    public const SOURCE_PAYTECH_IPN = 'paytech_ipn';

    public const SOURCE_VERIFICATION = 'verification';

    public const SOURCE_MANUEL = 'manuel';

    public function __construct(private readonly BoutiqueCourante $courante) {}

    /**
     * Règlement confirmé par une source de confiance (portefeuille vérifié, IPN authentifiée, confirmation manuelle).
     *
     * @param  array  $payload  données de l'événement (sert d'empreinte d'idempotence)
     * @param  array{regle_at?: \DateTimeInterface|string|null, preimage?: ?string, operateur?: ?string, confirme_par?: ?User}  $details
     * @return array{paiement: Paiement, vente: Vente, effet: string} effet ∈ reussi | deja_regle | deja_traite | trop_percu | payee_apres_annulation
     */
    public function reussir(Paiement $paiement, string $source, string $type, array $payload, array $details = []): array
    {
        return $this->transition($paiement, function (Paiement $paiement, Vente $vente) use ($source, $type, $payload, $details) {
            if (! $this->enregistrerEvenement($paiement, $source, $type, $payload)) {
                return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'deja_traite'];
            }

            if ($paiement->estReussi()) {
                return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'deja_regle'];
            }

            $statutAvant = $paiement->statut;

            $paiement->forceFill([
                'statut' => Paiement::STATUT_REUSSI,
                'regle_at' => $details['regle_at'] ?? now(),
                'preimage' => $details['preimage'] ?? $paiement->preimage,
                'operateur' => $details['operateur'] ?? $paiement->operateur,
                'confirme_par' => isset($details['confirme_par']) ? $details['confirme_par']->id : $paiement->confirme_par,
                'confirme_at' => isset($details['confirme_par']) ? now() : $paiement->confirme_at,
            ])->save();

            $effet = 'reussi';

            if ($vente->estEnAttente()) {
                $this->marquerPayee($vente, $paiement);
            } elseif ($vente->estPayee()) {
                // Double règlement : la vente reste payée, la seconde tentative est bien « reussi », alerte trop-perçu.
                $vente->forceFill(['alerte' => Vente::ALERTE_TROP_PERCU])->save();
                $effet = 'trop_percu';
                Log::warning('paiement: trop-perçu (deux tentatives réglées)', ['vente' => $vente->ulid, 'paiement' => $paiement->ulid]);
                Audit::enregistrer('paiement.trop_percu', $vente, ['paiement' => $paiement->ulid, 'methode' => $paiement->methode, 'montant_xof' => $paiement->montant_xof, 'source' => $source]);
            } else {
                // Annulée ou expirée mais l'argent est arrivé : on ne refuse jamais un paiement réellement reçu.
                $this->marquerPayee($vente, $paiement, Vente::ALERTE_PAYEE_APRES_ANNULATION);
                $effet = 'payee_apres_annulation';
                Log::warning('paiement: règlement reçu après annulation/expiration', ['vente' => $vente->ulid, 'paiement' => $paiement->ulid]);
                Audit::enregistrer('paiement.recu_apres_annulation', $vente, ['paiement' => $paiement->ulid, 'methode' => $paiement->methode, 'montant_xof' => $paiement->montant_xof, 'source' => $source, 'statut_paiement_avant' => $statutAvant]);
            }

            return ['paiement' => $paiement, 'vente' => $vente, 'effet' => $effet];
        });
    }

    /** Facture Lightning arrivée à échéance (ou demande PayTech restée sans réponse). */
    public function expirer(Paiement $paiement, string $source = self::SOURCE_VERIFICATION): array
    {
        return $this->transition($paiement, function (Paiement $paiement, Vente $vente) use ($source) {
            if (! $paiement->estEnAttente()) {
                return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'sans_effet'];
            }

            $this->enregistrerEvenement($paiement, $source, 'expiration', ['paiement' => $paiement->ulid, 'expire_at' => (string) $paiement->expire_at]);
            $paiement->forceFill(['statut' => Paiement::STATUT_EXPIRE])->save();

            return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'expire'];
        });
    }

    /** Refus PayTech (IPN `sale_canceled`) ou échec signalé. */
    public function echouer(Paiement $paiement, string $source, array $payload): array
    {
        return $this->transition($paiement, function (Paiement $paiement, Vente $vente) use ($source, $payload) {
            if (! $this->enregistrerEvenement($paiement, $source, 'echec', $payload)) {
                return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'deja_traite'];
            }

            if (! $paiement->estEnAttente()) {
                return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'sans_effet'];
            }

            $paiement->forceFill(['statut' => Paiement::STATUT_ECHOUE])->save();

            return ['paiement' => $paiement, 'vente' => $vente, 'effet' => 'echoue'];
        });
    }

    /** Annulation par l'utilisateur : seulement une vente en attente ; ses tentatives en attente passent à « annule ». */
    public function annulerVente(Vente $vente, User $par): Vente
    {
        return $this->courante->pour($this->boutiqueDe($vente), function () use ($vente, $par) {
            return DB::transaction(function () use ($vente, $par) {
                $vente = Vente::query()->whereKey($vente->id)->lockForUpdate()->firstOrFail();

                if (! $vente->estEnAttente()) {
                    throw new ErreurMetier('VENTE_NON_ANNULABLE', 'Seule une vente en attente peut être annulée.', 409);
                }

                $this->annulerTentativesEnAttente($vente);
                $vente->forceFill(['statut' => Vente::STATUT_ANNULEE])->save();

                Audit::enregistrer('vente.annulee', $vente, ['numero' => $vente->numeroAffiche(), 'montant_xof' => $vente->montant_xof], $par);

                return $vente;
            });
        });
    }

    /** Expiration planifiée : vente en attente sans tentative en attente depuis 30 min. */
    public function expirerVente(Vente $vente): ?Vente
    {
        return $this->courante->pour($this->boutiqueDe($vente), function () use ($vente) {
            return DB::transaction(function () use ($vente) {
                $vente = Vente::query()->whereKey($vente->id)->lockForUpdate()->first();

                if ($vente === null || ! $vente->estEnAttente()) {
                    return null;
                }

                if (Paiement::query()->where('vente_id', $vente->id)->where('statut', Paiement::STATUT_EN_ATTENTE)->exists()) {
                    return null;
                }

                $vente->forceFill(['statut' => Vente::STATUT_EXPIREE])->save();

                return $vente;
            });
        });
    }

    /** Nouvelle tentative : les tentatives en attente de la vente passent à « annule » (dans la transaction appelante). */
    public function annulerTentativesEnAttente(Vente $vente, ?int $saufPaiementId = null): int
    {
        return Paiement::query()
            ->where('vente_id', $vente->id)
            ->where('statut', Paiement::STATUT_EN_ATTENTE)
            ->when($saufPaiementId !== null, fn ($q) => $q->where('id', '!=', $saufPaiementId))
            ->update(['statut' => Paiement::STATUT_ANNULE, 'updated_at' => now()]);
    }

    // ---------------------------------------------------------------- interne

    /**
     * Exécute $corps avec la boutique du paiement comme boutique courante, dans une transaction,
     * après avoir verrouillé le paiement puis la vente (toujours dans cet ordre : pas d'interblocage).
     */
    private function transition(Paiement $paiement, \Closure $corps): array
    {
        return $this->courante->pour($this->boutiqueDe($paiement), function () use ($paiement, $corps) {
            return DB::transaction(function () use ($paiement, $corps) {
                $paiementVerrouille = Paiement::query()->whereKey($paiement->id)->lockForUpdate()->firstOrFail();
                $vente = Vente::query()->whereKey($paiementVerrouille->vente_id)->lockForUpdate()->firstOrFail();

                $resultat = $corps($paiementVerrouille, $vente);

                // L'instance reçue reflète le nouvel état pour l'appelant.
                $paiement->setRawAttributes($paiementVerrouille->getAttributes(), true);

                return $resultat;
            });
        });
    }

    private function marquerPayee(Vente $vente, Paiement $paiement, ?string $alerte = null): void
    {
        $this->annulerTentativesEnAttente($vente, $paiement->id);

        $vente->forceFill([
            'statut' => Vente::STATUT_PAYEE,
            'payee_at' => $paiement->regle_at ?? now(),
            'paiement_reussi_id' => $paiement->id,
            'recu_jeton' => $vente->recu_jeton ?? Vente::genererJetonRecu(),
            'alerte' => $alerte ?? $vente->alerte,
        ])->save();
    }

    /** Trace d'idempotence : false si cet événement (source + empreinte) a déjà été traité. */
    private function enregistrerEvenement(Paiement $paiement, string $source, string $type, array $payload): bool
    {
        $empreinte = self::empreinte($payload);

        if (EvenementPaiement::query()->where('source', $source)->where('empreinte_payload', $empreinte)->exists()) {
            return false;
        }

        try {
            EvenementPaiement::create([
                'paiement_id' => $paiement->id,
                'source' => $source,
                'type' => mb_substr($type, 0, 40),
                'empreinte_payload' => $empreinte,
                'recu_at' => now(),
            ]);
        } catch (QueryException $e) {
            // Contrainte unique : course entre deux traitements du même événement → déjà traité.
            if ($this->estViolationUnique($e)) {
                return false;
            }
            throw $e;
        }

        return true;
    }

    /** Empreinte stable d'un payload (clés triées récursivement). */
    public static function empreinte(array $payload): string
    {
        $normaliser = function (array $donnees) use (&$normaliser): array {
            ksort($donnees);
            foreach ($donnees as $cle => $valeur) {
                if (is_array($valeur)) {
                    $donnees[$cle] = $normaliser($valeur);
                }
            }

            return $donnees;
        };

        return hash('sha256', (string) json_encode($normaliser($payload), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    }

    private function estViolationUnique(QueryException $e): bool
    {
        return (string) $e->getCode() === '23505' || str_contains($e->getMessage(), 'unique');
    }

    private function boutiqueDe(Paiement|Vente $modele): Boutique
    {
        return $modele->relationLoaded('boutique') && $modele->boutique !== null
            ? $modele->boutique
            : Boutique::query()->findOrFail($modele->boutique_id);
    }
}

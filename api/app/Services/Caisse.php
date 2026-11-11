<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Models\Article;
use App\Models\Boutique;
use App\Models\ConnexionWallet;
use App\Models\LigneVente;
use App\Models\MoyenPaiement;
use App\Models\MoyenPaiementBoutique;
use App\Models\Paiement;
use App\Models\SequenceVente;
use App\Models\User;
use App\Models\Vente;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Caisse : création d'une vente (numérotée par boutique) et de ses tentatives de paiement.
 * Toute vente naît avec une première tentative (CAHIER § 11 : POST /ventes « crée la vente + 1re tentative »).
 */
class Caisse
{
    public function __construct(
        private readonly PaiementsLightning $lightning,
        private readonly PaytechService $paytech,
        private readonly MachineEtatPaiement $machine,
    ) {}

    /**
     * @param  array{montant_xof: int, note?: ?string, lignes?: list<array{article_ulid?: ?string, libelle: string, quantite: int, prix_unitaire_xof: int}>, methode: string, operateur?: ?string, moyen?: ?string}  $donnees
     */
    public function creerVente(Boutique $boutique, User $caissier, array $donnees): Vente
    {
        $moyenPays = $this->verifierMoyenActif($boutique, $donnees['methode'], $donnees['moyen'] ?? null);

        // Résolution des articles AVANT la transaction (scope boutique : un ulid étranger est simplement introuvable).
        $lignes = $this->preparerLignes($donnees['lignes'] ?? []);

        return DB::transaction(function () use ($boutique, $caissier, $donnees, $lignes, $moyenPays) {
            $vente = new Vente([
                'numero' => SequenceVente::suivant($boutique->id),
                'caissier_id' => $caissier->id,
                'montant_xof' => (int) $donnees['montant_xof'],
                'note' => $donnees['note'] ?? null,
                'statut' => Vente::STATUT_EN_ATTENTE,
            ]);
            $vente->boutique_id = $boutique->id;
            $vente->save();

            foreach ($lignes as $ligne) {
                LigneVente::create($ligne + ['vente_id' => $vente->id]);
            }

            $this->creerTentative($boutique, $vente, $donnees['methode'], $donnees['operateur'] ?? null, $moyenPays);

            return $vente;
        });
    }

    /** Nouvelle tentative sur une vente en attente : les tentatives en attente passent à « annule ». */
    public function nouvelleTentative(Boutique $boutique, Vente $vente, string $methode, ?string $operateur, ?string $moyen = null): Paiement
    {
        $moyenPays = $this->verifierMoyenActif($boutique, $methode, $moyen);

        return DB::transaction(function () use ($boutique, $vente, $methode, $operateur, $moyenPays) {
            $vente = Vente::query()->whereKey($vente->id)->lockForUpdate()->firstOrFail();

            if (! $vente->estEnAttente()) {
                throw new ErreurMetier('VENTE_CLOSE', 'Cette vente n\'est plus en attente de paiement.', 409);
            }

            $this->machine->annulerTentativesEnAttente($vente);

            return $this->creerTentative($boutique, $vente, $methode, $operateur, $moyenPays);
        });
    }

    // ---------------------------------------------------------------- interne

    /** @param  array{0: MoyenPaiement, 1: string}|null  $moyenPays  moyen du catalogue et valeur de la boutique (moyen_pays) */
    private function creerTentative(Boutique $boutique, Vente $vente, string $methode, ?string $operateur, ?array $moyenPays = null): Paiement
    {
        return match ($methode) {
            Paiement::METHODE_LIGHTNING => $this->lightning->creerTentative($vente, $boutique, $this->connexionWallet($boutique)),
            Paiement::METHODE_PAYTECH => $this->tentativePaytech($boutique, $vente, $operateur),
            Paiement::METHODE_WAVE_MANUEL => $this->tentativeWaveManuel($boutique, $vente),
            Paiement::METHODE_MOYEN_PAYS => $moyenPays !== null
                ? $this->tentativeMoyenPays($vente, $moyenPays[0], $moyenPays[1])
                : throw new ErreurMetier('MOYEN_INACTIF', 'Ce moyen de paiement n\'est pas activé pour la boutique.', 409),
            default => throw new ErreurMetier('METHODE_INCONNUE', 'Moyen de paiement inconnu.'),
        };
    }

    private function tentativePaytech(Boutique $boutique, Vente $vente, ?string $operateur): Paiement
    {
        $paiement = new Paiement([
            'vente_id' => $vente->id,
            'methode' => Paiement::METHODE_PAYTECH,
            'statut' => Paiement::STATUT_EN_ATTENTE,
            'montant_xof' => $vente->montant_xof,
            'operateur' => $operateur,
            // Une demande PayTech sans réponse après 30 min est considérée expirée (la vente peut alors expirer).
            'expire_at' => now()->addMinutes(Vente::EXPIRATION_SANS_TENTATIVE_MIN),
        ]);
        $paiement->boutique_id = $boutique->id;
        $paiement->ulid = (string) Str::ulid();

        $demande = $this->paytech->demanderPaiement($boutique, $paiement, $vente->numeroAffiche(), $operateur);

        $paiement->fill([
            'paytech_token' => $demande['token'],
            'paytech_ref' => $paiement->ulid,
            'paytech_redirect_url' => $demande['redirect_url'],
            'simule' => $demande['simule'],
        ])->save();

        return $paiement;
    }

    private function tentativeWaveManuel(Boutique $boutique, Vente $vente): Paiement
    {
        $lien = $boutique->reglagesComplets()['wave_lien'];

        if (blank($lien)) {
            throw new ErreurMetier('WAVE_NON_CONFIGURE', 'Aucun lien Wave n\'est configuré pour la boutique.', 409);
        }

        // Pas d'expiration automatique : seule une confirmation manuelle (ou une annulation) clôt la tentative.
        return Paiement::create([
            'vente_id' => $vente->id,
            'methode' => Paiement::METHODE_WAVE_MANUEL,
            'statut' => Paiement::STATUT_EN_ATTENTE,
            'montant_xof' => $vente->montant_xof,
            'operateur' => 'wave',
            'expire_at' => null,
            'simule' => false,
        ]);
    }

    /**
     * Moyen du pays (CONTRAT_API § 14.4) : comme le Wave direct, aucune confirmation automatique ni expiration ;
     * photographie du moyen (nom, type, couleur, numéro / lien, instructions) prise maintenant.
     */
    private function tentativeMoyenPays(Vente $vente, MoyenPaiement $moyen, string $valeur): Paiement
    {
        return Paiement::create([
            'vente_id' => $vente->id,
            'methode' => Paiement::METHODE_MOYEN_PAYS,
            'statut' => Paiement::STATUT_EN_ATTENTE,
            'montant_xof' => $vente->montant_xof,
            'operateur' => null,
            'moyen_paiement_id' => $moyen->id,
            'moyen' => $moyen->photographie($valeur),
            'expire_at' => null,
            'simule' => false,
        ]);
    }

    /** Lien Wave de la boutique avec le montant (`?amount=`), pour une tentative wave_manuel. */
    public static function lienWave(Boutique $boutique, int $montantXof): ?string
    {
        $lien = $boutique->reglagesComplets()['wave_lien'];

        if (blank($lien)) {
            return null;
        }

        return $lien.(str_contains($lien, '?') ? '&' : '?').'amount='.$montantXof;
    }

    private function connexionWallet(Boutique $boutique): ConnexionWallet
    {
        $connexion = $boutique->relationLoaded('connexionWallet') ? $boutique->connexionWallet : $boutique->connexionWallet()->first();

        if ($connexion === null || $connexion->statut !== ConnexionWallet::STATUT_ACTIVE) {
            throw new ErreurMetier('WALLET_NON_CONNECTE', 'Aucun portefeuille Lightning n\'est connecté à la boutique.', 409);
        }

        return $connexion;
    }

    /**
     * Vérifie que le moyen est activé. Pour `moyen_pays`, le moyen doit être actif au catalogue, du pays de la boutique
     * et activé par elle avec une valeur ; sinon 409 MOYEN_INACTIF (identique pour un moyen inconnu ou d'un autre pays).
     *
     * @return array{0: MoyenPaiement, 1: string}|null
     */
    private function verifierMoyenActif(Boutique $boutique, string $methode, ?string $moyenUlid = null): ?array
    {
        $inactif = fn () => new ErreurMetier('MOYEN_INACTIF', 'Ce moyen de paiement n\'est pas activé pour la boutique.', 409);

        if ($methode === Paiement::METHODE_MOYEN_PAYS) {
            $moyen = $moyenUlid === null ? null : MoyenPaiement::query()
                ->where('ulid', $moyenUlid)
                ->where('actif', true)
                ->where('pays', $boutique->pays ?? 'SN')
                ->first();

            $config = $moyen === null ? null : MoyenPaiementBoutique::pourBoutique($boutique)
                ->where('moyen_paiement_id', $moyen->id)
                ->where('active', true)
                ->first(['id', 'valeur']);

            if ($moyen === null || $config === null || blank($config->valeur)) {
                throw $inactif();
            }

            return [$moyen, (string) $config->valeur];
        }

        $moyens = $boutique->reglagesComplets()['moyens'];

        if (empty($moyens[$methode])) {
            throw $inactif();
        }

        return null;
    }

    /** @return list<array{article_id: ?int, libelle: string, quantite: int, prix_unitaire_xof: int}> */
    private function preparerLignes(array $lignes): array
    {
        if ($lignes === []) {
            return [];
        }

        $ulids = array_values(array_filter(array_map(fn ($l) => $l['article_ulid'] ?? null, $lignes)));
        $articles = $ulids === [] ? collect() : Article::query()->whereIn('ulid', $ulids)->get(['id', 'ulid'])->keyBy('ulid');

        $resultat = [];

        foreach ($lignes as $ligne) {
            $articleId = null;

            if (! empty($ligne['article_ulid'])) {
                $article = $articles->get($ligne['article_ulid']);
                if ($article === null) {
                    throw new ErreurMetier('ARTICLE_INTROUVABLE', 'Un article de la vente est introuvable.', 422);
                }
                $articleId = $article->id;
            }

            $resultat[] = [
                'article_id' => $articleId,
                'libelle' => mb_substr(trim((string) $ligne['libelle']), 0, 120),
                'quantite' => (int) $ligne['quantite'],
                'prix_unitaire_xof' => (int) $ligne['prix_unitaire_xof'],
            ];
        }

        return $resultat;
    }
}

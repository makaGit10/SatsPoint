<?php

namespace App\Services;

use App\Exceptions\PasserelleErreur;
use App\Exceptions\PasserelleInjoignable;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Psr\Http\Message\RequestInterface;

/**
 * Client de la passerelle Lightning (docs/CONTRAT_PASSERELLE.md § 2).
 * Chaque requête est signée HMAC (horodatage + nonce), délai 15 s, erreurs typées.
 */
class PasserelleLightning
{
    public function __construct(
        private readonly string $urlBase,
        private readonly SignatureHmac $signature,
        private readonly int $delaiSecondes = 15,
    ) {}

    // ------------------------------------------------------------------ santé

    /** @return array{ok: bool, connexions: int, mock: bool, uptime_s: int} */
    public function sante(): array
    {
        return $this->decoder(fn () => $this->http(signer: false)->get('/sante'));
    }

    public function joignable(): bool
    {
        try {
            return (bool) ($this->http(signer: false, delai: 2)->get('/sante')->json('ok') ?? false);
        } catch (\Throwable) {
            return false;
        }
    }

    // ------------------------------------------------------------- connexions

    /**
     * $id = ulid de la BOUTIQUE COURANTE uniquement : la passerelle ne vérifie pas la propriété,
     * l'API ne lui transmet jamais un identifiant venu du client.
     * $budgetMsats : plafond cumulé des paiements sortants côté passerelle (contrat § 5), optionnel.
     */
    public function enregistrerConnexion(string $id, #[\SensitiveParameter] string $uri, ?int $budgetMsats = null): array
    {
        $corps = ['uri' => $uri];
        if ($budgetMsats !== null) {
            $corps['budget_msats'] = $budgetMsats;
        }

        return $this->decoder(fn () => $this->http()->put("/connexions/{$id}", $corps));
    }

    /** $verifier = false → réponse immédiate depuis la mémoire de la passerelle (sans get_info). */
    public function connexion(string $id, bool $verifier = true): array
    {
        $query = $verifier ? [] : ['verifier' => 'false'];

        return $this->decoder(fn () => $this->http()->get("/connexions/{$id}", $query));
    }

    /** Idempotent côté passerelle (204 même si l'identifiant est inconnu). */
    public function supprimerConnexion(string $id): void
    {
        $this->decoder(fn () => $this->http()->delete("/connexions/{$id}"), vide: true);
    }

    // --------------------------------------------------------------- factures

    public function creerFacture(string $id, int $montantMsats, string $description, int $expirationSecondes): array
    {
        return $this->decoder(fn () => $this->http()->post("/connexions/{$id}/factures", [
            'montant_msats' => $montantMsats,
            'description' => $description,
            'expiration_s' => $expirationSecondes,
        ]));
    }

    public function facture(string $id, string $paymentHash): array
    {
        return $this->decoder(fn () => $this->http()->get("/connexions/{$id}/factures/{$paymentHash}"));
    }

    // ---------------------------------------------------------- portefeuille

    /** @return array{msats: int} */
    public function solde(string $id): array
    {
        return $this->decoder(fn () => $this->http()->get("/connexions/{$id}/solde"));
    }

    public function transactions(string $id, int $limite = 20, int $decalage = 0, ?string $type = null): array
    {
        $query = array_filter(['limite' => $limite, 'decalage' => $decalage, 'type' => $type], fn ($v) => $v !== null);

        return $this->decoder(fn () => $this->http()->get("/connexions/{$id}/transactions", $query));
    }

    public function apercuPaiement(string $id, string $destination, ?int $montantMsats = null): array
    {
        $corps = array_filter(['destination' => $destination, 'montant_msats' => $montantMsats], fn ($v) => $v !== null);

        return $this->decoder(fn () => $this->http()->post("/connexions/{$id}/paiements/apercu", $corps));
    }

    /**
     * ATTENTION : une PasserelleErreur DELAI_DEPASSE sur un paiement sortant = paiement INCERTAIN :
     * vérifier via transactions() avant toute nouvelle tentative. Un portefeuille NWC ne paie
     * que des factures mainnet (lnbc) ; le montant réglé se compare toujours à celui enregistré en base.
     */
    public function payerFacture(string $id, string $bolt11): array
    {
        return $this->decoder(fn () => $this->http()->post("/connexions/{$id}/paiements", ['bolt11' => $bolt11]));
    }

    public function payerDestination(string $id, string $destination, int $montantMsats): array
    {
        return $this->decoder(fn () => $this->http()->post("/connexions/{$id}/paiements", [
            'destination' => $destination,
            'montant_msats' => $montantMsats,
        ]));
    }

    /** Mode démo uniquement : règle une facture du portefeuille simulé. */
    public function simulerPaiement(string $id, string $paymentHash): array
    {
        return $this->decoder(fn () => $this->http()->post("/mock/{$id}/payer/{$paymentHash}"));
    }

    // ------------------------------------------------------------- interne

    private function http(bool $signer = true, ?int $delai = null): PendingRequest
    {
        $requete = Http::baseUrl($this->urlBase)
            ->acceptJson()
            ->asJson()
            ->timeout($delai ?? $this->delaiSecondes)
            ->connectTimeout(min(5, $delai ?? $this->delaiSecondes));

        if ($signer) {
            $requete = $requete->withRequestMiddleware(function (RequestInterface $psr) {
                $uri = $psr->getUri();
                $chemin = $uri->getPath().($uri->getQuery() !== '' ? '?'.$uri->getQuery() : '');
                $corps = (string) $psr->getBody();

                foreach ($this->signature->enTetes($psr->getMethod(), $chemin, $corps) as $nom => $valeur) {
                    $psr = $psr->withHeader($nom, $valeur);
                }

                return $psr;
            });
        }

        return $requete;
    }

    /** Exécute l'appel, convertit les erreurs réseau et les erreurs du contrat en exceptions typées. */
    private function decoder(\Closure $appel, bool $vide = false): array
    {
        try {
            /** @var Response $reponse */
            $reponse = $appel();
        } catch (ConnectionException $e) {
            throw new PasserelleInjoignable('Passerelle Lightning injoignable : '.mb_substr($e->getMessage(), 0, 120));
        }

        if ($reponse->failed()) {
            $erreur = $reponse->json('erreur');
            $code = is_array($erreur) && isset($erreur['code']) ? (string) $erreur['code'] : 'INTERNE';
            $message = is_array($erreur) && isset($erreur['message']) ? (string) $erreur['message'] : 'Erreur de la passerelle ('.$reponse->status().').';

            throw new PasserelleErreur($code, $message, $reponse->status());
        }

        if ($vide || $reponse->status() === 204) {
            return [];
        }

        $json = $reponse->json();

        if (! is_array($json)) {
            throw new PasserelleInjoignable('Réponse de la passerelle illisible.');
        }

        return $json;
    }
}

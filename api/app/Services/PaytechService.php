<?php

namespace App\Services;

use App\Exceptions\ErreurMetier;
use App\Models\Boutique;
use App\Models\ComptePaytech;
use App\Models\Paiement;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * PayTech par boutique (CAHIER § 6.5) : chaque commerçant utilise SES clés (chiffrées en base, déchiffrées
 * en mémoire au moment de l'appel). SatsPoint n'est jamais intermédiaire financier.
 *
 * Sans compte PayTech configuré : mode simulé (lien /paiement-simule/{ulid}, réglé par POST /paiements/{ulid}/simuler).
 */
class PaytechService
{
    public const URL_DEMANDE = 'https://paytech.sn/api/payment/request-payment';

    /** Libellés `target_payment` attendus par PayTech. */
    private const CIBLES = ['wave' => 'Wave', 'orange_money' => 'Orange Money', 'free_money' => 'Free Money'];

    private const DELAI_S = 15;

    /** Compte actif de la boutique, ou null (→ mode simulé). */
    public function compte(Boutique $boutique): ?ComptePaytech
    {
        $compte = $boutique->relationLoaded('comptePaytech') ? $boutique->comptePaytech : $boutique->comptePaytech()->first();

        return ($compte !== null && $compte->statut === ComptePaytech::STATUT_ACTIF) ? $compte : null;
    }

    /**
     * Demande de paiement pour une tentative. Retourne { token, redirect_url, simule }.
     *
     * @return array{token: string, redirect_url: string, simule: bool}
     */
    public function demanderPaiement(Boutique $boutique, Paiement $paiement, string $numeroVente, ?string $operateur): array
    {
        $compte = $this->compte($boutique);

        if ($compte === null) {
            return [
                'token' => 'simule-'.strtolower($paiement->ulid),
                'redirect_url' => config('app.url').'/paiement-simule/'.$paiement->ulid,
                'simule' => true,
            ];
        }

        $reponse = $this->appeler($compte, $this->corpsDemande($boutique, $paiement, $numeroVente, $operateur, $compte));

        return [
            'token' => (string) $reponse['token'],
            'redirect_url' => (string) ($reponse['redirect_url'] ?? $reponse['redirectUrl']),
            'simule' => false,
        ];
    }

    /**
     * Test de configuration (POST /boutique/paytech/verifier) : une demande de 100 FCFA en mode test doit
     * renvoyer success=1 + redirect_url. Aucune IPN n'en résultera (référence de test).
     *
     * @return array{ok: bool, message: string}
     */
    public function verifierCompte(Boutique $boutique, ComptePaytech $compte): array
    {
        $reference = 'TEST-'.strtoupper(bin2hex(random_bytes(8)));

        try {
            $this->appeler($compte, [
                'item_name' => 'Test de configuration SatsPoint',
                'item_price' => 100,
                'currency' => 'XOF',
                'ref_command' => $reference,
                'command_name' => 'Test SatsPoint · '.mb_substr($boutique->nom, 0, 60),
                'env' => $compte->estEnTest() ? 'test' : 'prod',
                'custom_field' => json_encode(['test' => true, 'boutique' => $boutique->ulid]),
            ] + $this->urls($boutique, config('satspoint.frontend_url').'/reglages/paytech?resultat=succes', config('satspoint.frontend_url').'/reglages/paytech?resultat=annule'));
        } catch (ErreurMetier $e) {
            return ['ok' => false, 'message' => $e->getMessage()];
        }

        $message = 'PayTech répond : la demande de paiement de test a été acceptée.';
        if (! $this->ipnJoignable()) {
            $message .= ' Attention : l\'adresse publique de SatsPoint n\'est pas en HTTPS, PayTech ne pourra pas confirmer les paiements (IPN) tant qu\'elle ne le sera pas.';
        }

        return ['ok' => true, 'message' => $message];
    }

    /**
     * PayTech exige une `ipn_url` en HTTPS (sinon : « ipn_url doit etre en https » / « IPN URL manquant »).
     * En local, exposer l'API par un tunnel et renseigner PAYTECH_IPN_BASE_URL (voir api/README.md).
     */
    public function ipnJoignable(): bool
    {
        return str_starts_with($this->ipnBase(), 'https://');
    }

    private function ipnBase(): string
    {
        $base = (string) (config('satspoint.paytech.ipn_base_url') ?: config('app.url'));

        return rtrim($base, '/');
    }

    private function urls(Boutique $boutique, string $succes, string $annulation): array
    {
        if (! $this->ipnJoignable()) {
            Log::warning('paytech: la base de l\'IPN n\'est pas en HTTPS, PayTech refusera la demande', ['boutique' => $boutique->ulid]);
        }

        return ['ipn_url' => $this->ipnUrl($boutique), 'success_url' => $succes, 'cancel_url' => $annulation];
    }

    /**
     * Authenticité d'une IPN : HMAC-SHA256(`{final_item_price}|{ref_command}|{api_key}`, api_secret) en priorité,
     * repli sur les empreintes SHA-256 de la clé et du secret (anciennes versions de l'API). Comparaisons à temps constant.
     */
    public function ipnAuthentique(array $payload, ComptePaytech $compte): bool
    {
        $cle = (string) $compte->api_key_chiffree;
        $secret = (string) $compte->api_secret_chiffree;

        if ($cle === '' || $secret === '') {
            return false;
        }

        $hmacRecu = strtolower(trim((string) ($payload['hmac_compute'] ?? '')));

        if ($hmacRecu !== '') {
            $montant = (string) ($payload['final_item_price'] ?? $payload['item_price'] ?? '');
            $reference = (string) ($payload['ref_command'] ?? '');
            $attendu = hash_hmac('sha256', $montant.'|'.$reference.'|'.$cle, $secret);

            if (hash_equals($attendu, $hmacRecu)) {
                return true;
            }
        }

        $cleRecue = strtolower(trim((string) ($payload['api_key_sha256'] ?? '')));
        $secretRecu = strtolower(trim((string) ($payload['api_secret_sha256'] ?? '')));

        if ($cleRecue === '' || $secretRecu === '') {
            return false;
        }

        return hash_equals(hash('sha256', $cle), $cleRecue) && hash_equals(hash('sha256', $secret), $secretRecu);
    }

    /** Opérateur normalisé depuis `payment_method` de l'IPN (« Wave », « Orange Money », « Free Money »…). */
    public static function operateurDepuis(?string $methodePaytech): ?string
    {
        $m = mb_strtolower((string) $methodePaytech);

        return match (true) {
            str_contains($m, 'wave') => 'wave',
            str_contains($m, 'orange') => 'orange_money',
            str_contains($m, 'free') => 'free_money',
            default => null,
        };
    }

    public function ipnUrl(Boutique $boutique): string
    {
        return $this->ipnBase().'/webhooks/paytech/'.$boutique->ulid;
    }

    // ---------------------------------------------------------------- interne

    private function corpsDemande(Boutique $boutique, Paiement $paiement, string $numeroVente, ?string $operateur, ComptePaytech $compte): array
    {
        $front = config('satspoint.frontend_url');

        $corps = [
            'item_name' => sprintf('Vente %s · %s', $numeroVente, mb_substr($boutique->nom, 0, 60)),
            'item_price' => (int) $paiement->montant_xof,
            'currency' => 'XOF',
            'ref_command' => $paiement->ulid,
            'command_name' => sprintf('SatsPoint · %s · %s', mb_substr($boutique->nom, 0, 60), $numeroVente),
            'env' => $compte->estEnTest() ? 'test' : 'prod',
            'custom_field' => json_encode(['paiement' => $paiement->ulid, 'boutique' => $boutique->ulid]),
        ] + $this->urls($boutique, $front.'/paiement/'.$paiement->ulid.'/retour?resultat=succes', $front.'/paiement/'.$paiement->ulid.'/retour?resultat=annule');

        if ($operateur !== null && isset(self::CIBLES[$operateur])) {
            $corps['target_payment'] = self::CIBLES[$operateur];
        }

        return $corps;
    }

    /** Appel signé par les en-têtes API_KEY / API_SECRET (déchiffrés en mémoire, jamais journalisés). */
    private function appeler(ComptePaytech $compte, array $corps): array
    {
        try {
            $reponse = Http::timeout(self::DELAI_S)->connectTimeout(5)->acceptJson()->asJson()
                ->withHeaders([
                    'API_KEY' => (string) $compte->api_key_chiffree,
                    'API_SECRET' => (string) $compte->api_secret_chiffree,
                ])
                ->post(self::URL_DEMANDE, $corps);
        } catch (ConnectionException $e) {
            Log::warning('paytech: injoignable', ['erreur' => $e::class]);

            throw new ErreurMetier('PAYTECH_INDISPONIBLE', 'PayTech ne répond pas. Réessayez dans un instant.', 502);
        }

        $json = $reponse->json();

        if (! $reponse->successful() || ! is_array($json) || (int) ($json['success'] ?? 0) !== 1 || empty($json['token'])) {
            // Détail PayTech (sans secret) : utile au commerçant pour corriger sa configuration, tronqué et journalisé.
            $detail = is_array($json) ? trim(implode(' — ', array_filter([
                is_string($json['message'] ?? null) ? $json['message'] : null,
                is_array($json['error'] ?? null) ? implode(' ; ', array_map('strval', array_slice($json['error'], 0, 3))) : (is_string($json['error'] ?? null) ? $json['error'] : null),
            ]))) : '';
            $detail = mb_substr(preg_replace('/\s+/', ' ', $detail), 0, 200);

            Log::warning('paytech: demande refusée', ['statut' => $reponse->status(), 'succes' => $json['success'] ?? null, 'detail' => $detail]);

            $message = match (true) {
                $reponse->status() === 401 || $reponse->status() === 403 => 'Clés PayTech refusées : vérifiez la clé et le secret.',
                default => 'PayTech a refusé la demande de paiement.'.($detail !== '' ? ' ('.$detail.')' : ''),
            };

            throw new ErreurMetier('PAYTECH_REFUS', $message, 502);
        }

        return $json;
    }
}

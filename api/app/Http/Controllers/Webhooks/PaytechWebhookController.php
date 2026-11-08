<?php

namespace App\Http\Controllers\Webhooks;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Models\Boutique;
use App\Models\Paiement;
use App\Services\BoutiqueCourante;
use App\Services\MachineEtatPaiement;
use App\Services\PaytechService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * IPN PayTech — POST /webhooks/paytech/{boutique_ulid} (CAHIER § 6.5 et § 13.1, CONTRAT_API § 11).
 *
 * - Public, sans CSRF, 60/min par boutique ; répond TOUJOURS 200 (une IPN invalide est ignorée et journalisée,
 *   sans rien révéler à l'émetteur).
 * - La boutique et le compte sont résolus depuis le PAIEMENT en base (ref_command = ulid), jamais depuis le payload ;
 *   l'ulid de l'URL doit correspondre.
 * - Authenticité : HMAC (ou empreintes SHA-256), puis montant, devise et référence ; idempotent (evenements_paiement).
 * - La boutique devient la boutique courante de la requête : le middleware DiffuserEcritures émet « paiements » / « ventes ».
 */
class PaytechWebhookController extends Controller
{
    public function __construct(
        private readonly PaytechService $paytech,
        private readonly MachineEtatPaiement $machine,
        private readonly BoutiqueCourante $courante,
    ) {}

    public function __invoke(Request $request, string $boutique_ulid): JsonResponse
    {
        $payload = $request->all();
        $reference = (string) ($payload['ref_command'] ?? '');
        $contexte = ['boutique' => $boutique_ulid, 'ref' => substr($reference, 0, 26), 'evenement' => (string) ($payload['type_event'] ?? '')];

        try {
            $this->traiter($payload, $reference, $boutique_ulid, $contexte);
        } catch (\Throwable $e) {
            Log::error('paytech ipn: erreur de traitement', $contexte + ['erreur' => $e::class]);
        }

        return response()->json(['ok' => true]);
    }

    private function traiter(array $payload, string $reference, string $boutiqueUlid, array $contexte): void
    {
        if (! preg_match('/^'.Boutique::ULID_REGEX.'$/', $reference)) {
            Log::warning('paytech ipn: référence absente ou mal formée', $contexte);

            return;
        }

        /** @var Paiement|null $paiement */
        $paiement = Paiement::toutesBoutiques()
            ->with(['boutique.comptePaytech'])
            ->where('ulid', $reference)
            ->where('methode', Paiement::METHODE_PAYTECH)
            ->first();

        if ($paiement === null || $paiement->boutique === null || ! hash_equals($paiement->boutique->ulid, $boutiqueUlid)) {
            Log::warning('paytech ipn: paiement inconnu ou boutique incohérente', $contexte);

            return;
        }

        $boutique = $paiement->boutique;
        $compte = $boutique->comptePaytech;

        // Boutique courante dès maintenant : le journal d'audit des refus lui est rattaché et, en cas de transition,
        // le middleware DiffuserEcritures émet « paiements » / « ventes » sur son canal (seules les tables métier comptent).
        $this->courante->definir($boutique);

        if ($compte === null) {
            Log::warning('paytech ipn: aucun compte PayTech pour la boutique', $contexte);

            return;
        }

        if (! $this->paytech->ipnAuthentique($payload, $compte)) {
            Log::warning('paytech ipn: authenticité refusée', $contexte);
            Audit::enregistrer('paytech.ipn_refusee', $paiement, ['raison' => 'authenticite']);

            return;
        }

        $devise = strtoupper((string) ($payload['currency'] ?? $payload['devise'] ?? 'XOF'));
        $montant = $payload['final_item_price'] ?? $payload['item_price'] ?? null;

        if ($devise !== 'XOF' || ! is_numeric($montant) || (int) round((float) $montant) !== (int) $paiement->montant_xof) {
            Log::warning('paytech ipn: montant ou devise différents', $contexte + ['devise' => $devise]);
            Audit::enregistrer('paytech.ipn_refusee', $paiement, ['raison' => 'montant_ou_devise', 'devise' => $devise, 'montant_recu' => is_numeric($montant) ? (int) round((float) $montant) : null, 'montant_attendu' => $paiement->montant_xof]);

            return;
        }

        // À partir d'ici l'IPN est authentique et cohérente.
        $typeEvenement = mb_strtolower((string) ($payload['type_event'] ?? 'sale_complete'));
        $empreinte = ['ref_command' => $reference, 'type_event' => $typeEvenement, 'montant' => (int) round((float) $montant), 'token' => (string) ($payload['token'] ?? '')];

        if ($typeEvenement === 'sale_canceled' || $typeEvenement === 'sale_cancelled') {
            $resultat = $this->machine->echouer($paiement, MachineEtatPaiement::SOURCE_PAYTECH_IPN, $empreinte);
        } else {
            $resultat = $this->machine->reussir($paiement, MachineEtatPaiement::SOURCE_PAYTECH_IPN, $typeEvenement, $empreinte, [
                'operateur' => PaytechService::operateurDepuis($payload['payment_method'] ?? null) ?? $paiement->operateur,
            ]);
        }

        Log::info('paytech ipn: traitée', $contexte + ['effet' => $resultat['effet']]);
    }
}

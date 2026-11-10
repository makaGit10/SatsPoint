<?php

namespace App\Http\Controllers;

use App\Models\Scopes\BoutiqueScope;
use App\Models\Vente;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Reçu public GET /r/{jeton} (CAHIER § 6.6, CONTRAT_API § 5) : sans session, 60/min/IP, aucune donnée personnelle.
 * JSON si le client le demande (Accept: application/json) ; sinon la coquille de la SPA est servie
 * (en production, Caddy route /r/* vers PHP) ; sans front compilé (dev), le JSON est renvoyé aussi.
 */
class RecuController extends Controller
{
    public function __invoke(Request $request, string $jeton): Response
    {
        if (! $request->expectsJson()) {
            $index = rtrim((string) config('satspoint.web_dist'), '/').'/index.html';

            if (is_file($index)) {
                return response()->file($index, ['Cache-Control' => 'no-cache', 'Content-Type' => 'text/html; charset=UTF-8']);
            }
        }

        // Requête publique : aucune boutique courante → les relations scopées sont chargées explicitement sans scope.
        $vente = Vente::toutesBoutiques()
            ->with([
                'boutique:id,nom,ville,reglages',
                'paiementReussi' => fn ($q) => $q->withoutGlobalScope(BoutiqueScope::class)->select(['id', 'boutique_id', 'methode', 'operateur', 'montant_sats', 'moyen']),
            ])
            ->where('recu_jeton', $jeton)
            ->where('statut', Vente::STATUT_PAYEE)
            ->first();

        if ($vente === null) {
            throw new NotFoundHttpException;
        }

        $paiement = $vente->paiementReussi;

        return response()->json([
            'numero' => $vente->numeroAffiche(),
            'montant_xof' => (int) $vente->montant_xof,
            'montant_sats' => $paiement?->montant_sats === null ? null : (int) $paiement->montant_sats,
            'methode' => $paiement?->methode,
            'operateur' => $paiement?->operateur,
            'moyen' => $paiement?->nomMoyen(),
            'statut' => Vente::STATUT_PAYEE,
            'paye_le' => $vente->payee_at?->toIso8601String(),
            'boutique' => ['nom' => $vente->boutique->nom, 'ville' => $vente->boutique->ville],
            'message' => $vente->boutique->reglagesComplets()['message_recu'],
            'alerte' => $vente->alerte,
        ])->header('Cache-Control', 'private, max-age=60')->header('X-Robots-Tag', 'noindex');
    }
}

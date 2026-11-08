<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boutique\ConfigurerPaytechRequest;
use App\Models\Boutique;
use App\Models\ComptePaytech;
use App\Services\BoutiqueCourante;
use App\Services\PaytechService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\ValidationException;

/** PUT / DELETE /boutique/paytech, POST /boutique/paytech/verifier — propriétaire uniquement, secrets jamais renvoyés. */
class BoutiquePaytechController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante, private readonly PaytechService $paytech) {}

    public function update(ConfigurerPaytechRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererPaiements', $boutique);

        $compte = $boutique->comptePaytech()->first();
        $cle = $request->filled('api_key') ? (string) $request->input('api_key') : $compte?->api_key_chiffree;
        $secret = $request->filled('api_secret') ? (string) $request->input('api_secret') : $compte?->api_secret_chiffree;

        if (blank($cle) || blank($secret)) {
            throw ValidationException::withMessages(['api_key' => 'La clé et le secret PayTech sont requis la première fois.']);
        }

        $compte ??= new ComptePaytech;
        $compte->boutique_id = $boutique->id;
        $compte->fill([
            'api_key_chiffree' => $cle,
            'api_secret_chiffree' => $secret,
            'environnement' => $request->input('environnement'),
            'statut' => ComptePaytech::STATUT_ACTIF,
            'verifie_at' => null,
        ])->save();

        // Le moyen « paytech » devient disponible dans les réglages (le commerçant peut le désactiver ensuite).
        $reglages = $boutique->reglagesComplets();
        if (empty($reglages['moyens']['paytech'])) {
            $reglages['moyens']['paytech'] = true;
            $boutique->fill(['reglages' => $reglages])->save();
        }

        Audit::enregistrer('paytech.configure', $boutique, ['environnement' => $compte->environnement, 'cle_modifiee' => $request->filled('api_key'), 'secret_modifie' => $request->filled('api_secret')]);

        return response()->json(['configure' => true, 'environnement' => $compte->environnement]);
    }

    public function destroy(Request $request): Response
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererPaiements', $boutique);

        $boutique->comptePaytech()->delete();

        $reglages = $boutique->reglagesComplets();
        $reglages['moyens']['paytech'] = false;
        if (! in_array(true, $reglages['moyens'], true)) {
            $reglages['moyens']['lightning'] = true;
        }
        $boutique->fill(['reglages' => $reglages])->save();

        Audit::enregistrer('paytech.supprime', $boutique);

        return response()->noContent();
    }

    /** POST /boutique/paytech/verifier → { ok, message } : demande de paiement de 100 FCFA (mode du compte). */
    public function verifier(Request $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererPaiements', $boutique);

        $compte = $boutique->comptePaytech()->first();

        if ($compte === null) {
            throw new ErreurMetier('PAYTECH_NON_CONFIGURE', 'Aucune clé PayTech enregistrée.', 409);
        }

        $resultat = $this->paytech->verifierCompte($boutique, $compte);

        $compte->forceFill(['statut' => $resultat['ok'] ? ComptePaytech::STATUT_ACTIF : ComptePaytech::STATUT_ERREUR, 'verifie_at' => $resultat['ok'] ? now() : $compte->verifie_at])->save();

        Audit::enregistrer('paytech.verifie', $boutique, ['ok' => $resultat['ok'], 'environnement' => $compte->environnement]);

        return response()->json($resultat);
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boutique\ConfigurerMoyenPaysRequest;
use App\Models\Boutique;
use App\Models\MoyenPaiement;
use App\Models\MoyenPaiementBoutique;
use App\Models\Pays;
use App\Services\BoutiqueCourante;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Moyens de paiement du pays de la boutique (CONTRAT_API § 14.3) — propriétaire / gérant.
 *
 * Anti-IDOR : un moyen inconnu, inactif au catalogue ou d'un AUTRE pays donne le même 404.
 * Cloisonnement : la configuration (MoyenPaiementBoutique) est lue et écrite sous BoutiqueScope.
 */
class BoutiqueMoyensPaysController extends Controller
{
    /** Numéro international : « + » puis 8 à 15 chiffres ; ou code marchand court (3 à 12 chiffres). */
    private const REGEX_NUMERO = '/^(?:\+[1-9][0-9]{7,14}|[0-9]{3,12})$/';

    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** GET /boutique/moyens-pays → { pays, moyens: MoyenBoutique[] } */
    public function index(): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererMoyensPays', $boutique);

        $pays = $boutique->pays ?? Pays::SENEGAL;

        $moyens = MoyenPaiement::query()
            ->where('pays', $pays)->where('actif', true)
            ->orderBy('ordre')->orderBy('nom')
            ->get(['id', 'ulid', 'nom', 'type', 'couleur', 'instructions_fr', 'instructions_en']);

        // Une seule requête pour la configuration de la boutique (scope boutique).
        $configs = MoyenPaiementBoutique::query()
            ->whereIn('moyen_paiement_id', $moyens->pluck('id'))
            ->get(['id', 'boutique_id', 'moyen_paiement_id', 'valeur', 'active'])
            ->keyBy('moyen_paiement_id');

        return response()->json([
            'pays' => $pays,
            'moyens' => $moyens->map(fn (MoyenPaiement $m) => $m->formeBoutique($configs->get($m->id)))->values()->all(),
        ]);
    }

    /** PUT /boutique/moyens-pays/{moyen} { active, valeur? } → { moyen: MoyenBoutique } */
    public function update(ConfigurerMoyenPaysRequest $request, string $moyen): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('gererMoyensPays', $boutique);

        $catalogue = MoyenPaiement::query()
            ->where('ulid', $moyen)
            ->where('actif', true)
            ->where('pays', $boutique->pays ?? Pays::SENEGAL)
            ->first() ?? throw new NotFoundHttpException;

        $request->validate(ConfigurerMoyenPaysRequest::REGLES);

        $config = MoyenPaiementBoutique::query()->firstOrNew(['moyen_paiement_id' => $catalogue->id]);
        $ancienneValeur = $config->valeur;

        $valeur = $ancienneValeur;
        if ($request->exists('valeur')) {
            $brute = $request->input('valeur');
            $valeur = ($brute === null || trim((string) $brute) === '') ? null : $this->valeurValide($catalogue, (string) $brute);
        }

        $active = $request->boolean('active');

        if ($active && $valeur === null) {
            throw ValidationException::withMessages(['valeur' => $catalogue->type === MoyenPaiement::TYPE_LIEN
                ? 'Indiquez votre lien de paiement marchand pour activer ce moyen.'
                : 'Indiquez votre numéro marchand pour activer ce moyen.']);
        }

        $config->fill(['valeur' => $valeur, 'active' => $active]);

        if ($config->isDirty() || ! $config->exists) {
            $config->save();

            Audit::enregistrer('boutique.moyen_pays_modifie', $boutique, [
                'moyen' => $catalogue->ulid,
                'nom' => $catalogue->nom,
                'active' => $active,
                'valeur_modifiee' => $valeur !== $ancienneValeur,
            ]);
        }

        return response()->json(['moyen' => $catalogue->formeBoutique($config)]);
    }

    /** Valide et normalise la valeur selon le type du moyen ; 422 sur `valeur` sinon. */
    private function valeurValide(MoyenPaiement $moyen, string $brute): string
    {
        if ($moyen->type === MoyenPaiement::TYPE_LIEN) {
            $lien = trim($brute);
            $validateur = Validator::make(['valeur' => $lien], ['valeur' => ['string', 'max:300', 'url:https', 'starts_with:https://', 'not_regex:/[\s<>"]/']]);

            if ($validateur->fails()) {
                throw ValidationException::withMessages(['valeur' => 'Le lien de paiement doit être une adresse https:// valide (300 caractères au plus).']);
            }

            return $lien;
        }

        // Numéro : espaces, points, tirets et parenthèses retirés.
        $numero = preg_replace('/[\s.\-()]/u', '', $brute) ?? '';

        if (preg_match(self::REGEX_NUMERO, $numero) !== 1) {
            throw ValidationException::withMessages(['valeur' => 'Numéro marchand invalide : numéro international (+225…) ou code marchand de 3 à 12 chiffres.']);
        }

        return $numero;
    }
}

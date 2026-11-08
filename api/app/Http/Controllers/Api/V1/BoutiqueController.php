<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Boutique\CreerBoutiqueRequest;
use App\Http\Requests\Boutique\ModifierBoutiqueRequest;
use App\Http\Resources\BoutiqueResource;
use App\Http\Resources\UtilisateurResource;
use App\Models\Boutique;
use App\Models\Membre;
use App\Services\BoutiqueCourante;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class BoutiqueController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** POST /boutique → 201 : l'utilisateur sans boutique en devient propriétaire. */
    public function store(CreerBoutiqueRequest $request): JsonResponse
    {
        $utilisateur = $request->user();

        $this->authorize('create', Boutique::class);

        /** @var Membre $membre */
        [$boutique, $membre] = DB::transaction(function () use ($request, $utilisateur) {
            $boutique = new Boutique([
                'nom' => trim($request->input('nom')),
                'ville' => trim($request->input('ville')),
                'telephone' => $request->telephoneNormalise(),
                'fuseau' => config('satspoint.boutique.fuseau'),
                'devise' => config('satspoint.boutique.devise'),
                'reglages' => config('satspoint.boutique.reglages_defaut'),
            ]);
            $boutique->forceFill(['statut' => Boutique::STATUT_ACTIVE, 'cree_par' => $utilisateur->id])->save();

            $membre = new Membre(['user_id' => $utilisateur->id, 'role' => Membre::ROLE_PROPRIETAIRE, 'actif' => true]);
            $membre->boutique_id = $boutique->id;
            $membre->save();

            return [$boutique, $membre];
        });

        $membre->setRelation('boutique', $boutique);
        $this->courante->definir($boutique, $membre);

        Audit::enregistrer('boutique.creee', $boutique, ['nom' => $boutique->nom, 'ville' => $boutique->ville]);

        $boutique->load(['connexionWallet', 'comptePaytech']);

        // CONTRAT_API § 8 : `{ boutique, utilisateur }` — l'utilisateur (forme de GET /moi) évite un aller-retour au front.
        return response()->json([
            'boutique' => (new BoutiqueResource($boutique, $membre))->resolve($request),
            'utilisateur' => (new UtilisateurResource($utilisateur->refresh(), $membre))->resolve($request),
        ], 201);
    }

    /** GET /boutique */
    public function show(Request $request): BoutiqueResource
    {
        $boutique = $this->courante->exiger(Boutique::class);

        $this->authorize('view', $boutique);

        $boutique->load(['connexionWallet', 'comptePaytech']);

        return new BoutiqueResource($boutique, $this->courante->membre());
    }

    /** PATCH /boutique : réglages et coordonnées (propriétaire / gérant). */
    public function update(ModifierBoutiqueRequest $request): BoutiqueResource
    {
        $boutique = $this->courante->exiger(Boutique::class);

        $this->authorize('update', $boutique);

        $avant = ['nom' => $boutique->nom, 'ville' => $boutique->ville, 'reglages' => $boutique->reglagesComplets()];

        $donnees = $request->safe()->only(['nom', 'ville']);
        if ($request->has('telephone')) {
            $donnees['telephone'] = $request->telephoneNormalise();
        }

        $reglages = $boutique->reglagesComplets();
        if ($request->has('reglages')) {
            $nouveaux = (array) $request->validated('reglages');
            if (array_key_exists('moyens', $nouveaux)) {
                $nouveaux['moyens'] = array_merge($reglages['moyens'], (array) $nouveaux['moyens']);
            }
            $reglages = array_merge($reglages, $nouveaux);

            if (! in_array(true, $reglages['moyens'], true)) {
                throw ValidationException::withMessages(['reglages.moyens' => 'Au moins un moyen de paiement doit rester actif.']);
            }
        }
        if ($request->has('paiement_test')) {
            $reglages['paiement_test'] = $request->boolean('paiement_test');
        }
        $donnees['reglages'] = $reglages;

        $boutique->fill($donnees)->save();

        Audit::enregistrer('boutique.reglages_modifies', $boutique, [
            'avant' => $avant,
            'apres' => ['nom' => $boutique->nom, 'ville' => $boutique->ville, 'reglages' => $boutique->reglagesComplets()],
        ]);

        $boutique->load(['connexionWallet', 'comptePaytech']);

        return new BoutiqueResource($boutique, $this->courante->membre());
    }
}

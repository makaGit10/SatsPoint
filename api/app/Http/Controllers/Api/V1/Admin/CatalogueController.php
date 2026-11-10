<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\LangueRequest;
use App\Http\Requests\Admin\ListerMoyensRequest;
use App\Http\Requests\Admin\ModifierPaysRequest;
use App\Http\Requests\Admin\MoyenPaiementRequest;
use App\Models\Audio;
use App\Models\Boutique;
use App\Models\CleAudio;
use App\Models\Langue;
use App\Models\MoyenPaiement;
use App\Models\MoyenPaiementBoutique;
use App\Models\Paiement;
use App\Models\Pays;
use App\Services\Catalogue;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Catalogues de la plateforme (CONTRAT_API § 14.2) : pays, langues de l'aide vocale, moyens de paiement par pays.
 *
 * Super-admin + 2FA (middlewares du groupe /admin, vérifiés avant toute résolution de paramètre) ; écritures limitées
 * (throttle « catalogue ») et journalisées (plateforme.*). Aucune donnée d'une boutique n'est exposée : seulement des
 * compteurs (boutiques d'un pays, boutiques ayant activé un moyen). Les écritures émettent « catalogues » sur le canal
 * public « plateforme » (middleware DiffuserEcritures).
 */
class CatalogueController extends Controller
{
    // ------------------------------------------------------------------ pays

    /** GET /admin/pays → { pays: Array<Pays & { boutiques }> } */
    public function pays(): JsonResponse
    {
        $pays = Pays::query()
            ->select('pays.*')
            ->selectSub(Boutique::query()->selectRaw('COUNT(*)')->whereColumn('boutiques.pays', 'pays.code'), 'boutiques_count')
            ->orderBy('ordre')->orderBy('nom_fr')
            ->get();

        return response()->json(['pays' => $pays->map(fn (Pays $p) => $p->formeAdmin())->values()->all()]);
    }

    /** PATCH /admin/pays/{code} { nom_fr?, nom_en?, actif? } → { pays } */
    public function modifierPays(ModifierPaysRequest $request, string $pays): JsonResponse
    {
        $modele = Pays::query()->find($pays) ?? throw new NotFoundHttpException;

        if ($request->has('actif') && ! $request->boolean('actif') && $modele->estProtege()) {
            throw new ErreurMetier('PAYS_PROTEGE', 'Le Sénégal reste toujours actif.', 409);
        }

        $modele->fill($request->safe()->only(['nom_fr', 'nom_en', 'actif']));
        $changements = $this->changements($modele);

        if ($changements !== []) {
            $modele->save();
            Audit::enregistrer('plateforme.pays_modifie', $modele, ['pays' => $modele->code, 'changements' => $changements]);
        }

        $modele->setAttribute('boutiques_count', Boutique::query()->where('pays', $modele->code)->count());

        return response()->json(['pays' => $modele->formeAdmin()]);
    }

    // --------------------------------------------------------------- langues

    /** GET /admin/langues → { langues: Array<Langue & { audios_publies }> } */
    public function langues(): JsonResponse
    {
        $langues = $this->requeteLangues()->orderBy('ordre')->orderBy('code')->get();

        return response()->json(['langues' => $langues->map(fn (Langue $l) => $l->formeAdmin())->values()->all()]);
    }

    /** POST /admin/langues → 201 { langue } ; crée aussi la clé vocale `langue.{code}`. */
    public function creerLangue(LangueRequest $request): JsonResponse
    {
        $langue = DB::transaction(function () use ($request) {
            $langue = new Langue([
                'code' => (string) $request->validated('code'),
                'nom_local' => trim((string) $request->validated('nom_local')),
                'nom_fr' => trim((string) $request->validated('nom_fr')),
                'nom_en' => trim((string) $request->validated('nom_en')),
                'pays' => array_values(array_unique((array) $request->validated('pays', []))),
                'actif' => $request->has('actif') ? $request->boolean('actif') : true,
                'ordre' => (int) ($request->validated('ordre') ?? ((int) Langue::query()->where('code', '!=', Langue::FRANCAIS)->max('ordre') + 1)),
            ]);
            $langue->save();

            Catalogue::assurerCleVocale($langue);

            return $langue;
        });

        Audit::enregistrer('plateforme.langue_creee', $langue, [
            'code' => $langue->code, 'nom_fr' => $langue->nom_fr, 'pays' => $langue->pays, 'actif' => $langue->actif,
        ]);

        return response()->json(['langue' => $this->relireLangue($langue->code)->formeAdmin()], 201);
    }

    /** PATCH /admin/langues/{code} → { langue } */
    public function modifierLangue(LangueRequest $request, string $langue): JsonResponse
    {
        $modele = Langue::query()->where('code', $langue)->first() ?? throw new NotFoundHttpException;

        if ($request->has('actif') && ! $request->boolean('actif') && $modele->estProtegee()) {
            throw new ErreurMetier('LANGUE_PROTEGEE', 'Le français est la langue de repli : il reste toujours actif.', 409);
        }

        $donnees = $request->safe()->only(['nom_local', 'nom_fr', 'nom_en', 'actif', 'ordre']);
        $donnees = array_map(fn ($v) => is_string($v) ? trim($v) : $v, $donnees);
        if ($request->has('pays')) {
            $donnees['pays'] = array_values(array_unique((array) $request->validated('pays', [])));
        }

        $modele->fill($donnees);
        $changements = $this->changements($modele);

        if ($changements !== []) {
            DB::transaction(function () use ($modele) {
                $modele->save();
                // Le nom a pu changer : la clé vocale du sélecteur suit (texte affiché au studio).
                Catalogue::assurerCleVocale($modele);
            });

            Audit::enregistrer('plateforme.langue_modifiee', $modele, ['code' => $modele->code, 'changements' => $changements]);
        }

        return response()->json(['langue' => $this->relireLangue($modele->code)->formeAdmin()]);
    }

    /** DELETE /admin/langues/{code} → 204, seulement si aucun audio (brouillon compris) ; sinon désactiver. */
    public function supprimerLangue(string $langue): Response
    {
        $modele = Langue::query()->where('code', $langue)->first() ?? throw new NotFoundHttpException;

        if ($modele->estProtegee()) {
            throw new ErreurMetier('LANGUE_PROTEGEE', 'Le français est la langue de repli : il ne peut pas être supprimé.', 409);
        }

        if (Audio::query()->where('langue', $modele->code)->exists()) {
            throw new ErreurMetier('LANGUE_UTILISEE', 'Cette langue a déjà des audios : désactivez-la plutôt que de la supprimer.', 409);
        }

        DB::transaction(function () use ($modele) {
            // La clé vocale du nom reste (avec ses éventuels audios dans d'autres langues), signalée « retirée ».
            CleAudio::query()->where('cle', $modele->cleVocale())->update(['presente_dans_code' => false, 'updated_at' => now()]);
            $modele->delete();
        });

        Audit::enregistrer('plateforme.langue_supprimee', 'Langue', ['code' => $modele->code, 'nom_fr' => $modele->nom_fr]);

        return response()->noContent();
    }

    // ---------------------------------------------------- moyens de paiement

    /** GET /admin/moyens-paiement?pays= → { moyens: Array<MoyenCatalogue & { boutiques_actives }> } */
    public function moyens(ListerMoyensRequest $request): JsonResponse
    {
        $moyens = $this->requeteMoyens()
            ->when($request->filled('pays'), fn ($q) => $q->where('moyens_paiement.pays', $request->input('pays')))
            ->orderBy('moyens_paiement.pays')->orderBy('moyens_paiement.ordre')->orderBy('moyens_paiement.nom')
            ->get();

        return response()->json(['moyens' => $moyens->map(fn (MoyenPaiement $m) => $m->formeAdmin())->values()->all()]);
    }

    /** POST /admin/moyens-paiement → 201 { moyen } */
    public function creerMoyen(MoyenPaiementRequest $request): JsonResponse
    {
        $moyen = new MoyenPaiement([
            'pays' => (string) $request->validated('pays'),
            'nom' => trim((string) $request->validated('nom')),
            'type' => (string) $request->validated('type'),
            'couleur' => (string) $request->validated('couleur'),
            'instructions_fr' => $this->texte($request->validated('instructions_fr')),
            'instructions_en' => $this->texte($request->validated('instructions_en')),
            'actif' => $request->has('actif') ? $request->boolean('actif') : true,
            'ordre' => (int) ($request->validated('ordre') ?? ((int) MoyenPaiement::query()->where('pays', $request->validated('pays'))->max('ordre') + 1)),
        ]);
        $moyen->save();

        Audit::enregistrer('plateforme.moyen_cree', $moyen, [
            'pays' => $moyen->pays, 'nom' => $moyen->nom, 'type' => $moyen->type, 'actif' => $moyen->actif,
        ]);

        return response()->json(['moyen' => $this->relireMoyen($moyen->ulid)->formeAdmin()], 201);
    }

    /** PATCH /admin/moyens-paiement/{ulid} → { moyen } */
    public function modifierMoyen(MoyenPaiementRequest $request, string $moyen): JsonResponse
    {
        $modele = MoyenPaiement::query()->where('ulid', $moyen)->first() ?? throw new NotFoundHttpException;

        $donnees = $request->safe()->only(['nom', 'couleur', 'actif', 'ordre']);
        if (isset($donnees['nom'])) {
            $donnees['nom'] = trim((string) $donnees['nom']);
        }
        foreach (['instructions_fr', 'instructions_en'] as $champ) {
            if ($request->exists($champ)) {
                $donnees[$champ] = $this->texte($request->validated($champ));
            }
        }

        $modele->fill($donnees);
        $changements = $this->changements($modele);

        if ($changements !== []) {
            $modele->save();
            Audit::enregistrer('plateforme.moyen_modifie', $modele, ['pays' => $modele->pays, 'nom' => $modele->nom, 'changements' => $changements]);
        }

        return response()->json(['moyen' => $this->relireMoyen($modele->ulid)->formeAdmin()]);
    }

    /** DELETE /admin/moyens-paiement/{ulid} → 204 s'il n'a jamais servi ; sinon 409 MOYEN_UTILISE (désactiver). */
    public function supprimerMoyen(string $moyen): Response
    {
        $modele = MoyenPaiement::query()->where('ulid', $moyen)->first() ?? throw new NotFoundHttpException;

        $utilise = MoyenPaiementBoutique::toutesBoutiques()->where('moyen_paiement_id', $modele->id)->exists()
            || Paiement::toutesBoutiques()->where('moyen_paiement_id', $modele->id)->exists();

        if ($utilise) {
            throw new ErreurMetier('MOYEN_UTILISE', 'Ce moyen a déjà été activé par une boutique : désactivez-le plutôt que de le supprimer.', 409);
        }

        $modele->delete();

        Audit::enregistrer('plateforme.moyen_supprime', 'MoyenPaiement', ['ulid' => $modele->ulid, 'pays' => $modele->pays, 'nom' => $modele->nom]);

        return response()->noContent();
    }

    // ---------------------------------------------------------------- interne

    /** Langues avec le nombre d'audios publiés (sous-requête : pas de N+1). */
    private function requeteLangues()
    {
        return Langue::query()
            ->select('langues.*')
            ->selectSub(
                Audio::query()->selectRaw('COUNT(*)')->whereColumn('audios.langue', 'langues.code')->where('audios.statut', Audio::STATUT_PUBLIE),
                'audios_publies',
            );
    }

    /** Moyens avec le nombre de boutiques qui les ont activés (agrégat seulement, aucune donnée de boutique). */
    private function requeteMoyens()
    {
        return MoyenPaiement::query()
            ->select('moyens_paiement.*')
            ->selectSub(
                MoyenPaiementBoutique::toutesBoutiques()->selectRaw('COUNT(*)')
                    ->whereColumn('moyens_paiement_boutique.moyen_paiement_id', 'moyens_paiement.id')
                    ->where('moyens_paiement_boutique.active', true),
                'boutiques_actives',
            );
    }

    private function relireLangue(string $code): Langue
    {
        return $this->requeteLangues()->where('langues.code', $code)->firstOrFail();
    }

    private function relireMoyen(string $ulid): MoyenPaiement
    {
        return $this->requeteMoyens()->where('moyens_paiement.ulid', $ulid)->firstOrFail();
    }

    /** Champs réellement modifiés (avant → après), pour le journal. */
    private function changements(Model $modele): array
    {
        $changements = [];

        foreach ($modele->getDirty() as $champ => $valeur) {
            if (in_array($champ, ['updated_at', 'created_at'], true)) {
                continue;
            }
            $changements[$champ] = ['avant' => $modele->getOriginal($champ), 'apres' => $modele->getAttribute($champ)];
        }

        return $changements;
    }

    /** Texte brut d'une ligne, espaces superflus retirés ; vide → null. */
    private function texte(mixed $valeur): ?string
    {
        if ($valeur === null) {
            return null;
        }

        $texte = trim((string) preg_replace('/\s+/u', ' ', (string) $valeur));

        return $texte === '' ? null : $texte;
    }
}

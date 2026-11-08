<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Equipe\ModifierMembreRequest;
use App\Http\Resources\InvitationResource;
use App\Http\Resources\MembreResource;
use App\Models\Boutique;
use App\Models\Invitation;
use App\Models\Membre;
use App\Services\BoutiqueCourante;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\ConflictHttpException;

class EquipeController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** GET /equipe → { membres: [...], invitations: [...] } (propriétaire / gérant). */
    public function index(Request $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);

        $this->authorize('viewAny', Membre::class);

        $membres = Membre::query()
            ->with('user:id,ulid,nom,email,telephone,derniere_connexion_at')
            ->orderByRaw("CASE role WHEN 'proprietaire' THEN 0 WHEN 'gerant' THEN 1 ELSE 2 END")
            ->orderBy('created_at')
            ->get();

        $invitations = Invitation::query()
            ->whereNull('acceptee_at')
            ->where('expire_at', '>', now())
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'membres' => MembreResource::collection($membres)->resolve(),
            'invitations' => InvitationResource::collection($invitations)->resolve(),
        ]);
    }

    /** PATCH /equipe/{membre} { role?, actif? } */
    public function update(ModifierMembreRequest $request, Membre $membre): MembreResource
    {
        $this->authorize('update', $membre);

        $nouveauRole = $request->input('role', $membre->role);
        $nouveauActif = $request->has('actif') ? $request->boolean('actif') : $membre->actif;

        if ($request->has('role') && $nouveauRole !== $membre->role) {
            $this->authorize('attribuerRole', [Membre::class, $nouveauRole]);
        }

        $avant = ['role' => $membre->role, 'actif' => $membre->actif];

        DB::transaction(function () use ($membre, $nouveauRole, $nouveauActif) {
            // Verrou sur la ligne : évite deux retraits simultanés du dernier propriétaire.
            $membre = Membre::query()->whereKey($membre->id)->lockForUpdate()->firstOrFail();

            $perdLaPropriete = $membre->estProprietaire() && $membre->actif
                && ($nouveauRole !== Membre::ROLE_PROPRIETAIRE || ! $nouveauActif);

            if ($perdLaPropriete && $this->nombreProprietairesActifs() <= 1) {
                throw new ConflictHttpException('La boutique doit garder au moins un propriétaire actif.');
            }

            $membre->fill(['role' => $nouveauRole, 'actif' => $nouveauActif])->save();

            if (! $nouveauActif) {
                // Désactivation = accès coupé immédiatement : toutes ses sessions sont révoquées.
                $membre->user()->firstOrFail()->revoquerSessions();
            }
        });

        $membre->refresh()->load('user:id,ulid,nom,email,telephone,derniere_connexion_at');

        Audit::enregistrer($nouveauActif ? 'equipe.membre_modifie' : 'equipe.membre_desactive', $membre, [
            'avant' => $avant,
            'apres' => ['role' => $membre->role, 'actif' => $membre->actif],
            'utilisateur' => $membre->user->ulid,
        ]);

        return new MembreResource($membre);
    }

    /** DELETE /equipe/{membre} → 204 */
    public function destroy(Request $request, Membre $membre): Response
    {
        $this->authorize('delete', $membre);

        $membre->loadMissing('user:id,ulid,nom');
        $utilisateurUlid = $membre->user->ulid;
        $role = $membre->role;

        DB::transaction(function () use ($membre) {
            $verrouille = Membre::query()->whereKey($membre->id)->lockForUpdate()->firstOrFail();

            if ($verrouille->estProprietaire() && $verrouille->actif && $this->nombreProprietairesActifs() <= 1) {
                throw new ConflictHttpException('Le dernier propriétaire ne peut pas quitter la boutique.');
            }

            $utilisateur = $verrouille->user()->firstOrFail();
            $verrouille->delete();
            $utilisateur->revoquerSessions();
        });

        Audit::enregistrer('equipe.membre_retire', $membre, ['utilisateur' => $utilisateurUlid, 'role' => $role]);

        return response()->noContent();
    }

    private function nombreProprietairesActifs(): int
    {
        return Membre::query()->where('role', Membre::ROLE_PROPRIETAIRE)->where('actif', true)->count();
    }
}

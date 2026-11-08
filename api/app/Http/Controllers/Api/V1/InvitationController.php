<?php

namespace App\Http\Controllers\Api\V1;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Equipe\InviterRequest;
use App\Http\Resources\InvitationResource;
use App\Http\Resources\UtilisateurResource;
use App\Models\Boutique;
use App\Models\Invitation;
use App\Models\Membre;
use App\Models\Scopes\BoutiqueScope;
use App\Models\User;
use App\Notifications\InvitationEquipe;
use App\Services\BoutiqueCourante;
use App\Support\Identifiant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;

class InvitationController extends Controller
{
    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** POST /equipe/invitations { contact, role } → 201 { invitation } */
    public function store(InviterRequest $request): JsonResponse
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $role = $request->input('role');

        $this->authorize('create', [Invitation::class, $role]);

        $contact = $request->contactNormalise();
        $colonne = Identifiant::colonne($contact['type']);

        // Déjà membre actif de cette boutique ? Inutile d'inviter.
        $dejaMembre = Membre::query()
            ->where('actif', true)
            ->whereHas('user', fn ($q) => $q->where($colonne, $contact['valeur']))
            ->exists();

        if ($dejaMembre) {
            throw new ErreurMetier('DEJA_DANS_EQUIPE', 'Cette personne fait déjà partie de l\'équipe.', 409);
        }

        $jeton = Str::random(48);

        $invitation = DB::transaction(function () use ($contact, $role, $jeton, $request) {
            // Une seule invitation en attente par contact : on remplace la précédente.
            Invitation::query()->where('contact', $contact['valeur'])->whereNull('acceptee_at')->delete();

            $invitation = new Invitation([
                'contact' => $contact['valeur'],
                'role' => $role,
                'expire_at' => now()->addHours((int) config('satspoint.invitation.duree_heures', 72)),
            ]);
            $invitation->forceFill(['jeton_hash' => Invitation::hacher($jeton), 'invite_par' => $request->user()->id])->save();

            return $invitation;
        });

        $lien = null;

        if ($contact['type'] === Identifiant::EMAIL) {
            Notification::route('mail', $contact['valeur'])
                ->notify(new InvitationEquipe($invitation, $jeton, $boutique->nom, $request->user()->nom));
        } else {
            // Pas d'envoi SMS en P0 : le responsable transmet lui-même le lien (WhatsApp, etc.).
            $lien = InvitationEquipe::lien($jeton);
        }

        Audit::enregistrer('equipe.invitation_creee', $invitation, [
            'contact' => Identifiant::masquer($contact['valeur']),
            'role' => $role,
            'canal' => $contact['type'] === Identifiant::EMAIL ? 'email' : 'lien',
        ]);

        return (new InvitationResource($invitation))->avecLien($lien)->response()->setStatusCode(201);
    }

    /** DELETE /equipe/invitations/{invitation} → 204 : annule une invitation en attente. */
    public function destroy(Request $request, Invitation $invitation): Response
    {
        $this->authorize('delete', $invitation);

        $invitation->delete();

        Audit::enregistrer('equipe.invitation_annulee', $invitation, [
            'contact' => Identifiant::masquer($invitation->contact),
            'role' => $invitation->role,
        ]);

        return response()->noContent();
    }

    /**
     * GET /invitations/{jeton} (public, 20 / min / IP) → { invitation: { boutique: { nom }, role, contact_masque, expire_le } }
     *
     * Écran d'accueil d'une personne invitée (CONTRAT_API V3.8) : rien d'autre que le nom de la boutique, le rôle
     *
     * proposé et le contact MASQUÉ (« am***@exemple.sn »). Jeton inconnu → 404 ; périmé, consommé ou boutique
     * suspendue → 410 INVITATION_EXPIREE (sans dire laquelle des trois).
     */
    public function show(string $jeton): JsonResponse
    {
        $invitation = Invitation::query()
            ->withoutGlobalScope(BoutiqueScope::class)
            ->with('boutique:id,nom,statut')
            ->where('jeton_hash', Invitation::hacher($jeton))
            ->first();

        abort_if($invitation === null, 404);

        if (! $invitation->estValide() || $invitation->boutique === null || ! $invitation->boutique->estActive()) {
            throw new ErreurMetier('INVITATION_EXPIREE', 'Cette invitation a expiré ou a déjà été utilisée. Demandez-en une nouvelle.', 410);
        }

        return response()->json(['invitation' => [
            'boutique' => ['nom' => $invitation->boutique->nom],
            'role' => $invitation->role,
            'contact_masque' => Identifiant::masquer($invitation->contact),
            'expire_le' => $invitation->expire_at->toIso8601String(),
        ]])->header('Cache-Control', 'no-store, private');
    }

    /** POST /invitations/{jeton}/accepter → 200 { utilisateur } */
    public function accepter(Request $request, string $jeton): UtilisateurResource
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        $invitation = Invitation::query()
            ->withoutGlobalScope(BoutiqueScope::class)
            ->with('boutique')
            ->where('jeton_hash', Invitation::hacher($jeton))
            ->first();

        // Jeton inconnu → 404 ; connu mais périmé / consommé → 410.
        abort_if($invitation === null, 404);

        if (! $invitation->estValide()) {
            throw new ErreurMetier('INVITATION_EXPIREE', 'Cette invitation a expiré ou a déjà été utilisée.', 410);
        }

        $this->authorize('accepter', $invitation);

        $boutique = $invitation->boutique;
        if ($boutique === null || ! $boutique->estActive()) {
            throw new ErreurMetier('INVITATION_EXPIREE', 'Cette boutique n\'est plus disponible.', 410);
        }

        // Une seule boutique active par utilisateur (P0).
        $autreAdhesion = Membre::toutesBoutiques()
            ->where('user_id', $utilisateur->id)
            ->where('actif', true)
            ->where('boutique_id', '!=', $boutique->id)
            ->exists();

        if ($autreAdhesion) {
            throw new ErreurMetier('DEJA_MEMBRE', 'Ce compte appartient déjà à une autre boutique.', 422);
        }

        $membre = DB::transaction(function () use ($invitation, $boutique, $utilisateur) {
            $membre = Membre::pourBoutique($boutique)->where('user_id', $utilisateur->id)->first();

            if ($membre === null) {
                $membre = new Membre(['user_id' => $utilisateur->id, 'role' => $invitation->role, 'actif' => true, 'invite_par' => $invitation->invite_par]);
                $membre->boutique_id = $boutique->id;
            } else {
                $membre->fill(['role' => $invitation->role, 'actif' => true, 'invite_par' => $invitation->invite_par]);
            }

            $membre->save();

            $invitation->forceFill(['acceptee_at' => now(), 'acceptee_par' => $utilisateur->id])->save();

            return $membre;
        });

        $membre->setRelation('boutique', $boutique);
        $this->courante->definir($boutique, $membre);

        Audit::enregistrer('equipe.invitation_acceptee', $invitation, ['role' => $membre->role, 'utilisateur' => $utilisateur->ulid]);

        $boutique->load(['connexionWallet', 'comptePaytech']);

        return new UtilisateurResource($utilisateur, $membre);
    }
}

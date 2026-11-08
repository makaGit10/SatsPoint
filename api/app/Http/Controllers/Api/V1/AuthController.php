<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Middleware\VerifierSessionRevoquee;
use App\Http\Requests\Auth\ConnexionRequest;
use App\Http\Requests\Auth\InscriptionRequest;
use App\Http\Resources\UtilisateurResource;
use App\Models\User;
use App\Services\BoutiqueCourante;
use App\Support\Identifiant;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    /** Hachage bcrypt d'une valeur aléatoire, utilisé pour égaliser le temps de réponse (aucun compte réel). */
    private const HASH_LEURRE = '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

    public function __construct(private readonly BoutiqueCourante $courante) {}

    /** POST /auth/inscription → 201 { utilisateur } et ouvre la session. */
    public function inscription(InscriptionRequest $request): JsonResponse
    {
        $identifiant = $request->identifiantNormalise();
        $colonne = Identifiant::colonne($identifiant['type']);

        if (User::query()->where($colonne, $identifiant['valeur'])->exists()) {
            // Message volontairement peu disert (pas d'énumération fine), mais utile pour l'utilisateur.
            throw ValidationException::withMessages([
                'identifiant' => 'Cet identifiant ne peut pas être utilisé. Essayez de vous connecter ou utilisez « Mot de passe oublié ».',
            ]);
        }

        $preferences = config('satspoint.preferences_defaut');
        if ($request->filled('locale')) {
            $preferences['locale'] = $request->input('locale');
        }

        $utilisateur = User::create([
            'nom' => trim($request->input('nom')),
            $colonne => $identifiant['valeur'],
            'password' => $request->input('password'),
            'preferences' => $preferences,
        ]);

        $this->ouvrirSession($request, $utilisateur, false);

        Audit::enregistrer('auth.inscription', $utilisateur, ['methode' => $identifiant['type']], $utilisateur);

        return (new UtilisateurResource($utilisateur, $this->courante->membre()))
            ->response()
            ->setStatusCode(201);
    }

    /** POST /auth/connexion → { utilisateur } ; message générique en cas d'échec. */
    public function connexion(ConnexionRequest $request): JsonResponse
    {
        $identifiant = $request->identifiantNormalise();
        $seSouvenir = $request->boolean('se_souvenir');

        $utilisateur = $identifiant === null
            ? null
            : User::query()->where(Identifiant::colonne($identifiant['type']), $identifiant['valeur'])->first();

        $credentials = $utilisateur === null
            ? ['email' => '__inexistant__@satspoint.invalid', 'password' => $request->input('password')]
            : [Identifiant::colonne($identifiant['type']) => $identifiant['valeur'], 'password' => $request->input('password')];

        if ($utilisateur === null) {
            // Compte inconnu : on consomme quand même le coût d'un hachage pour ne pas trahir l'absence du compte par le temps de réponse.
            Hash::check($request->input('password'), self::HASH_LEURRE);
        }

        if (! Auth::guard('web')->attempt($credentials, $seSouvenir)) {
            // Échec journalisé SANS mot de passe ni identifiant en clair (haché pour corréler).
            Audit::enregistrer('auth.echec', $utilisateur, [
                'identifiant_hache' => $identifiant === null ? null : substr(hash('sha256', $identifiant['valeur']), 0, 16),
                'compte_existant' => $utilisateur !== null,
            ], $utilisateur);

            return response()->json(['message' => 'Identifiants incorrects.', 'code' => 'IDENTIFIANTS_INCORRECTS'], 401);
        }

        /** @var User $utilisateur */
        $utilisateur = Auth::guard('web')->user();

        $this->ouvrirSession($request, $utilisateur, true);

        Audit::enregistrer('auth.connexion', $utilisateur, ['methode' => $identifiant['type'], 'se_souvenir' => $seSouvenir], $utilisateur);

        return (new UtilisateurResource($utilisateur, $this->courante->membre()))->response();
    }

    /** POST /auth/deconnexion → 204 */
    public function deconnexion(Request $request): Response
    {
        $utilisateur = $request->user();

        Auth::guard('web')->logout();
        Auth::forgetGuards();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        Audit::enregistrer('auth.deconnexion', $utilisateur, [], $utilisateur);

        return response()->noContent();
    }

    /** POST /auth/deconnexion-partout → 204 : invalide toutes les sessions, y compris celle-ci. */
    public function deconnexionPartout(Request $request): Response
    {
        /** @var User $utilisateur */
        $utilisateur = $request->user();

        DB::transaction(function () use ($utilisateur) {
            $utilisateur->revoquerSessions();
        });

        Auth::guard('web')->logout();
        Auth::forgetGuards();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        Audit::enregistrer('auth.deconnexion_partout', $utilisateur, [], $utilisateur);

        return response()->noContent();
    }

    private function ouvrirSession(Request $request, User $utilisateur, bool $dejaConnecte): void
    {
        if (! $dejaConnecte) {
            Auth::guard('web')->login($utilisateur);
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        VerifierSessionRevoquee::marquerOuverture($request, $utilisateur);

        $utilisateur->forceFill(['derniere_connexion_at' => now()])->saveQuietly();

        $this->courante->rafraichir();
    }
}

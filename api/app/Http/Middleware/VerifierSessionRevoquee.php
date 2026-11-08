<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Coupe immédiatement l'accès d'une session ouverte AVANT une révocation
 * (déconnexion partout, désactivation ou retrait d'un membre par un responsable,
 * réinitialisation du mot de passe).
 *
 * À la connexion, la session mémorise l'« empreinte de révocation » du compte
 * (valeur de users.sessions_revoquees_at). Si le compte a été révoqué depuis,
 * l'empreinte ne correspond plus : la session est détruite → 401.
 */
class VerifierSessionRevoquee
{
    public const CLE_SESSION = 'auth_revocation';

    public function handle(Request $request, Closure $next): Response
    {
        $utilisateur = $request->user();

        if ($utilisateur instanceof User && $utilisateur->sessions_revoquees_at !== null && $request->hasSession()) {
            $enSession = $request->session()->get(self::CLE_SESSION);

            if (! is_string($enSession) || ! hash_equals(self::empreinte($utilisateur), $enSession)) {
                Auth::guard('web')->logout();
                Auth::forgetGuards();
                $request->session()->invalidate();
                $request->session()->regenerateToken();

                return response()->json(['message' => 'Session expirée, reconnectez-vous.', 'code' => 'SESSION_REVOQUEE'], 401);
            }
        }

        return $next($request);
    }

    /** Empreinte de révocation courante du compte ("0" tant qu'aucune révocation n'a eu lieu). */
    public static function empreinte(User $utilisateur): string
    {
        return $utilisateur->sessions_revoquees_at?->format('U.u') ?? '0';
    }

    /** Mémorise l'empreinte dans la session courante (appelé à la connexion et à l'inscription). */
    public static function marquerOuverture(Request $request, User $utilisateur): void
    {
        if ($request->hasSession()) {
            $request->session()->put(self::CLE_SESSION, self::empreinte($utilisateur));
        }
    }
}

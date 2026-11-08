<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\OubliMotDePasseRequest;
use App\Http\Requests\Auth\ReinitialisationMotDePasseRequest;
use App\Models\User;
use App\Support\Identifiant;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Validation\ValidationException;

class MotDePasseController extends Controller
{
    /** POST /auth/mot-de-passe/oubli → 202 toujours (aucune énumération de comptes). */
    public function oubli(OubliMotDePasseRequest $request): JsonResponse
    {
        $identifiant = $request->identifiantNormalise();

        if ($identifiant !== null) {
            $utilisateur = User::query()->where(Identifiant::colonne($identifiant['type']), $identifiant['valeur'])->first();

            if ($utilisateur !== null && $utilisateur->email !== null) {
                // Jeton haché en base, 30 min, usage unique (Password broker).
                Password::broker()->sendResetLink(['email' => $utilisateur->email]);
                Audit::enregistrer('auth.mot_de_passe.oubli', $utilisateur, ['canal' => 'email'], $utilisateur);
            } elseif ($utilisateur !== null) {
                // Compte sans e-mail (téléphone seul) : SMS prévu en P2 ; on trace sans révéler.
                Log::info('auth: réinitialisation demandée pour un compte sans e-mail (SMS non disponible)');
                Audit::enregistrer('auth.mot_de_passe.oubli', $utilisateur, ['canal' => 'indisponible'], $utilisateur);
            }
        }

        return response()->json([
            'message' => 'Si un compte correspond à cet identifiant, un lien de réinitialisation vient d\'être envoyé.',
        ], 202);
    }

    /** POST /auth/mot-de-passe/reinitialisation → 200 */
    public function reinitialisation(ReinitialisationMotDePasseRequest $request): JsonResponse
    {
        $identifiant = $request->identifiantNormalise();

        $utilisateur = $identifiant === null
            ? null
            : User::query()->where(Identifiant::colonne($identifiant['type']), $identifiant['valeur'])->first();

        if ($utilisateur === null || $utilisateur->email === null) {
            throw ValidationException::withMessages(['jeton' => 'Ce lien est invalide ou a expiré. Refaites une demande.']);
        }

        $statut = Password::broker()->reset(
            [
                'email' => $utilisateur->email,
                'token' => $request->input('jeton'),
                'password' => $request->input('password'),
                'password_confirmation' => $request->input('password_confirmation'),
            ],
            function (User $user, string $password) {
                $user->forceFill(['password' => $password])->save();
                // Toute session ouverte avec l'ancien mot de passe est révoquée.
                $user->revoquerSessions();
            }
        );

        if ($statut !== Password::PASSWORD_RESET) {
            Audit::enregistrer('auth.mot_de_passe.reinitialisation_echec', $utilisateur, ['statut' => $statut], $utilisateur);

            throw ValidationException::withMessages(['jeton' => 'Ce lien est invalide ou a expiré. Refaites une demande.']);
        }

        Audit::enregistrer('auth.mot_de_passe.reinitialise', $utilisateur, [], $utilisateur);

        return response()->json(['message' => 'Mot de passe modifié. Vous pouvez vous connecter.']);
    }
}

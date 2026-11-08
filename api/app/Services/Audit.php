<?php

namespace App\Services;

use App\Models\JournalAudit;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Journal d'audit (règle n° 11) : qui, quoi, quand, d'où — jamais de secret.
 *
 * Audit::enregistrer('auth.connexion', $user, ['methode' => 'email']);
 */
class Audit
{
    /** Clés jamais conservées dans les détails, quelle que soit la casse. */
    private const CLES_INTERDITES = '/password|mot_de_passe|secret|token|jeton|uri|api_key|cle_|preimage|pin|cookie|authorization/i';

    public function __construct(private readonly BoutiqueCourante $boutiqueCourante) {}

    public function enregistrer(string $action, Model|string|null $cible = null, array $details = [], ?User $utilisateur = null, ?Request $requete = null): ?JournalAudit
    {
        try {
            $requete ??= $this->requeteCourante();
            $utilisateur ??= $requete?->user();

            [$cibleType, $cibleId] = $this->cible($cible);

            $journal = new JournalAudit;
            $journal->forceFill([
                'user_id' => $utilisateur?->id,
                'boutique_id' => $this->boutiqueIdSansException(),
                'action' => mb_substr($action, 0, 80),
                'cible_type' => $cibleType,
                'cible_id' => $cibleId,
                'ip' => $requete?->ip(),
                'user_agent' => $requete ? mb_substr((string) $requete->userAgent(), 0, 255) : null,
                'details' => $this->assainir($details) ?: null,
                'created_at' => now(),
            ])->save();

            return $journal;
        } catch (\Throwable $e) {
            // Le journal ne doit jamais faire échouer l'action métier ; on trace l'incident sans donnée.
            Log::error('audit: écriture impossible', ['action' => $action, 'erreur' => $e::class]);

            return null;
        }
    }

    /** Retire récursivement toute clé sensible et tronque les valeurs. */
    public function assainir(array $details): array
    {
        $propre = [];

        foreach ($details as $cle => $valeur) {
            if (is_string($cle) && preg_match(self::CLES_INTERDITES, $cle)) {
                continue;
            }

            if (is_array($valeur)) {
                $propre[$cle] = $this->assainir($valeur);
            } elseif (is_scalar($valeur) || $valeur === null) {
                $propre[$cle] = is_string($valeur) ? mb_substr($valeur, 0, 500) : $valeur;
            } elseif ($valeur instanceof \DateTimeInterface) {
                $propre[$cle] = $valeur->format(DATE_ATOM);
            } elseif ($valeur instanceof \BackedEnum) {
                $propre[$cle] = $valeur->value;
            } else {
                $propre[$cle] = (string) json_encode($valeur);
            }
        }

        return $propre;
    }

    private function cible(Model|string|null $cible): array
    {
        if ($cible === null) {
            return [null, null];
        }

        if (is_string($cible)) {
            return [mb_substr($cible, 0, 80), null];
        }

        $id = $cible->getAttribute('ulid') ?? $cible->getKey();

        return [mb_substr(class_basename($cible), 0, 80), $id === null ? null : mb_substr((string) $id, 0, 40)];
    }

    private function boutiqueIdSansException(): ?int
    {
        try {
            return $this->boutiqueCourante->id();
        } catch (\Throwable) {
            return null;
        }
    }

    private function requeteCourante(): ?Request
    {
        if (app()->runningInConsole() && ! app()->runningUnitTests()) {
            return null;
        }

        return app()->bound('request') ? app('request') : null;
    }
}

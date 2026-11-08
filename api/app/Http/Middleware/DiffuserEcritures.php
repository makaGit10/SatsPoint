<?php

namespace App\Http\Middleware;

use App\Services\BoutiqueCourante;
use App\Services\Diffuseur;
use Closure;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Database\Events\TransactionRolledBack;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;

/**
 * Point d'émission UNIQUE des signaux temps réel pour les requêtes HTTP (DIRECTIVES § 3).
 *
 * - Compte les écritures RÉELLES (INSERT / UPDATE / DELETE) observées via DB::listen,
 *   indépendamment de la méthode HTTP.
 * - Ne retient que les tables métier connues (config satspoint.temps_reel.tables) ;
 *   les écritures techniques (sessions, cache, jobs, journal_audit, …) sont ignorées.
 * - Émet APRÈS la réponse (terminate), une fois par rubrique touchée.
 * - Un échec d'émission est journalisé et ne fait jamais échouer la requête.
 */
class DiffuserEcritures
{
    private const MARQUEUR_ECOUTE = 'satspoint.diffuser.ecoute';

    /** @var array<string, true> tables métier écrites pendant la requête courante */
    private static array $tablesEcrites = [];

    private const MOTIF_ECRITURE = '/^\s*(?:insert\s+into|update|delete\s+from)\s+(?:only\s+)?["`]?([a-zA-Z0-9_]+)["`]?/i';

    public function __construct(
        private readonly Diffuseur $diffuseur,
        private readonly BoutiqueCourante $boutiqueCourante,
    ) {}

    public function handle(Request $request, Closure $next): Response
    {
        self::$tablesEcrites = [];
        $this->installerEcoute();

        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        $tables = array_keys(self::$tablesEcrites);
        self::$tablesEcrites = [];

        if ($tables === []) {
            return;
        }

        try {
            $this->emettre($request, $tables);
        } catch (\Throwable $e) {
            Log::warning('temps-reel: middleware en échec', ['erreur' => $e::class, 'detail' => mb_substr($e->getMessage(), 0, 200)]);
        }
    }

    /** @param  list<string>  $tables */
    private function emettre(Request $request, array $tables): void
    {
        $correspondances = (array) config('satspoint.temps_reel.tables', []);
        $auteur = $request->user()?->ulid;
        $emis = [];

        foreach ($tables as $table) {
            $cible = $correspondances[$table] ?? null;

            if ($cible === null) {
                continue;
            }

            $cle = $cible['canal'].':'.$cible['rubrique'];

            if (isset($emis[$cle])) {
                continue;
            }

            $emis[$cle] = true;

            match ($cible['canal']) {
                'boutique' => $this->emettreBoutique($cible['rubrique'], $auteur),
                'utilisateur' => $this->emettreUtilisateur($request, $cible['rubrique'], $auteur),
                'plateforme' => $this->diffuseur->plateforme($cible['rubrique'], $auteur),
                'admin' => $this->diffuseur->admin($cible['rubrique'], $auteur),
                default => null,
            };
        }
    }

    private function emettreBoutique(string $rubrique, ?string $auteur): void
    {
        $boutique = null;

        try {
            $boutique = $this->boutiqueCourante->obtenir();
        } catch (\Throwable) {
            // pas de boutique résolue : aucun destinataire
        }

        if ($boutique !== null) {
            $this->diffuseur->rubrique($boutique, $rubrique, $auteur);
        }
    }

    private function emettreUtilisateur(Request $request, string $rubrique, ?string $auteur): void
    {
        $utilisateur = $request->user();

        if ($utilisateur !== null) {
            $this->diffuseur->utilisateur($utilisateur, $rubrique, $auteur);
        }
    }

    private function installerEcoute(): void
    {
        // Une seule écoute par instance d'application (persistante en mode worker, neuve à chaque test).
        if (app()->bound(self::MARQUEUR_ECOUTE)) {
            return;
        }

        app()->instance(self::MARQUEUR_ECOUTE, true);

        DB::listen(function (QueryExecuted $requete) {
            if (preg_match(self::MOTIF_ECRITURE, $requete->sql, $m) === 1) {
                self::$tablesEcrites[strtolower($m[1])] = true;
            }
        });

        // Une transaction annulée n'a rien écrit : on oublie les écritures observées.
        Event::listen(TransactionRolledBack::class, function () {
            self::$tablesEcrites = [];
        });
    }

    /** Pour les tests : réinitialise l'état statique. */
    public static function reinitialiser(): void
    {
        self::$tablesEcrites = [];
    }
}

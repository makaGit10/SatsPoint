<?php

use App\Exceptions\BoutiqueCouranteAbsente;
use App\Exceptions\ErreurMetier;
use App\Http\Controllers\SanteController;
use App\Http\Middleware\DiffuserEcritures;
use App\Http\Middleware\EnTetesSecurite;
use App\Http\Middleware\ExigerDeuxFacteurs;
use App\Http\Middleware\ExigerSuperAdmin;
use App\Http\Middleware\VerifierBoutiqueActive;
use App\Http\Middleware\VerifierSessionRevoquee;
use App\Http\Middleware\VerifierSignaturePasserelle;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Route;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        channels: __DIR__.'/../routes/channels.php',
        health: '/up',
        then: function () {
            // Routes internes réservées à la passerelle Lightning (HMAC obligatoire) et santé.
            Route::middleware(['api', 'hmac.passerelle', 'throttle:interne'])
                ->prefix('internal')
                ->group(base_path('routes/internal.php'));

            Route::middleware(['api', 'throttle:sante'])
                ->get('/sante', SanteController::class)
                ->name('sante');

            // Reçu public, page de paiement simulé, webhooks PayTech : groupe « api » (sans CSRF), throttles dédiés.
            Route::middleware(['api'])->group(base_path('routes/public.php'));
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Caddy (même conteneur) et le réseau Docker sont les seuls mandataires de confiance.
        // TRUSTED_PROXIES (liste d'IP/CIDR séparées par des virgules, ou « * » = le seul pair TCP direct)
        // remplace cette liste chez un hébergeur dont le répartiteur termine TLS (Render).
        $mandataires = trim((string) env('TRUSTED_PROXIES', ''));
        $middleware->trustProxies(at: match (true) {
            $mandataires === '*' => '*',
            $mandataires !== '' => array_values(array_filter(array_map('trim', explode(',', $mandataires)))),
            default => ['127.0.0.1', '::1', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'],
        });

        // Sessions SPA par cookie (Sanctum) pour les requêtes venant du front.
        $middleware->statefulApi();

        // En-têtes de sécurité sur TOUTES les réponses.
        $middleware->append(EnTetesSecurite::class);

        // Signal temps réel : un seul point d'émission, après la réponse, si écriture métier réelle.
        $middleware->api(append: [DiffuserEcritures::class]);

        $middleware->alias([
            'hmac.passerelle' => VerifierSignaturePasserelle::class,
            'session.valide' => VerifierSessionRevoquee::class,
            'boutique.active' => VerifierBoutiqueActive::class,
            '2fa.obligatoire' => ExigerDeuxFacteurs::class,
            'super.admin' => ExigerSuperAdmin::class,
        ]);

        // Console plateforme : rôle et 2FA vérifiés AVANT la résolution des paramètres de route
        // (pas de 404 « existe / n'existe pas » pour qui n'a pas le droit d'entrer).
        $middleware->prependToPriorityList(SubstituteBindings::class, ExigerSuperAdmin::class);
        $middleware->prependToPriorityList(SubstituteBindings::class, ExigerDeuxFacteurs::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function (Request $request) {
            return $request->is('api/*') || $request->is('internal/*') || $request->is('sante')
                || $request->is('broadcasting/*') || $request->is('webhooks/*') || $request->is('paiement-simule/*')
                || ($request->is('r/*') && ! is_file(rtrim((string) config('satspoint.web_dist'), '/').'/index.html'))
                || $request->expectsJson();
        });

        $json = fn (string $message, string $code, int $statut, array $extra = []) => response()->json(
            array_merge(['message' => $message, 'code' => $code], $extra),
            $statut
        );

        $exceptions->render(fn (ValidationException $e, Request $request) => $request->expectsJson() || $request->is('api/*')
            ? $json('Certaines informations sont invalides.', 'VALIDATION', 422, ['errors' => $e->errors()])
            : null);

        $exceptions->render(fn (AuthenticationException $e, Request $request) => $request->expectsJson() || $request->is('api/*')
            ? $json('Connexion requise.', 'NON_AUTHENTIFIE', 401)
            : null);

        $exceptions->render(fn (AuthorizationException|AccessDeniedHttpException $e, Request $request) => $request->expectsJson() || $request->is('api/*') || $request->is('broadcasting/*')
            ? $json('Action non autorisée.', 'INTERDIT', 403)
            : null);

        $exceptions->render(fn (ModelNotFoundException|NotFoundHttpException $e, Request $request) => $request->expectsJson() || $request->is('api/*') || $request->is('internal/*')
            ? $json('Ressource introuvable.', 'INTROUVABLE', 404)
            : null);

        $exceptions->render(fn (MethodNotAllowedHttpException $e, Request $request) => $request->expectsJson() || $request->is('api/*')
            ? $json('Méthode non autorisée.', 'METHODE_INTERDITE', 405)
            : null);

        $exceptions->render(function (ThrottleRequestsException $e, Request $request) use ($json) {
            $attente = (int) ($e->getHeaders()['Retry-After'] ?? 60);

            return $json("Trop de tentatives. Réessayez dans {$attente} secondes.", 'TROP_DE_TENTATIVES', 429)
                ->withHeaders($e->getHeaders());
        });

        $exceptions->render(fn (BoutiqueCouranteAbsente $e, Request $request) => $request->expectsJson() || $request->is('api/*')
            ? $json('Aucune boutique n\'est associée à ce compte.', 'BOUTIQUE_ABSENTE', 404)
            : null);

        // Erreurs métier (cours indisponible, portefeuille, PayTech, transitions interdites…) : message utile + code stable.
        $exceptions->render(fn (ErreurMetier $e, Request $request) => $request->expectsJson() || $request->is('api/*')
            ? $json($e->getMessage(), $e->codeErreur, $e->statutHttp)
            : null);

        // Toute autre erreur HTTP : message générique, détails dans les logs uniquement (règle n° 7).
        $exceptions->render(function (HttpExceptionInterface $e, Request $request) use ($json) {
            if (! ($request->expectsJson() || $request->is('api/*') || $request->is('internal/*'))) {
                return null;
            }

            $statut = $e->getStatusCode();

            return $json(
                $statut >= 500 ? 'Une erreur interne est survenue.' : ($e->getMessage() ?: 'Requête refusée.'),
                $statut >= 500 ? 'ERREUR_INTERNE' : 'REQUETE_REFUSEE',
                $statut
            )->withHeaders($e->getHeaders());
        });

        $exceptions->dontReport([BoutiqueCouranteAbsente::class, ErreurMetier::class]);
    })->create();

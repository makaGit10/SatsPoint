<?php

namespace App\Providers;

use App\Models\Article;
use App\Models\Boutique;
use App\Models\Invitation;
use App\Models\Membre;
use App\Models\Paiement;
use App\Models\Vente;
use App\Policies\ArticlePolicy;
use App\Policies\BoutiquePolicy;
use App\Policies\InvitationPolicy;
use App\Policies\MembrePolicy;
use App\Policies\PaiementPolicy;
use App\Policies\VentePolicy;
use App\Services\BoutiqueCourante;
use App\Services\ChiffrementDonnees;
use App\Services\PasserelleLightning;
use App\Services\SignatureHmac;
use App\Support\Identifiant;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(ChiffrementDonnees::class, fn () => new ChiffrementDonnees(config('satspoint.cle_donnees')));

        $this->app->scoped(BoutiqueCourante::class);

        $this->app->singleton(SignatureHmac::class, fn () => new SignatureHmac((string) config('satspoint.passerelle.secret')));

        $this->app->singleton(PasserelleLightning::class, fn ($app) => new PasserelleLightning(
            (string) config('satspoint.passerelle.url'),
            $app->make(SignatureHmac::class),
            (int) config('satspoint.passerelle.delai_s', 15),
        ));
    }

    public function boot(): void
    {
        // Refus par défaut : aucune assignation en masse hors $fillable, pas de chargement paresseux silencieux.
        Model::preventLazyLoading(! $this->app->isProduction());
        Model::preventSilentlyDiscardingAttributes(! $this->app->isProduction());

        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        Password::defaults(fn () => Password::min((int) config('satspoint.mot_de_passe.longueur_min', 12))->uncompromised());

        Gate::policy(Boutique::class, BoutiquePolicy::class);
        Gate::policy(Membre::class, MembrePolicy::class);
        Gate::policy(Invitation::class, InvitationPolicy::class);
        Gate::policy(Vente::class, VentePolicy::class);
        Gate::policy(Paiement::class, PaiementPolicy::class);
        Gate::policy(Article::class, ArticlePolicy::class);

        $this->definirLimitesDeDebit();
    }

    /** Limitation de débit (CAHIER § 13.2), stockée dans le cache (Redis en exploitation). */
    private function definirLimitesDeDebit(): void
    {
        $parIdentifiant = function (Request $request): string {
            $normalise = Identifiant::normaliser($request->input('identifiant'));

            return 'id:'.hash('sha256', $normalise['valeur'] ?? mb_strtolower(trim((string) $request->input('identifiant'))));
        };

        // Connexion : 5 / min par identifiant + 20 / min par IP, puis blocage progressif (30 / h par identifiant).
        RateLimiter::for('connexion', fn (Request $request) => [
            Limit::perMinute(5)->by($parIdentifiant($request)),
            Limit::perHour(30)->by('h:'.$parIdentifiant($request)),
            Limit::perMinute(20)->by('ip:'.$request->ip()),
        ]);

        // Mot de passe oublié : 3 / heure par identifiant (+ garde-fou par IP contre l'énumération).
        RateLimiter::for('oubli', fn (Request $request) => [
            Limit::perHour(3)->by($parIdentifiant($request)),
            Limit::perHour(15)->by('ip:'.$request->ip()),
        ]);

        RateLimiter::for('reinitialisation', fn (Request $request) => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
        ]);

        RateLimiter::for('inscription', fn (Request $request) => [
            Limit::perHour(10)->by('ip:'.$request->ip()),
        ]);

        RateLimiter::for('invitations', fn (Request $request) => [
            Limit::perHour(20)->by('u:'.($request->user()?->id ?? $request->ip())),
        ]);

        RateLimiter::for('invitations-accepter', fn (Request $request) => [
            Limit::perMinute(10)->by('ip:'.$request->ip()),
        ]);

        // Espace connecté : limite générale par utilisateur.
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by('u:'.($request->user()?->id ?? $request->ip())));

        // Points publics (config, manifeste audio) : par IP.
        RateLimiter::for('public', fn (Request $request) => Limit::perMinute(120)->by('ip:'.$request->ip()));

        RateLimiter::for('sante', fn (Request $request) => Limit::perMinute(60)->by('ip:'.$request->ip()));

        // Passerelle interne : par IP (réseau Docker).
        RateLimiter::for('interne', fn (Request $request) => Limit::perMinute(600)->by('ip:'.$request->ip()));

        // Limites prévues par le cahier pour les modules à venir (définies dès maintenant, règle n° 12).
        RateLimiter::for('ventes', fn (Request $request) => Limit::perMinute(30)->by('u:'.($request->user()?->id ?? $request->ip())));
        RateLimiter::for('verification-paiement', function (Request $request) {
            $paiement = $request->route('paiement');
            $cle = $paiement instanceof Model ? $paiement->getKey() : ($paiement ?? $request->ip());

            return Limit::perMinute(20)->by('p:'.$cle);
        });
        RateLimiter::for('webhook-paytech', fn (Request $request) => Limit::perMinute(60)->by('b:'.($request->route('boutique_ulid') ?? $request->ip())));
        RateLimiter::for('recherche', fn (Request $request) => Limit::perMinute(60)->by('u:'.($request->user()?->id ?? $request->ip())));
        RateLimiter::for('upload-audio', fn (Request $request) => Limit::perHour(120)->by('u:'.($request->user()?->id ?? $request->ip())));
        RateLimiter::for('recu-public', fn (Request $request) => Limit::perMinute(60)->by('ip:'.$request->ip()));

        // Vague 2 : envois de sats (aperçu + envoi), configuration portefeuille / PayTech, exports.
        RateLimiter::for('wallet-envoi', fn (Request $request) => Limit::perMinute(10)->by('u:'.($request->user()?->id ?? $request->ip())));
        RateLimiter::for('configuration', fn (Request $request) => Limit::perMinute(10)->by('u:'.($request->user()?->id ?? $request->ip())));
        RateLimiter::for('exports', fn (Request $request) => Limit::perMinute(6)->by('u:'.($request->user()?->id ?? $request->ip())));
    }
}

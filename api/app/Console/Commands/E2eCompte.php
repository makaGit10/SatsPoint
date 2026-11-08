<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Tests de bout en bout (Playwright) — environnement LOCAL uniquement.
 *
 * Crée un compte de test (nom préfixé `TEST-E2E-…`, e-mail en `.test`, mot de passe aléatoire) sans passer
 * par la limite de 10 inscriptions / heure / IP, et l'affiche en JSON sur la sortie standard. La boutique et
 * le portefeuille sont ensuite créés par le test via l'API réelle (`POST /boutique`, `PUT /boutique/wallet`).
 * Rien n'est jamais écrit dans un fichier. `--super-admin` crée un super-admin de test (2FA à activer par le test).
 */
class E2eCompte extends Command
{
    protected $signature = 'e2e:compte {prefixe : préfixe obligatoire, ex. TEST-E2E-2026-11-08} {--nom= : nom affiché (après le préfixe)} {--super-admin}';

    protected $description = '[local] Crée un compte de test e2e (TEST-E2E-…) et affiche { ulid, identifiant, password } en JSON.';

    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('Commande réservée à APP_ENV=local.');

            return self::FAILURE;
        }

        $prefixe = (string) $this->argument('prefixe');
        if (! str_starts_with($prefixe, 'TEST-E2E-') || preg_match('/^[A-Za-z0-9-]{9,40}$/', $prefixe) !== 1) {
            $this->error('Le préfixe doit commencer par TEST-E2E- (lettres, chiffres, tirets).');

            return self::FAILURE;
        }

        $suffixe = Str::lower(Str::random(8));
        $email = Str::lower($prefixe).'-'.$suffixe.'@e2e.satspoint.test';
        $motDePasse = Str::password(20, symbols: false);

        $user = new User([
            'nom' => trim($prefixe.' '.($this->option('nom') ?: $suffixe)),
            'email' => $email,
            'password' => $motDePasse,
        ]);
        $user->preferences = ['locale' => 'fr', 'langue_audio' => 'wo', 'theme' => 'auto', 'aide_vocale' => false];
        if ($this->option('super-admin')) {
            $user->role_plateforme = User::ROLE_SUPER_ADMIN;
        }
        $user->save();

        $this->line(json_encode(['ulid' => $user->ulid, 'identifiant' => $email, 'password' => $motDePasse], JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }
}

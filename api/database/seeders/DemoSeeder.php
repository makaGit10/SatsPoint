<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\Boutique;
use App\Models\ComptePaytech;
use App\Models\ConnexionWallet;
use App\Models\Membre;
use App\Models\User;
use App\Services\BoutiqueCourante;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Données de démonstration — IDEMPOTENT (relancé à chaque démarrage du conteneur).
 *
 * - Super-admin depuis SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD (mot de passe généré et affiché UNE fois s'il est vide).
 * - « Boutique Démo » (Dakar) avec un propriétaire et un caissier (DEMO_PASSWORD, idem si vide).
 * - Quelques articles. Aucune vente factice.
 * - Portefeuille : DEMO_NWC_URI si fourni, sinon mock://demo. PayTech si clés fournies.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $courante = app(BoutiqueCourante::class);

        DB::transaction(function () use ($courante) {
            $this->superAdmin();

            $motDePasseDemo = $this->motDePasse(config('satspoint.demo.mot_de_passe'), 'démo (propriétaire et caissier)');

            $proprietaire = $this->utilisateur(config('satspoint.demo.email_proprietaire'), 'Awa Ndiaye', $motDePasseDemo['valeur'], $motDePasseDemo['forcer']);
            $caissier = $this->utilisateur(config('satspoint.demo.email_caissier'), 'Moussa Diop', $motDePasseDemo['valeur'], $motDePasseDemo['forcer']);
            $gerant = $this->utilisateur(config('satspoint.demo.email_gerant'), 'Fatou Sow', $motDePasseDemo['valeur'], $motDePasseDemo['forcer']);

            $boutique = $this->boutique($proprietaire);

            $courante->pour($boutique, function (Boutique $boutique) use ($proprietaire, $caissier, $gerant) {
                $this->membre($boutique, $proprietaire, Membre::ROLE_PROPRIETAIRE);
                $this->membre($boutique, $gerant, Membre::ROLE_GERANT, $proprietaire);
                $this->membre($boutique, $caissier, Membre::ROLE_CAISSIER, $proprietaire);
                $this->articles();
                $this->portefeuille();
                $this->paytech();
            });
        });

        $courante->oublier();

        $this->command?->info(sprintf(
            '[satspoint] Démo prête : %s (propriétaire), %s (caissier) — boutique « %s ».',
            config('satspoint.demo.email_proprietaire'),
            config('satspoint.demo.email_caissier'),
            config('satspoint.demo.nom_boutique'),
        ));
    }

    // ------------------------------------------------------------------

    private function superAdmin(): void
    {
        $email = mb_strtolower(trim((string) config('satspoint.superadmin.email')));

        if ($email === '') {
            return;
        }

        $motDePasse = $this->motDePasse(config('satspoint.superadmin.mot_de_passe'), "super-admin ({$email})", User::query()->where('email', $email)->exists());

        $admin = $this->utilisateur($email, 'Super-admin SatsPoint', $motDePasse['valeur'], $motDePasse['forcer']);

        if (! $admin->estSuperAdmin()) {
            $admin->forceFill(['role_plateforme' => User::ROLE_SUPER_ADMIN])->save();
        }
    }

    /**
     * @return array{valeur: ?string, forcer: bool} forcer = réécrire le hash (mot de passe venu de l'env ou généré)
     */
    private function motDePasse(?string $depuisEnv, string $libelle, bool $compteExiste = false): array
    {
        if (filled($depuisEnv)) {
            return ['valeur' => $depuisEnv, 'forcer' => true];
        }

        if ($compteExiste) {
            // Compte déjà présent et aucun mot de passe fourni : on ne touche à rien.
            return ['valeur' => null, 'forcer' => false];
        }

        $genere = Str::password(20, symbols: false);

        $this->command?->warn("[satspoint] ATTENTION : aucun mot de passe fourni pour {$libelle}. Mot de passe généré (affiché une seule fois) : {$genere}");
        $this->command?->warn('[satspoint] Renseignez-le dans .env pour le figer, ou changez-le dès la première connexion.');

        return ['valeur' => $genere, 'forcer' => true];
    }

    private function utilisateur(string $email, string $nom, ?string $motDePasse, bool $forcerMotDePasse): User
    {
        $email = mb_strtolower(trim($email));
        $utilisateur = User::query()->where('email', $email)->first();

        if ($utilisateur === null) {
            $utilisateur = new User([
                'nom' => $nom,
                'email' => $email,
                'password' => $motDePasse ?? Str::password(32),
                'preferences' => config('satspoint.preferences_defaut'),
            ]);
            $utilisateur->save();

            return $utilisateur;
        }

        if ($forcerMotDePasse && $motDePasse !== null && ! Hash::check($motDePasse, $utilisateur->password)) {
            $utilisateur->forceFill(['password' => $motDePasse])->save();
        }

        return $utilisateur;
    }

    private function boutique(User $proprietaire): Boutique
    {
        $boutique = Boutique::query()
            ->where('nom', config('satspoint.demo.nom_boutique'))
            ->where('cree_par', $proprietaire->id)
            ->first();

        if ($boutique !== null) {
            return $boutique;
        }

        $boutique = new Boutique([
            'nom' => config('satspoint.demo.nom_boutique'),
            'telephone' => '+221771234567',
            'ville' => 'Dakar',
            'fuseau' => config('satspoint.boutique.fuseau'),
            'devise' => config('satspoint.boutique.devise'),
            'reglages' => array_merge(config('satspoint.boutique.reglages_defaut'), [
                'moyens' => ['lightning' => true, 'paytech' => filled(config('satspoint.paytech.api_key')), 'wave_manuel' => true],
                'message_recu' => 'Merci de votre visite — Boutique Démo, marché HLM, Dakar.',
            ]),
        ]);
        $boutique->forceFill(['statut' => Boutique::STATUT_ACTIVE, 'cree_par' => $proprietaire->id])->save();

        return $boutique;
    }

    private function membre(Boutique $boutique, User $utilisateur, string $role, ?User $invitant = null): void
    {
        $membre = Membre::query()->where('user_id', $utilisateur->id)->first();

        if ($membre === null) {
            $membre = new Membre(['user_id' => $utilisateur->id, 'role' => $role, 'actif' => true, 'invite_par' => $invitant?->id]);
            $membre->boutique_id = $boutique->id;
            $membre->save();

            return;
        }

        if ($membre->role !== $role || ! $membre->actif) {
            $membre->fill(['role' => $role, 'actif' => true])->save();
        }
    }

    private function articles(): void
    {
        $articles = [
            ['nom' => 'Café Touba', 'prix_xof' => 200, 'categorie' => 'Boissons', 'couleur' => '#92400E', 'pictogramme' => 'cafe', 'position' => 1],
            ['nom' => 'Bissap', 'prix_xof' => 300, 'categorie' => 'Boissons', 'couleur' => '#BE123C', 'pictogramme' => 'jus', 'position' => 2],
            ['nom' => 'Eau minérale 1,5 L', 'prix_xof' => 500, 'categorie' => 'Boissons', 'couleur' => '#0284C7', 'pictogramme' => 'eau', 'position' => 3],
            ['nom' => 'Thiéboudienne', 'prix_xof' => 1500, 'categorie' => 'Plats', 'couleur' => '#D97706', 'pictogramme' => 'plat', 'position' => 4],
            ['nom' => 'Yassa poulet', 'prix_xof' => 2000, 'categorie' => 'Plats', 'couleur' => '#CA8A04', 'pictogramme' => 'poulet', 'position' => 5],
            ['nom' => 'Pain', 'prix_xof' => 150, 'categorie' => 'Boulangerie', 'couleur' => '#A16207', 'pictogramme' => 'pain', 'position' => 6],
            ['nom' => 'Beignets (x3)', 'prix_xof' => 250, 'categorie' => 'Boulangerie', 'couleur' => '#F59E0B', 'pictogramme' => 'gateau', 'position' => 7],
            ['nom' => 'Pagne wax (2 m)', 'prix_xof' => 6000, 'categorie' => 'Tissus', 'couleur' => '#7C3AED', 'pictogramme' => 'tissu', 'position' => 8],
        ];

        foreach ($articles as $donnees) {
            $article = Article::query()->firstOrCreate(['nom' => $donnees['nom']], $donnees + ['actif' => true]);
            // Boutiques de démo créées avant les pictogrammes : on les complète sans toucher au reste.
            if ($article->pictogramme === null) {
                $article->forceFill(['pictogramme' => $donnees['pictogramme']])->save();
            }
        }
    }

    private function portefeuille(): void
    {
        $uri = filled(config('satspoint.demo.nwc_uri')) ? (string) config('satspoint.demo.nwc_uri') : 'mock://demo';

        $connexion = ConnexionWallet::query()->first();

        if ($connexion === null) {
            ConnexionWallet::create([
                'uri_chiffree' => $uri,
                'statut' => ConnexionWallet::STATUT_ACTIVE,
                // Portefeuille de démo sans permission d'envoi (CAHIER § 16) : lecture et factures seulement.
                'permissions' => ['make_invoice', 'lookup_invoice', 'get_balance', 'list_transactions'],
                'budget_sats' => 0,
            ]);

            return;
        }

        // On ne réécrit le chiffré que si l'URI a changé (évite une écriture à chaque démarrage).
        if (! hash_equals((string) $connexion->uri_chiffree, $uri)) {
            $connexion->fill(['uri_chiffree' => $uri, 'statut' => ConnexionWallet::STATUT_ACTIVE, 'verifiee_at' => null])->save();
        }
    }

    private function paytech(): void
    {
        $cle = config('satspoint.paytech.api_key');
        $secret = config('satspoint.paytech.api_secret');

        if (blank($cle) || blank($secret)) {
            return;
        }

        $env = config('satspoint.paytech.env') === ComptePaytech::ENV_PROD ? ComptePaytech::ENV_PROD : ComptePaytech::ENV_TEST;
        $compte = ComptePaytech::query()->first();

        if ($compte === null) {
            ComptePaytech::create([
                'api_key_chiffree' => $cle,
                'api_secret_chiffree' => $secret,
                'environnement' => $env,
                'statut' => ComptePaytech::STATUT_ACTIF,
            ]);

            return;
        }

        $change = ! hash_equals((string) $compte->api_key_chiffree, (string) $cle)
            || ! hash_equals((string) $compte->api_secret_chiffree, (string) $secret)
            || $compte->environnement !== $env;

        if ($change) {
            $compte->fill([
                'api_key_chiffree' => $cle,
                'api_secret_chiffree' => $secret,
                'environnement' => $env,
                'statut' => ComptePaytech::STATUT_ACTIF,
                'verifie_at' => null,
            ])->save();
        }
    }
}

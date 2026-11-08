<?php

use App\Models\Boutique;
use App\Models\ConnexionWallet;
use App\Models\Membre;
use App\Models\Paiement;
use App\Models\SequenceVente;
use App\Models\User;
use App\Models\Vente;
use App\Services\BoutiqueCourante;
use App\Services\CoursChange;
use Illuminate\Contracts\Events\Dispatcher;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Factory;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/*
|--------------------------------------------------------------------------
| Pest — configuration des tests SatsPoint
|--------------------------------------------------------------------------
*/

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

pest()->extend(TestCase::class)->in('Unit');

/*
|--------------------------------------------------------------------------
| Fonctions d'aide
|--------------------------------------------------------------------------
*/

const MDP_TEST = 'MotDePasseTest-2026!';

/**
 * Crée une boutique avec un membre du rôle demandé.
 *
 * @return array{boutique: Boutique, user: User, membre: Membre}
 */
function boutiqueAvec(string $role = Membre::ROLE_PROPRIETAIRE, ?Boutique $boutique = null, ?User $user = null): array
{
    $boutique ??= Boutique::factory()->create();
    $user ??= User::factory()->create();

    $membre = Membre::factory()->create([
        'boutique_id' => $boutique->id,
        'user_id' => $user->id,
        'role' => $role,
        'actif' => true,
    ]);

    return ['boutique' => $boutique, 'user' => $user, 'membre' => $membre->setRelation('boutique', $boutique)->setRelation('user', $user)];
}

/** Connecte un utilisateur (session web) et réinitialise la boutique courante. */
function connecte(User $user): TestCase
{
    app(BoutiqueCourante::class)->oublier();
    // Les gardes (dont le RequestGuard de Sanctum) mémorisent l'utilisateur : on repart de zéro.
    app('auth')->forgetGuards();
    test()->flushSession();

    return test()->actingAs($user, 'web');
}

/** Exécute $callback avec une boutique courante explicite (comme un job ou un seeder). */
function avecBoutique(Boutique $boutique, Closure $callback): mixed
{
    return app(BoutiqueCourante::class)->pour($boutique, $callback);
}

/*
|--------------------------------------------------------------------------
| Vague 2 : cours, passerelle simulée, ventes et paiements de test
|--------------------------------------------------------------------------
*/

const COURS_TEST = 44_000_000; // 1 BTC = 44 000 000 XOF → 100 FCFA = ⌈227,27⌉ = 228 sats

const HASH_TEST = 'ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12ab12';

/** Dépose un cours frais dans le cache (comme la commande planifiée) ; $ageS pour simuler un cours ancien. */
function coursDisponible(int $btcXof = COURS_TEST, int $ageS = 0, int $sources = 3): void
{
    Cache::put(CoursChange::CLE_CACHE, [
        'btc_eur' => $btcXof / 655.957,
        'btc_xof' => $btcXof,
        'sources' => $sources,
        'recupere_at' => time() - $ageS,
    ], 3600);
}

/**
 * Repart d'un client HTTP vierge : Http::fake() empile les stubs et le PREMIER qui correspond gagne,
 * donc redéfinir une réponse pour la même URL exige de tout réinitialiser.
 */
function httpFraiche(): void
{
    Http::swap(new Factory(app(Dispatcher::class)));
    Http::preventStrayRequests();
    Http::fake(['api.pwnedpasswords.com/*' => fn () => Http::response(TestCase::$corpsHibp, 200)]);
}

/**
 * Passerelle Lightning simulée (Http::fake, client réinitialisé). $facture surcharge la réponse du lookup.
 * La première facture créée porte HASH_TEST, les suivantes un hash aléatoire (unicité en base).
 * Les motifs couvrent le contrat § 2 ; toute autre requête sortante reste interdite (preventStrayRequests).
 */
function passerelleFake(array $facture = [], array $autres = []): void
{
    httpFraiche();

    $lookup = array_merge(['payment_hash' => HASH_TEST, 'statut' => 'en_attente', 'montant_msats' => 228_000, 'expire_le' => now()->addMinutes(5)->toIso8601String()], $facture);

    Http::fake(array_merge([
        '*/sante' => Http::response(['ok' => true, 'connexions' => 1, 'mock' => true, 'uptime_s' => 1]),
        '*/connexions/*/factures/*' => Http::response($lookup),
        '*/connexions/*/factures' => function () {
            $dejaUtilise = Paiement::toutesBoutiques()->where('payment_hash', HASH_TEST)->exists();

            return Http::response([
                'bolt11' => 'lnbcrt2280n1testfacture', 'payment_hash' => $dejaUtilise ? bin2hex(random_bytes(32)) : HASH_TEST, 'montant_msats' => 228_000,
                'cree_le' => now()->toIso8601String(), 'expire_le' => now()->addMinutes(5)->toIso8601String(),
            ]);
        },
        '*/connexions/*/solde' => Http::response(['msats' => 100_000_000]),
        '*/connexions/*/transactions*' => Http::response(['transactions' => [
            ['type' => 'entrante', 'statut' => 'reglee', 'montant_msats' => 228_000, 'frais_msats' => 0, 'description' => 'SatsPoint · Test · V-000001', 'payment_hash' => HASH_TEST, 'regle_le' => now()->toIso8601String(), 'cree_le' => now()->toIso8601String()],
        ]]),
        '*/connexions/*/paiements/apercu' => Http::response(['type' => 'bolt11', 'montant_msats' => 1_000_000, 'description' => 'café', 'payment_hash' => HASH_TEST]),
        '*/connexions/*/paiements' => Http::response(['payment_hash' => HASH_TEST, 'preimage' => str_repeat('c', 64), 'frais_msats' => 1_000, 'montant_msats' => 1_000_000]),
        '*/mock/*/payer/*' => Http::response(['ok' => true]),
        '*/connexions/*' => Http::response(['pubkey' => str_repeat('a', 64), 'relais' => ['wss://relay.test'], 'alias' => 'Portefeuille test', 'methods' => ['make_invoice', 'lookup_invoice', 'get_balance', 'list_transactions', 'pay_invoice'], 'notifications' => ['payment_received'], 'lud16' => 'demo@test.ln', 'mock' => true, 'connecte' => true]),
    ], $autres));
}

/** Boutique avec propriétaire, portefeuille connecté (mock://demo par défaut) et tous les moyens actifs. */
function boutiquePrete(string $uri = 'mock://demo', array $reglages = []): array
{
    $contexte = boutiqueAvec('proprietaire');
    $boutique = $contexte['boutique'];
    $boutique->fill(['reglages' => array_replace_recursive(config('satspoint.boutique.reglages_defaut'), [
        'moyens' => ['lightning' => true, 'paytech' => true, 'wave_manuel' => true],
        'wave_lien' => 'https://pay.wave.com/m/M_test/c/sn/',
    ], $reglages)])->save();

    avecBoutique($boutique, fn () => ConnexionWallet::create([
        'uri_chiffree' => $uri, 'statut' => 'active',
        'permissions' => ['make_invoice', 'lookup_invoice', 'get_balance', 'list_transactions', 'pay_invoice'],
    ]));

    return $contexte;
}

/** Vente en attente avec une tentative (lightning par défaut), créée directement en base. */
function venteAvecTentative(Boutique $boutique, User $caissier, string $methode = 'lightning', array $paiement = [], array $vente = []): array
{
    return avecBoutique($boutique, function () use ($boutique, $caissier, $methode, $paiement, $vente) {
        // Premier paiement Lightning : HASH_TEST (attendu par les lookups simulés) ; suivants : hash aléatoire.
        $hash = Paiement::toutesBoutiques()->where('payment_hash', HASH_TEST)->exists() ? bin2hex(random_bytes(32)) : HASH_TEST;

        $v = new Vente(array_merge([
            'numero' => SequenceVente::suivant($boutique->id), 'caissier_id' => $caissier->id,
            'montant_xof' => 100, 'statut' => 'en_attente',
        ], $vente));
        $v->save();

        $p = Paiement::create(array_merge([
            'vente_id' => $v->id, 'methode' => $methode, 'statut' => 'en_attente', 'montant_xof' => $v->montant_xof,
            'montant_sats' => $methode === 'lightning' ? 228 : null,
            'cours_xof_par_btc' => $methode === 'lightning' ? COURS_TEST : null,
            'bolt11' => $methode === 'lightning' ? 'lnbcrt2280n1testfacture' : null,
            'payment_hash' => $methode === 'lightning' ? $hash : null,
            'expire_at' => $methode === 'wave_manuel' ? null : now()->addMinutes(5),
            'operateur' => $methode === 'wave_manuel' ? 'wave' : null,
            'simule' => $methode !== 'wave_manuel',
        ], $paiement));

        return ['vente' => $v, 'paiement' => $p];
    });
}

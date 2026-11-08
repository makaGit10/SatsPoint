<?php

use App\Models\CoursChange as CoursChangeModel;
use App\Services\CoursChange;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

function sourcesFake(?float $kraken = 68_000.0, ?float $bitstamp = 68_100.0, ?float $coingecko = 68_050.0): void
{
    Http::fake([
        'api.kraken.com/*' => $kraken === null ? Http::response('', 500) : Http::response(['error' => [], 'result' => ['XXBTZEUR' => ['c' => [(string) $kraken, '1.0']]]]),
        'www.bitstamp.net/*' => $bitstamp === null ? Http::response('', 503) : Http::response(['last' => (string) $bitstamp]),
        'api.coingecko.com/*' => $coingecko === null ? Http::response(['status' => ['error_code' => 429]], 429) : Http::response(['bitcoin' => ['eur' => $coingecko]]),
    ]);
}

it('calcule la médiane des trois sources, la convertit en XOF et la met en cache 60 s', function () {
    sourcesFake(68_000.0, 68_100.0, 68_050.0);

    $resultat = app(CoursChange::class)->rafraichir();

    expect($resultat['btc_eur'])->toBe(68_050.0)
        ->and($resultat['btc_xof'])->toBe((int) round(68_050 * 655.957))
        ->and($resultat['sources'])->toBe(3);

    expect(CoursChangeModel::query()->where('source', 'mediane')->count())->toBe(1)
        ->and(CoursChangeModel::query()->whereIn('source', ['kraken', 'bitstamp', 'coingecko'])->count())->toBe(3)
        ->and(Cache::get(CoursChange::CLE_CACHE)['btc_xof'])->toBe($resultat['btc_xof']);

    $actuel = app(CoursChange::class)->actuel();
    expect($actuel)->toMatchArray(['disponible' => true, 'btc_xof' => $resultat['btc_xof'], 'sources' => 3])
        ->and($actuel['age_s'])->toBeLessThan(5);
});

it('écarte une source qui s\'écarte de plus de 2 % de la médiane', function () {
    sourcesFake(68_000.0, 68_100.0, 75_000.0); // CoinGecko à +10 %

    $resultat = app(CoursChange::class)->rafraichir();

    expect($resultat['sources'])->toBe(2)
        ->and($resultat['btc_eur'])->toBe(68_050.0) // médiane des deux restantes
        ->and(CoursChangeModel::query()->where('source', 'coingecko')->exists())->toBeFalse();
});

it('garde le dernier cours connu quand aucune source ne répond', function () {
    coursDisponible(44_000_000);
    sourcesFake(null, null, null);

    expect(app(CoursChange::class)->rafraichir())->toBeNull()
        ->and(app(CoursChange::class)->actuel()['btc_xof'])->toBe(44_000_000);
});

it('accepte une source unique seulement si elle reste cohérente avec le dernier cours', function () {
    coursDisponible(44_000_000);
    Http::fake([
        'api.kraken.com/*' => Http::response('', 500),
        'api.coingecko.com/*' => Http::response('', 429),
        // 1er appel : +34 % par rapport au cours connu → refusée ; 2e appel : 44,0 M XOF ≈ 67 077 EUR → cohérente.
        'www.bitstamp.net/*' => Http::sequence()->push(['last' => '90000.0'])->push(['last' => '67100.0']),
    ]);

    expect(app(CoursChange::class)->rafraichir())->toBeNull();

    $resultat = app(CoursChange::class)->rafraichir();
    expect($resultat)->not->toBeNull()->and($resultat['sources'])->toBe(1);
});

it('déclare le cours indisponible au-delà de 10 minutes et le relit depuis la base sans cache', function () {
    coursDisponible(44_000_000, ageS: 601);
    expect(app(CoursChange::class)->actuel()['disponible'])->toBeFalse();

    Cache::forget(CoursChange::CLE_CACHE);
    CoursChangeModel::create(['source' => 'mediane', 'btc_eur' => 67_000, 'btc_xof' => 43_949_119, 'nb_sources' => 3, 'recupere_at' => now()->subSeconds(30)]);

    $actuel = app(CoursChange::class)->actuel();
    expect($actuel['disponible'])->toBeTrue()->and($actuel['btc_xof'])->toBe(43_949_119)->and($actuel['sources'])->toBe(3);

    // Sans aucun cours : forme stable, disponible=false.
    Cache::forget(CoursChange::CLE_CACHE);
    CoursChangeModel::query()->delete();
    expect(app(CoursChange::class)->actuel())->toBe(['disponible' => false, 'btc_xof' => null, 'recupere_le' => null, 'age_s' => null, 'sources' => 0]);
});

it('expose GET /cours selon le contrat, aux membres connectés seulement', function () {
    coursDisponible(44_000_000);
    ['user' => $caissier] = boutiqueAvec('caissier');

    $this->getJson('/api/v1/cours')->assertStatus(401);

    connecte($caissier)->getJson('/api/v1/cours')->assertOk()
        ->assertJsonStructure(['disponible', 'btc_xof', 'recupere_le', 'age_s', 'sources'])
        ->assertJsonPath('disponible', true)->assertJsonPath('btc_xof', 44_000_000)->assertJsonPath('sources', 3);
});

it('la commande planifiée met à jour le cours et purge l\'historique ancien', function () {
    sourcesFake();
    CoursChangeModel::create(['source' => 'mediane', 'btc_eur' => 1, 'btc_xof' => 656, 'nb_sources' => 3, 'recupere_at' => now()->subDays(40)]);

    Artisan::call('cours:rafraichir', ['--purger' => true]);

    expect(Artisan::output())->toContain('3 source(s)')
        ->and(CoursChangeModel::query()->where('recupere_at', '<', now()->subDays(30))->exists())->toBeFalse();
});

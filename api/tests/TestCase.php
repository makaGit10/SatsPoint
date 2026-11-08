<?php

namespace Tests;

use App\Http\Middleware\DiffuserEcritures;
use App\Services\BoutiqueCourante;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Facades\Http;

abstract class TestCase extends BaseTestCase
{
    /** Corps renvoyé par le faux service HIBP (vide = mot de passe non compromis). */
    public static string $corpsHibp = '';

    protected function setUp(): void
    {
        parent::setUp();

        static::$corpsHibp = '';

        // Les requêtes de test viennent « du front » : session Sanctum par cookie.
        $this->withHeader('Referer', config('satspoint.frontend_url').'/');
        $this->withHeader('Accept', 'application/json');

        // Aucun appel réseau réel pendant les tests (HIBP, passerelle, Reverb).
        Http::preventStrayRequests();
        Http::fake([
            'api.pwnedpasswords.com/*' => fn () => Http::response(static::$corpsHibp, 200),
        ]);

        DiffuserEcritures::reinitialiser();
        app(BoutiqueCourante::class)->oublier();
    }
}

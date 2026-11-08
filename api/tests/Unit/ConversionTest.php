<?php

use App\Support\Conversion;

it('convertit les FCFA en sats avec arrondi au sat supérieur', function (int $xof, int $btcXof, int $attendu) {
    expect(Conversion::xofVersSats($xof, $btcXof))->toBe($attendu);
})->with([
    'exact' => [100, 100_000_000, 100],            // 100 × 1e8 / 1e8 = 100 pile
    'arrondi haut 0,5' => [100, 44_000_000, 228],   // 227,27 → 228
    'juste au-dessus d\'un entier' => [101, 44_000_000, 230],   // 229,54 → 230
    'un FCFA' => [1, 44_000_000, 3],                 // 2,27 → 3
    'minimum caisse' => [100, 60_000_000, 167],     // 166,67 → 167
    'maximum défaut' => [2_000_000, 44_000_000, 4_545_455], // 4 545 454,5 → 4 545 455
    'cours très haut' => [100, 1_000_000_000, 10],  // 10 pile
    'cours très bas' => [100, 1, 10_000_000_000],   // 1e10 sats (100 BTC) : pas de débordement
]);

it('ne descend jamais sous le prix affiché (le commerçant reçoit au moins le montant)', function () {
    foreach ([[137, 44_123_457], [999, 61_000_001], [250_000, 39_999_999]] as [$xof, $cours]) {
        $sats = Conversion::xofVersSats($xof, $cours);
        // Reconvertis en XOF (flottant uniquement pour la vérification), les sats couvrent toujours le montant.
        expect($sats * $cours / 100_000_000)->toBeGreaterThanOrEqual($xof)
            ->and(($sats - 1) * $cours / 100_000_000)->toBeLessThan($xof);
    }
});

it('renvoie 0 sat pour 0 FCFA et refuse les valeurs invalides', function () {
    expect(Conversion::xofVersSats(0, 44_000_000))->toBe(0);
    expect(fn () => Conversion::xofVersSats(-1, 44_000_000))->toThrow(InvalidArgumentException::class);
    expect(fn () => Conversion::xofVersSats(100, 0))->toThrow(InvalidArgumentException::class);
    expect(fn () => Conversion::xofVersSats(100, -5))->toThrow(InvalidArgumentException::class);
});

it('convertit les sats en FCFA au plus proche et gère les millisats', function () {
    expect(Conversion::satsVersXof(228, 44_000_000))->toBe(100)      // 100,32 → 100
        ->and(Conversion::satsVersXof(0, 44_000_000))->toBe(0)
        ->and(Conversion::satsVersMsats(228))->toBe(228_000)
        ->and(Conversion::msatsVersSats(228_999))->toBe(228)         // le reste de millisats ne fait pas un sat
        ->and(Conversion::msatsVersSats(0))->toBe(0);
});

it('applique la parité fixe 1 EUR = 655,957 XOF', function () {
    expect(Conversion::eurVersXof(1.0))->toBe(656)
        ->and(Conversion::eurVersXof(1000.0))->toBe(655_957)
        ->and(Conversion::eurVersXof(68_115.58))->toBe(44_680_892);
});

<?php

use App\Support\Identifiant;

it('normalise les e-mails en minuscules', function () {
    expect(Identifiant::normaliser('  Awa.Ndiaye@Example.COM '))->toBe(['type' => 'email', 'valeur' => 'awa.ndiaye@example.com']);
});

it('normalise les numéros sénégalais en E.164', function (string $brut, string $attendu) {
    expect(Identifiant::normaliser($brut))->toBe(['type' => 'telephone', 'valeur' => $attendu]);
})->with([
    ['77 123 45 67', '+221771234567'],
    ['+221 77 123 45 67', '+221771234567'],
    ['00221771234567', '+221771234567'],
    ['221771234567', '+221771234567'],
    ['33 821 00 00', '+221338210000'],
    ['+33612345678', '+33612345678'],
]);

it('rejette les identifiants invalides', function (string $brut) {
    expect(Identifiant::normaliser($brut))->toBeNull();
})->with(['', 'pas-un-email', '12345', '+0123456789', 'a@b', '771234', '77-12-34-56-78-90-12']);

it('masque les identifiants pour le journal', function () {
    expect(Identifiant::masquer('awa@example.com'))->toBe('aw***@example.com')
        ->and(Identifiant::masquer('+221771234567'))->toBe('+221*****67');
});

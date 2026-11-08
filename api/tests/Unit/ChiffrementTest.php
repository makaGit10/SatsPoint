<?php

use App\Exceptions\ChiffrementException;
use App\Services\ChiffrementDonnees;

$cle = 'base64:'.base64_encode(str_repeat("\x07", 32));

it('chiffre et déchiffre une valeur (AES-256-GCM)', function () use ($cle) {
    $service = new ChiffrementDonnees($cle);

    $chiffre = $service->chiffrer('nostr+walletconnect://abc?relay=wss://r&secret=xyz', 'connexions_wallet.uri_chiffree');

    expect($chiffre)->toStartWith('v1:')
        ->and($chiffre)->not->toContain('secret=xyz')
        ->and($service->dechiffrer($chiffre, 'connexions_wallet.uri_chiffree'))->toBe('nostr+walletconnect://abc?relay=wss://r&secret=xyz');
});

it('produit un chiffré différent à chaque appel (IV aléatoire)', function () use ($cle) {
    $service = new ChiffrementDonnees($cle);

    expect($service->chiffrer('même valeur'))->not->toBe($service->chiffrer('même valeur'));
});

it('refuse une donnée altérée', function () use ($cle) {
    $service = new ChiffrementDonnees($cle);
    $chiffre = $service->chiffrer('valeur');

    $altere = substr($chiffre, 0, -4).'AAAA';

    expect(fn () => $service->dechiffrer($altere))->toThrow(ChiffrementException::class);
});

it('refuse un contexte différent (AAD)', function () use ($cle) {
    $service = new ChiffrementDonnees($cle);
    $chiffre = $service->chiffrer('valeur', 'colonne_a');

    expect(fn () => $service->dechiffrer($chiffre, 'colonne_b'))->toThrow(ChiffrementException::class);
});

it('refuse une clé différente', function () use ($cle) {
    $chiffre = (new ChiffrementDonnees($cle))->chiffrer('valeur');
    $autre = new ChiffrementDonnees('base64:'.base64_encode(str_repeat("\x09", 32)));

    expect(fn () => $autre->dechiffrer($chiffre))->toThrow(ChiffrementException::class);
});

it('exige une clé de 32 octets', function () {
    expect(fn () => new ChiffrementDonnees('base64:'.base64_encode('trop-courte')))->toThrow(ChiffrementException::class)
        ->and(fn () => new ChiffrementDonnees(null))->toThrow(ChiffrementException::class);
});

<?php

use App\Services\SignatureHmac;

it('calcule la signature du contrat (timestamp.nonce.METHODE.chemin.sha256(corps))', function () {
    $service = new SignatureHmac('secret');
    $corps = '{"a":1}';

    $attendu = hash_hmac('sha256', '1700000000.abcdef0123456789abcdef0123456789.POST./internal/lightning/evenement?x=1.'.hash('sha256', $corps), 'secret');

    expect($service->signer(1700000000, 'abcdef0123456789abcdef0123456789', 'post', '/internal/lightning/evenement?x=1', $corps))->toBe($attendu)
        ->and($service->verifier($attendu, 1700000000, 'abcdef0123456789abcdef0123456789', 'POST', '/internal/lightning/evenement?x=1', $corps))->toBeTrue()
        ->and($service->verifier(strtoupper($attendu), 1700000000, 'abcdef0123456789abcdef0123456789', 'POST', '/internal/lightning/evenement?x=1', $corps))->toBeTrue()
        ->and($service->verifier($attendu, 1700000001, 'abcdef0123456789abcdef0123456789', 'POST', '/internal/lightning/evenement?x=1', $corps))->toBeFalse()
        ->and($service->verifier('pas-hex', 1700000000, 'abcdef0123456789abcdef0123456789', 'POST', '/x', ''))->toBeFalse();
});

it('refuse tout quand le secret est vide', function () {
    $service = new SignatureHmac('');

    expect($service->secretConfigure())->toBeFalse()
        ->and($service->verifier(str_repeat('a', 64), time(), SignatureHmac::nonce(), 'GET', '/x', ''))->toBeFalse();
});

it('génère des nonces hexadécimaux de 16 octets', function () {
    $nonce = SignatureHmac::nonce();

    expect($nonce)->toMatch('/^[a-f0-9]{32}$/')
        ->and(SignatureHmac::nonceValide($nonce))->toBeTrue()
        ->and(SignatureHmac::nonceValide('court'))->toBeFalse();
});

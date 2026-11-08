<?php

use App\Exceptions\PasserelleErreur;
use App\Exceptions\PasserelleInjoignable;
use App\Services\PasserelleLightning;
use App\Services\SignatureHmac;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;

it('signe chaque requête selon le contrat et décode les réponses', function () {
    Http::fake([
        '*/connexions/01JCFXAMPK0000000000000ABC/factures' => Http::response(['bolt11' => 'lnbcrt1...', 'payment_hash' => str_repeat('a', 64), 'montant_msats' => 1000, 'cree_le' => 'x', 'expire_le' => 'y']),
    ]);

    $resultat = app(PasserelleLightning::class)->creerFacture('01JCFXAMPK0000000000000ABC', 1000, 'Vente n° 12', 300);

    expect($resultat['payment_hash'])->toBe(str_repeat('a', 64));

    Http::assertSent(function (Request $requete) {
        $service = new SignatureHmac((string) config('satspoint.passerelle.secret'));
        $uri = parse_url($requete->url());
        $chemin = $uri['path'].(isset($uri['query']) ? '?'.$uri['query'] : '');

        return $requete->hasHeader(SignatureHmac::EN_TETE_HORODATAGE)
            && $requete->hasHeader(SignatureHmac::EN_TETE_NONCE)
            && abs(time() - (int) $requete->header(SignatureHmac::EN_TETE_HORODATAGE)[0]) < 5
            && $service->verifier(
                $requete->header(SignatureHmac::EN_TETE_SIGNATURE)[0],
                $requete->header(SignatureHmac::EN_TETE_HORODATAGE)[0],
                $requete->header(SignatureHmac::EN_TETE_NONCE)[0],
                $requete->method(),
                $chemin,
                $requete->body(),
            )
            && $requete->data() === ['montant_msats' => 1000, 'description' => 'Vente n° 12', 'expiration_s' => 300];
    });
});

it('convertit les erreurs du contrat en exceptions typées', function () {
    Http::fake(['*/connexions/x/solde' => Http::response(['erreur' => ['code' => 'PORTEFEUILLE_INJOIGNABLE', 'message' => 'relais muet']], 502)]);

    try {
        app(PasserelleLightning::class)->solde('x');
        $this->fail('exception attendue');
    } catch (PasserelleErreur $e) {
        expect($e->codeErreur)->toBe('PORTEFEUILLE_INJOIGNABLE')->and($e->statutHttp)->toBe(502)->and($e->estDe('PORTEFEUILLE_INJOIGNABLE'))->toBeTrue();
    }
});

it('signale une passerelle injoignable', function () {
    Http::fake(fn () => throw new ConnectionException('timeout'));

    expect(fn () => app(PasserelleLightning::class)->facture('x', str_repeat('a', 64)))->toThrow(PasserelleInjoignable::class)
        ->and(app(PasserelleLightning::class)->joignable())->toBeFalse();
});

it('appelle /sante sans signature', function () {
    Http::fake(['*/sante' => Http::response(['ok' => true, 'connexions' => 1, 'mock' => true, 'uptime_s' => 3])]);

    expect(app(PasserelleLightning::class)->sante()['ok'])->toBeTrue();
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/sante') && ! $r->hasHeader(SignatureHmac::EN_TETE_SIGNATURE));
});

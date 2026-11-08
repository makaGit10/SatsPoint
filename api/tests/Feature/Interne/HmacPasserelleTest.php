<?php

use App\Jobs\TraiterEvenementLightning;
use App\Models\ConnexionWallet;
use App\Services\SignatureHmac;
use Illuminate\Support\Facades\Queue;

function enTetesSignes(string $methode, string $chemin, string $corps = '', ?int $horodatage = null, ?string $nonce = null, ?string $secret = null): array
{
    $service = new SignatureHmac($secret ?? (string) config('satspoint.passerelle.secret'));
    $horodatage ??= time();
    $nonce ??= SignatureHmac::nonce();

    return [
        SignatureHmac::EN_TETE_HORODATAGE => (string) $horodatage,
        SignatureHmac::EN_TETE_NONCE => $nonce,
        SignatureHmac::EN_TETE_SIGNATURE => $service->signer($horodatage, $nonce, $methode, $chemin, $corps),
        'Content-Type' => 'application/json',
    ];
}

it('renvoie les connexions déchiffrées à une requête correctement signée', function () {
    ['boutique' => $a] = boutiqueAvec('proprietaire');
    ['boutique' => $b] = boutiqueAvec('proprietaire');
    avecBoutique($a, fn () => ConnexionWallet::create(['uri_chiffree' => 'mock://demo', 'statut' => 'active', 'budget_sats' => 5000]));
    avecBoutique($b, fn () => ConnexionWallet::create(['uri_chiffree' => 'nostr+walletconnect://x?secret=y', 'statut' => 'revoquee']));

    $this->withHeaders(enTetesSignes('GET', '/internal/lightning/connexions'))
        ->get('/internal/lightning/connexions')
        ->assertOk()
        ->assertExactJson(['connexions' => [['id' => $a->ulid, 'uri' => 'mock://demo', 'budget_msats' => 5000000]]])
        ->assertHeader('Cache-Control', 'no-store, private');
});

it('refuse sans signature, avec une mauvaise signature ou un mauvais secret', function () {
    $this->get('/internal/lightning/connexions')->assertStatus(401)->assertJsonPath('code', 'SIGNATURE_INVALIDE');

    $entetes = enTetesSignes('GET', '/internal/lightning/connexions');
    $entetes[SignatureHmac::EN_TETE_SIGNATURE] = str_repeat('0', 64);
    $this->withHeaders($entetes)->get('/internal/lightning/connexions')->assertStatus(401)->assertJsonPath('code', 'SIGNATURE_INVALIDE');

    $this->withHeaders(enTetesSignes('GET', '/internal/lightning/connexions', secret: 'mauvais-secret'))
        ->get('/internal/lightning/connexions')->assertStatus(401);

    // Signature valide pour un autre chemin / une autre méthode : refus.
    $this->withHeaders(enTetesSignes('POST', '/internal/lightning/connexions'))->get('/internal/lightning/connexions')->assertStatus(401);
});

it('refuse un horodatage hors de la fenêtre de 30 s', function () {
    $this->withHeaders(enTetesSignes('GET', '/internal/lightning/connexions', horodatage: time() - 31))
        ->get('/internal/lightning/connexions')->assertStatus(401)->assertJsonPath('code', 'HORODATAGE_HORS_FENETRE');

    $this->withHeaders(enTetesSignes('GET', '/internal/lightning/connexions', horodatage: time() + 31))
        ->get('/internal/lightning/connexions')->assertStatus(401)->assertJsonPath('code', 'HORODATAGE_HORS_FENETRE');

    $this->withHeaders(enTetesSignes('GET', '/internal/lightning/connexions', horodatage: time() - 25))
        ->get('/internal/lightning/connexions')->assertOk();
});

it('refuse le rejeu d\'un nonce déjà vu', function () {
    $entetes = enTetesSignes('GET', '/internal/lightning/connexions');

    $this->withHeaders($entetes)->get('/internal/lightning/connexions')->assertOk();
    $this->withHeaders($entetes)->get('/internal/lightning/connexions')->assertStatus(401)->assertJsonPath('code', 'REJEU');
});

it('accepte un événement signé (202) et le confie à un job qui ne fait que journaliser pour l\'instant', function () {
    Queue::fake();
    $corps = json_encode([
        'type' => 'payment_received',
        'id' => '01JCFXAMPK0000000000000ABC',
        'payment_hash' => str_repeat('ab', 32),
        'montant_msats' => 150000,
        'regle_le' => '2026-11-08T12:00:00Z',
        'preimage' => str_repeat('cd', 32),
    ]);

    $this->call('POST', '/internal/lightning/evenement', [], [], [], $this->transformHeadersToServerVars(enTetesSignes('POST', '/internal/lightning/evenement', $corps)), $corps)
        ->assertStatus(202)->assertExactJson(['accepte' => true]);

    Queue::assertPushed(TraiterEvenementLightning::class, fn (TraiterEvenementLightning $job) => $job->evenement['payment_hash'] === str_repeat('ab', 32) && $job->queue === 'paiements');
});

it('valide le corps de l\'événement et refuse un corps modifié après signature', function () {
    $corps = json_encode(['type' => 'inconnu', 'id' => 'pas-un-ulid', 'payment_hash' => 'court', 'montant_msats' => -1, 'regle_le' => 'hier']);

    $this->call('POST', '/internal/lightning/evenement', [], [], [], $this->transformHeadersToServerVars(enTetesSignes('POST', '/internal/lightning/evenement', $corps)), $corps)
        ->assertStatus(422)->assertJsonValidationErrors(['type', 'id', 'payment_hash', 'montant_msats', 'regle_le']);

    $corpsSigne = json_encode(['type' => 'payment_received', 'id' => '01JCFXAMPK0000000000000ABC', 'payment_hash' => str_repeat('ab', 32), 'montant_msats' => 1, 'regle_le' => '2026-11-08T12:00:00Z']);
    $corpsEnvoye = json_encode(['type' => 'payment_received', 'id' => '01JCFXAMPK0000000000000ABC', 'payment_hash' => str_repeat('ab', 32), 'montant_msats' => 999999, 'regle_le' => '2026-11-08T12:00:00Z']);

    $this->call('POST', '/internal/lightning/evenement', [], [], [], $this->transformHeadersToServerVars(enTetesSignes('POST', '/internal/lightning/evenement', $corpsSigne)), $corpsEnvoye)
        ->assertStatus(401);
});

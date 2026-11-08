<?php

use App\Http\Requests\Boutique\ConnecterWalletRequest;
use App\Models\ConnexionWallet;
use App\Models\JournalAudit;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    coursDisponible(); // 44 000 000 XOF/BTC
    passerelleFake();
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiquePrete();
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
});

it('GET /wallet : solde via la passerelle converti en FCFA, cache 15 s, jamais l\'URI ; caissier 403', function () {
    connecte($this->caissier)->getJson('/api/v1/wallet')->assertForbidden();

    $reponse = connecte($this->gerant)->getJson('/api/v1/wallet')->assertOk()
        ->assertJsonPath('connecte', true)->assertJsonPath('simule', true)
        ->assertJsonPath('permissions', ['make_invoice', 'lookup_invoice', 'get_balance', 'list_transactions', 'pay_invoice'])
        ->assertJsonPath('solde', ['sats' => 100_000, 'xof' => 44_000, 'cours_xof_par_btc' => 44_000_000])
        ->assertJsonStructure(['connecte', 'alias', 'lud16', 'permissions', 'budget_sats', 'verifie_le', 'solde']);
    expect(strtolower($reponse->getContent()))->not->toContain('mock://')->not->toContain('uri');

    $this->getJson('/api/v1/wallet')->assertOk();
    Http::assertSentCount(1); // solde en cache

    // Passerelle en erreur : solde null, connexion marquée en erreur, réponse toujours 200.
    Cache::forget('wallet:solde:'.$this->boutique->ulid);
    httpFraiche();
    Http::fake(['*/connexions/*/solde' => Http::response(['erreur' => ['code' => 'PORTEFEUILLE_INJOIGNABLE', 'message' => 'x']], 502)]);
    $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('solde', null)->assertJsonPath('connecte', false);
    expect(ConnexionWallet::pourBoutique($this->boutique)->value('statut'))->toBe('erreur');
});

it('GET /wallet sans portefeuille : forme stable non connectée', function () {
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    connecte($proprio)->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('connecte', false)->assertJsonPath('solde', null)->assertJsonPath('permissions', []);
});

it('GET /wallet/transactions normalise l\'historique en sats', function () {
    connecte($this->proprio)->getJson('/api/v1/wallet/transactions?limite=5&decalage=0')->assertOk()
        ->assertJsonCount(1, 'transactions')
        ->assertJsonPath('transactions.0', fn ($t) => $t['type'] === 'entrante' && $t['montant_sats'] === 228 && $t['frais_sats'] === 0 && ! array_key_exists('payment_hash', $t))
        ->assertJsonStructure(['transactions' => [['type', 'statut', 'montant_sats', 'frais_sats', 'description', 'regle_le', 'cree_le']]]);

    Http::assertSent(fn (Request $r) => str_contains($r->url(), '/transactions?') && str_contains($r->url(), 'limite=5'));

    $this->getJson('/api/v1/wallet/transactions?limite=51')->assertStatus(422);
    connecte($this->caissier)->getJson('/api/v1/wallet/transactions')->assertForbidden();
});

it('POST /wallet/recevoir : facture libre en FCFA (au cours) ou en sats', function () {
    connecte($this->gerant)->postJson('/api/v1/wallet/recevoir', ['montant_xof' => 100, 'description' => 'Café'])->assertCreated()
        ->assertJsonPath('montant_sats', 228)->assertJsonPath('montant_xof', 100)->assertJsonPath('bolt11', 'lnbcrt2280n1testfacture')
        ->assertJsonStructure(['bolt11', 'montant_sats', 'montant_xof', 'expire_le']);
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/factures') && $r['montant_msats'] === 228_000 && $r['description'] === 'Café');

    $this->postJson('/api/v1/wallet/recevoir', ['montant_sats' => 5000])->assertCreated()->assertJsonPath('montant_sats', 5000)->assertJsonPath('montant_xof', 2200);

    $this->postJson('/api/v1/wallet/recevoir', [])->assertStatus(422);
    $this->postJson('/api/v1/wallet/recevoir', ['montant_xof' => -5])->assertStatus(422);

    coursDisponible(ageS: 700);
    $this->postJson('/api/v1/wallet/recevoir', ['montant_xof' => 100])->assertStatus(503)->assertJsonPath('code', 'COURS_INDISPONIBLE');
    $this->postJson('/api/v1/wallet/recevoir', ['montant_sats' => 100])->assertCreated(); // en sats : pas besoin de cours
});

it('POST /wallet/envoyer/apercu et /envoyer : propriétaire seulement, mot de passe revérifié, audité', function () {
    connecte($this->gerant)->postJson('/api/v1/wallet/envoyer/apercu', ['destination' => 'lnbc10u1pfake'])->assertForbidden();
    connecte($this->gerant)->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST])->assertForbidden();
    connecte($this->caissier)->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST])->assertForbidden();

    connecte($this->proprio)->postJson('/api/v1/wallet/envoyer/apercu', ['destination' => 'lnbc10u1pfake'])->assertOk()
        ->assertJsonPath('type', 'bolt11')->assertJsonPath('montant_sats', 1000)->assertJsonPath('montant_xof', 440)->assertJsonPath('description', 'café')
        ->assertJsonStructure(['type', 'montant_sats', 'montant_xof', 'destinataire', 'description', 'min_sats', 'max_sats']);

    $this->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake'])->assertStatus(422)->assertJsonValidationErrors(['password']);
    $this->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => 'faux'])->assertStatus(422)->assertJsonValidationErrors(['password'])->assertJsonPath('code', 'MOT_DE_PASSE_INCORRECT');
    $this->postJson('/api/v1/wallet/envoyer', ['destination' => "lnbc10u1p\nfake", 'password' => MDP_TEST])->assertStatus(422)->assertJsonValidationErrors(['destination']);
    Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/paiements'));

    $this->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST])->assertOk()
        ->assertExactJson(['payment_hash_abrege' => 'ab12ab12', 'montant_sats' => 1000, 'frais_sats' => 1]);
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), "/connexions/{$this->boutique->ulid}/paiements") && $r['bolt11'] === 'lnbc10u1pfake');

    // Adresse Lightning : montant requis, envoyé en msats.
    $this->postJson('/api/v1/wallet/envoyer', ['destination' => 'awa@getalby.com', 'password' => MDP_TEST])->assertStatus(422)->assertJsonPath('code', 'MONTANT_REQUIS');
    $this->postJson('/api/v1/wallet/envoyer', ['destination' => 'awa@getalby.com', 'montant_sats' => 250, 'password' => MDP_TEST])->assertOk();
    Http::assertSent(fn (Request $r) => str_ends_with($r->url(), '/paiements') && ($r['destination'] ?? null) === 'awa@getalby.com' && $r['montant_msats'] === 250_000);

    $actions = JournalAudit::query()->whereIn('action', ['wallet.envoi_demande', 'wallet.envoi_reussi', 'wallet.envoi_refuse_mot_de_passe'])->pluck('action');
    expect($actions->filter(fn ($a) => $a === 'wallet.envoi_reussi')->count())->toBe(2)
        ->and($actions->contains('wallet.envoi_refuse_mot_de_passe'))->toBeTrue();
    expect(json_encode(JournalAudit::query()->get()->pluck('details')))->not->toContain(MDP_TEST)->not->toContain('lnbc10u1pfake');
});

it('mappe les erreurs de la passerelle : solde insuffisant, budget, destination, paiement incertain (DELAI_DEPASSE)', function (string $code, int $statut, string $attendu) {
    httpFraiche();
    Http::fake(['*/connexions/*/paiements' => Http::response(['erreur' => ['code' => $code, 'message' => 'x']], $statut)]);

    connecte($this->proprio)->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST])->assertJsonPath('code', $attendu);

    if ($attendu === 'PAIEMENT_INCERTAIN') {
        expect(JournalAudit::query()->where('action', 'wallet.envoi_incertain')->exists())->toBeTrue();
    }
})->with([
    ['SOLDE_INSUFFISANT', 402, 'SOLDE_INSUFFISANT'],
    ['BUDGET_DEPASSE', 403, 'BUDGET_DEPASSE'],
    ['DESTINATION_INVALIDE', 400, 'DESTINATION_INVALIDE'],
    ['FACTURE_INVALIDE', 400, 'DESTINATION_INVALIDE'],
    ['DELAI_DEPASSE', 504, 'PAIEMENT_INCERTAIN'],
    ['PORTEFEUILLE_INJOIGNABLE', 502, 'PORTEFEUILLE_INDISPONIBLE'],
]);

it('refuse l\'envoi si le portefeuille n\'a pas la permission pay_invoice', function () {
    ConnexionWallet::pourBoutique($this->boutique)->update(['permissions' => json_encode(['make_invoice', 'lookup_invoice', 'get_balance'])]);

    connecte($this->proprio)->postJson('/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST])->assertStatus(403)->assertJsonPath('code', 'PERMISSION_MANQUANTE');
    Http::assertNotSent(fn (Request $r) => str_ends_with($r->url(), '/paiements'));
});

it('PUT /boutique/wallet : propriétaire seulement, vérifie via la passerelle, chiffre l\'URI, ne la renvoie jamais', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);
    $uri = 'nostr+walletconnect://'.str_repeat('a', 64).'?relay=wss%3A%2F%2Frelay.test&secret='.str_repeat('b', 64);

    connecte($gerant)->putJson('/api/v1/boutique/wallet', ['uri' => $uri])->assertForbidden();
    connecte($proprio)->putJson('/api/v1/boutique/wallet', ['uri' => 'https://evil.example'])->assertStatus(422)->assertJsonValidationErrors(['uri']);

    $reponse = $this->putJson('/api/v1/boutique/wallet', ['uri' => $uri, 'budget_sats' => 50_000])->assertOk()
        ->assertJsonPath('connecte', true)->assertJsonPath('alias', 'Portefeuille test')->assertJsonPath('lud16', 'demo@test.ln')->assertJsonPath('budget_sats', 50_000)
        ->assertJsonPath('permissions', ['make_invoice', 'lookup_invoice', 'get_balance', 'list_transactions', 'pay_invoice']);
    expect($reponse->getContent())->not->toContain(str_repeat('b', 64))->not->toContain('walletconnect');

    Http::assertSent(fn (Request $r) => $r->method() === 'PUT' && str_ends_with($r->url(), "/connexions/{$boutique->ulid}") && $r['uri'] === $uri && $r['budget_msats'] === 50_000_000);

    $connexion = ConnexionWallet::pourBoutique($boutique)->first();
    expect($connexion->uri_chiffree)->toBe($uri)
        ->and(DB::table('connexions_wallet')->where('id', $connexion->id)->value('uri_chiffree'))->toStartWith('v1:')
        ->and($connexion->statut)->toBe('active')->and($connexion->verifiee_at)->not->toBeNull()
        ->and($boutique->fresh()->configuration()['wallet'])->toBeTrue();

    $journal = JournalAudit::query()->where('action', 'wallet.connecte')->first();
    expect($journal)->not->toBeNull()->and(json_encode($journal->details))->not->toContain(str_repeat('b', 64));

    // Portefeuille injoignable : rien n'est enregistré.
    httpFraiche();
    Http::fake(['*/connexions/*' => Http::response(['erreur' => ['code' => 'PORTEFEUILLE_INJOIGNABLE', 'message' => 'x']], 502)]);
    ['boutique' => $b2, 'user' => $p2] = boutiqueAvec('proprietaire');
    connecte($p2)->putJson('/api/v1/boutique/wallet', ['uri' => $uri])->assertStatus(502)->assertJsonPath('code', 'PORTEFEUILLE_INDISPONIBLE');
    expect(ConnexionWallet::pourBoutique($b2)->exists())->toBeFalse();
});

it('DELETE /boutique/wallet : supprime côté passerelle et le secret côté SatsPoint (propriétaire seulement)', function () {
    connecte($this->gerant)->deleteJson('/api/v1/boutique/wallet')->assertForbidden();

    connecte($this->proprio)->deleteJson('/api/v1/boutique/wallet')->assertNoContent();

    Http::assertSent(fn (Request $r) => $r->method() === 'DELETE' && str_ends_with($r->url(), "/connexions/{$this->boutique->ulid}"));
    expect(ConnexionWallet::pourBoutique($this->boutique)->exists())->toBeFalse()
        ->and(JournalAudit::query()->where('action', 'wallet.revoque')->exists())->toBeTrue();

    $this->getJson('/api/v1/wallet')->assertOk()->assertJsonPath('connecte', false);
    $this->deleteJson('/api/v1/boutique/wallet')->assertNoContent(); // idempotent
});

it('en production, mock:// est refusé à la connexion (règle de validation)', function () {
    $valider = fn (string $uri) => validator(['uri' => $uri], (new ConnecterWalletRequest)->rules())->passes();
    $nwc = 'nostr+walletconnect://'.str_repeat('a', 64).'?relay=wss%3A%2F%2Frelay.test&secret='.str_repeat('b', 64);

    expect($valider('mock://demo'))->toBeTrue()->and($valider($nwc))->toBeTrue()->and($valider('https://evil.example'))->toBeFalse();

    app()->detectEnvironment(fn () => 'production');
    try {
        expect($valider('mock://demo'))->toBeFalse()->and($valider($nwc))->toBeTrue();
    } finally {
        app()->detectEnvironment(fn () => 'testing');
    }
});

it('vérifie le rôle avant la validation : un caissier reçoit 403 même avec un corps invalide', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    ['user' => $caissier] = boutiqueAvec('caissier', $boutique);
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);

    connecte($caissier)->postJson('/api/v1/wallet/envoyer/apercu', [])->assertForbidden();
    connecte($caissier)->postJson('/api/v1/wallet/envoyer', ['destination' => 'x'])->assertForbidden();
    connecte($caissier)->postJson('/api/v1/wallet/recevoir', [])->assertForbidden();
    connecte($gerant)->postJson('/api/v1/wallet/envoyer/apercu', [])->assertForbidden();
});

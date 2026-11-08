<?php

use App\Events\DonneesModifiees;
use App\Models\ComptePaytech;
use App\Models\EvenementPaiement;
use App\Models\JournalAudit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;

const CLE_PT = 'cle-paytech-test-0123456789';
const SECRET_PT = 'secret-paytech-test-9876543210';

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->user] = boutiquePrete();
    avecBoutique($this->boutique, fn () => ComptePaytech::create(['api_key_chiffree' => CLE_PT, 'api_secret_chiffree' => SECRET_PT, 'environnement' => 'test', 'statut' => 'actif']));
    ['vente' => $this->vente, 'paiement' => $this->paiement] = venteAvecTentative($this->boutique, $this->user, 'paytech', ['simule' => false, 'operateur' => null], ['montant_xof' => 1500]);
});

/** IPN telle que PayTech l'envoie (formulaire), signée HMAC par défaut. */
function ipn(string $ref, int $montant = 1500, array $surcharge = [], string $cle = CLE_PT, string $secret = SECRET_PT): array
{
    return array_merge([
        'type_event' => 'sale_complete',
        'ref_command' => $ref,
        'item_name' => 'Vente V-000001',
        'item_price' => (string) $montant,
        'final_item_price' => (string) $montant,
        'currency' => 'XOF',
        'command_name' => 'SatsPoint',
        'env' => 'test',
        'token' => 'tok_'.substr($ref, -6),
        'payment_method' => 'Orange Money',
        'client_phone' => '771234567',
        'api_key_sha256' => hash('sha256', $cle),
        'api_secret_sha256' => hash('sha256', $secret),
        'hmac_compute' => hash_hmac('sha256', $montant.'|'.$ref.'|'.$cle, $secret),
    ], $surcharge);
}

it('IPN valide (HMAC) : paiement réussi, vente payée, opérateur détecté, signaux « paiements » et « ventes », 200 sans session ni CSRF', function () {
    Event::fake([DonneesModifiees::class]);

    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid))->assertOk()->assertExactJson(['ok' => true]);

    expect($this->paiement->fresh()->statut)->toBe('reussi')
        ->and($this->paiement->fresh()->operateur)->toBe('orange_money')
        ->and($this->vente->fresh()->statut)->toBe('payee')
        ->and($this->vente->fresh()->recu_jeton)->not->toBeNull();

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements' && $e->canal->name === 'private-boutique.'.$this->boutique->ulid && $e->auteur === null);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes');
});

it('accepte le repli par empreintes SHA-256 quand hmac_compute est absent', function () {
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid, surcharge: ['hmac_compute' => null]))->assertOk();

    expect($this->paiement->fresh()->statut)->toBe('reussi');
});

it('IPN falsifiée : 200 sans effet, journalisée, aucune information divulguée', function (array $surcharge) {
    Event::fake([DonneesModifiees::class]);

    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid, surcharge: $surcharge))->assertOk()->assertExactJson(['ok' => true]);

    expect($this->paiement->fresh()->statut)->toBe('en_attente')->and($this->vente->fresh()->statut)->toBe('en_attente')
        ->and(JournalAudit::query()->where('action', 'paytech.ipn_refusee')->exists())->toBeTrue();
    Event::assertNotDispatched(DonneesModifiees::class);
})->with([
    'mauvais HMAC et mauvaises empreintes' => [['hmac_compute' => str_repeat('0', 64), 'api_key_sha256' => str_repeat('1', 64), 'api_secret_sha256' => str_repeat('2', 64)]],
    'HMAC calculé avec un autre secret' => [['hmac_compute' => hash_hmac('sha256', '1500|x|'.CLE_PT, 'autre'), 'api_secret_sha256' => hash('sha256', 'autre')]],
    'sans aucune signature' => [['hmac_compute' => null, 'api_key_sha256' => null, 'api_secret_sha256' => null]],
]);

it('refuse un montant ou une devise différents (signature pourtant valide sur le montant annoncé)', function () {
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid, 1400))->assertOk();
    expect($this->paiement->fresh()->statut)->toBe('en_attente');

    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid, surcharge: ['currency' => 'EUR']))->assertOk();
    expect($this->paiement->fresh()->statut)->toBe('en_attente')
        ->and(JournalAudit::query()->where('action', 'paytech.ipn_refusee')->count())->toBe(2);
});

it('est idempotente : la même IPN rejouée n\'a qu\'un seul effet', function () {
    $corps = ipn($this->paiement->ulid);

    $this->post("/webhooks/paytech/{$this->boutique->ulid}", $corps)->assertOk();
    $payeeAt = $this->vente->fresh()->payee_at;
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", $corps)->assertOk();
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", $corps)->assertOk();

    expect(EvenementPaiement::query()->count())->toBe(1)
        ->and($this->vente->fresh()->payee_at->equalTo($payeeAt))->toBeTrue()
        ->and($this->vente->fresh()->alerte)->toBeNull();
});

it('résout la boutique depuis le paiement : ulid d\'URL incohérent, référence inconnue ou mal formée → sans effet', function () {
    ['boutique' => $autre] = boutiquePrete();

    $this->post("/webhooks/paytech/{$autre->ulid}", ipn($this->paiement->ulid))->assertOk();
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn('01JCFXAMPK0000000000000ABC'))->assertOk();
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn("'; DROP TABLE paiements; --"))->assertOk();
    $this->post('/webhooks/paytech/pas-un-ulid', ipn($this->paiement->ulid))->assertNotFound();

    expect($this->paiement->fresh()->statut)->toBe('en_attente');
});

it('sale_canceled : tentative échouée, vente toujours en attente', function () {
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid, surcharge: ['type_event' => 'sale_canceled']))->assertOk();

    expect($this->paiement->fresh()->statut)->toBe('echoue')->and($this->vente->fresh()->statut)->toBe('en_attente');
});

it('paiement confirmé par IPN après annulation de la vente : vente payée + alerte', function () {
    connecte($this->user)->postJson("/api/v1/ventes/{$this->vente->ulid}/annuler")->assertOk();
    app('auth')->forgetGuards();
    test()->flushSession();

    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ipn($this->paiement->ulid))->assertOk();

    expect($this->vente->fresh()->statut)->toBe('payee')->and($this->vente->fresh()->alerte)->toBe('payee_apres_annulation')
        ->and($this->paiement->fresh()->statut)->toBe('reussi');
});

it('est limitée à 60 requêtes par minute et par boutique', function () {
    for ($i = 0; $i < 60; $i++) {
        $this->post("/webhooks/paytech/{$this->boutique->ulid}", ['ref_command' => 'x'])->assertOk();
    }
    $this->post("/webhooks/paytech/{$this->boutique->ulid}", ['ref_command' => 'x'])->assertStatus(429);
});

it('la page de paiement simulé renvoie un JSON pour une tentative simulée seulement', function () {
    ['paiement' => $simule] = venteAvecTentative($this->boutique, $this->user, 'paytech', ['simule' => true]);

    $this->getJson("/paiement-simule/{$simule->ulid}")->assertOk()->assertJsonPath('simule', true)->assertJsonPath('montant_xof', 100)->assertJsonPath('statut', 'en_attente');
    $this->getJson("/paiement-simule/{$this->paiement->ulid}")->assertNotFound();
});

it('configure PayTech (propriétaire seulement), ne renvoie jamais les secrets, vérifie par une demande de 100 FCFA, supprime', function () {
    ['boutique' => $boutique, 'user' => $proprio] = boutiqueAvec('proprietaire');
    ['user' => $gerant] = boutiqueAvec('gerant', $boutique);

    connecte($gerant)->putJson('/api/v1/boutique/paytech', ['api_key' => 'cle-0123456789', 'api_secret' => 'secret-0123456789', 'environnement' => 'test'])->assertForbidden();
    connecte($proprio)->putJson('/api/v1/boutique/paytech', ['environnement' => 'test'])->assertStatus(422);
    $this->putJson('/api/v1/boutique/paytech', ['api_key' => 'cle 0123456789', 'api_secret' => 'secret-0123456789', 'environnement' => 'prod'])->assertStatus(422)->assertJsonValidationErrors(['api_key']);

    $reponse = $this->putJson('/api/v1/boutique/paytech', ['api_key' => 'cle-0123456789', 'api_secret' => 'secret-0123456789', 'environnement' => 'test'])
        ->assertOk()->assertExactJson(['configure' => true, 'environnement' => 'test']);
    expect(strtolower($reponse->getContent()))->not->toContain('cle-0123456789')->not->toContain('secret-0123456789');

    $compte = ComptePaytech::pourBoutique($boutique)->first();
    expect($compte->api_key_chiffree)->toBe('cle-0123456789')
        ->and(DB::table('comptes_paytech')->where('id', $compte->id)->value('api_secret_chiffree'))->toStartWith('v1:')
        ->and($boutique->fresh()->reglagesComplets()['moyens']['paytech'])->toBeTrue();

    // Champ vide = conserver ; passage en production.
    $this->putJson('/api/v1/boutique/paytech', ['api_key' => '', 'api_secret' => null, 'environnement' => 'prod'])->assertOk()->assertJsonPath('environnement', 'prod');
    expect($compte->fresh()->api_secret_chiffree)->toBe('secret-0123456789');

    $this->getJson('/api/v1/boutique')->assertJsonPath('boutique.paytech', ['configure' => true, 'environnement' => 'prod'])->assertJsonPath('boutique.configuration.paytech', true);

    // Vérification : demande de 100 FCFA avec les clés de la boutique.
    Http::fake(['paytech.sn/api/payment/request-payment' => Http::response(['success' => 1, 'token' => 'tok_test', 'redirect_url' => 'https://paytech.sn/payment/checkout/tok_test'])]);
    $this->postJson('/api/v1/boutique/paytech/verifier')->assertOk()->assertJsonPath('ok', true);
    Http::assertSent(fn ($r) => $r['item_price'] === 100 && $r['currency'] === 'XOF' && $r->hasHeader('API_KEY', 'cle-0123456789') && $r['env'] === 'prod');
    expect($compte->fresh()->verifie_at)->not->toBeNull();

    httpFraiche();
    Http::fake(['paytech.sn/*' => Http::response(['success' => 0], 401)]);
    $this->postJson('/api/v1/boutique/paytech/verifier')->assertOk()->assertJsonPath('ok', false);
    expect($compte->fresh()->statut)->toBe('erreur');

    connecte($gerant)->deleteJson('/api/v1/boutique/paytech')->assertForbidden();
    connecte($proprio)->deleteJson('/api/v1/boutique/paytech')->assertNoContent();
    expect(ComptePaytech::pourBoutique($boutique)->exists())->toBeFalse()
        ->and($boutique->fresh()->reglagesComplets()['moyens']['paytech'])->toBeFalse()
        ->and(JournalAudit::query()->whereIn('action', ['paytech.configure', 'paytech.verifie', 'paytech.supprime'])->count())->toBe(5);

    $this->postJson('/api/v1/boutique/paytech/verifier')->assertStatus(409)->assertJsonPath('code', 'PAYTECH_NON_CONFIGURE');
});

<?php

use App\Events\DonneesModifiees;
use App\Jobs\TraiterEvenementLightning;
use App\Models\EvenementPaiement;
use App\Models\JournalAudit;
use App\Models\Vente;
use App\Services\Diffuseur;
use App\Services\PaiementsLightning;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    coursDisponible();
    ['boutique' => $this->boutique, 'user' => $this->user] = boutiquePrete();
});

function evenementPasserelle(string $ulidBoutique, array $surcharge = []): array
{
    return array_merge(['type' => 'payment_received', 'id' => $ulidBoutique, 'payment_hash' => HASH_TEST, 'montant_msats' => 228_000, 'regle_le' => now()->toIso8601String(), 'preimage' => str_repeat('e', 64)], $surcharge);
}

it('payment_received : revérifie par lookup puis marque payé et diffuse « paiements » et « ventes »', function () {
    Event::fake([DonneesModifiees::class]);
    passerelleFake(['statut' => 'reglee', 'montant_msats' => 228_000, 'regle_le' => now()->toIso8601String(), 'preimage' => str_repeat('e', 64)]);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    (new TraiterEvenementLightning(evenementPasserelle($this->boutique->ulid)))->handle(app(PaiementsLightning::class), app(Diffuseur::class));

    Http::assertSent(fn ($r) => str_ends_with($r->url(), "/connexions/{$this->boutique->ulid}/factures/".HASH_TEST));
    expect($p->fresh()->statut)->toBe('reussi')->and($p->fresh()->preimage)->toBe(str_repeat('e', 64))
        ->and($vente->fresh()->statut)->toBe('payee');

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements' && $e->canal->name === 'private-boutique.'.$this->boutique->ulid);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes');
});

it('ne marque jamais payé sur la seule parole de la notification : lookup en_attente → rien', function () {
    Event::fake([DonneesModifiees::class]);
    passerelleFake(['statut' => 'en_attente']);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    (new TraiterEvenementLightning(evenementPasserelle($this->boutique->ulid)))->handle(app(PaiementsLightning::class), app(Diffuseur::class));

    expect($p->fresh()->statut)->toBe('en_attente')->and($vente->fresh()->statut)->toBe('en_attente');
    Event::assertNotDispatched(DonneesModifiees::class);
});

it('refuse un payment_hash différent au lookup ou un montant insuffisant, et l\'audite', function () {
    passerelleFake(['statut' => 'reglee', 'payment_hash' => str_repeat('f', 64)]);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    $resultat = app(PaiementsLightning::class)->verifier($p);
    expect($resultat['effet'])->toBe('hash_incoherent')->and($p->fresh()->statut)->toBe('en_attente')
        ->and(JournalAudit::query()->where('action', 'paiement.hash_incoherent')->exists())->toBeTrue();

    passerelleFake(['statut' => 'reglee', 'montant_msats' => 227_000]); // 1 sat de moins
    $resultat = app(PaiementsLightning::class)->verifier($p);
    expect($resultat['effet'])->toBe('montant_insuffisant')->and($p->fresh()->statut)->toBe('en_attente')
        ->and(JournalAudit::query()->where('action', 'paiement.montant_insuffisant')->exists())->toBeTrue();
});

it('accepte un montant absent ou nul au lookup (Coinos) en se repliant sur le montant enregistré', function () {
    passerelleFake(['statut' => 'reglee', 'montant_msats' => 0]);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    expect(app(PaiementsLightning::class)->verifier($p)['effet'])->toBe('reussi')->and($vente->fresh()->statut)->toBe('payee');
});

it('le même événement rejoué par la passerelle n\'a qu\'un effet ; une boutique ou un hash inconnus sont ignorés', function () {
    passerelleFake(['statut' => 'reglee']);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);
    $evenement = evenementPasserelle($this->boutique->ulid);
    $job = fn (array $e) => (new TraiterEvenementLightning($e))->handle(app(PaiementsLightning::class), app(Diffuseur::class));

    $job($evenement);
    $job($evenement);
    $job(evenementPasserelle($this->boutique->ulid, ['payment_hash' => str_repeat('9', 64)]));
    $job(evenementPasserelle('01JCFXAMPK0000000000000ABC'));

    expect(EvenementPaiement::query()->count())->toBe(1)
        ->and($vente->fresh()->statut)->toBe('payee')->and($vente->fresh()->alerte)->toBeNull();
});

it('POST /paiements/{ulid}/verifier force le lookup (20/min) et renvoie la forme du contrat', function () {
    passerelleFake(['statut' => 'en_attente']);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    connecte($this->user)->postJson("/api/v1/paiements/{$p->ulid}/verifier")->assertOk()
        ->assertJsonPath('paiement.statut', 'en_attente')
        ->assertJsonPath('vente', ['ulid' => $vente->ulid, 'statut' => 'en_attente', 'numero' => 'V-000001']);
    Http::assertSentCount(1);

    passerelleFake(['statut' => 'reglee']);
    $this->postJson("/api/v1/paiements/{$p->ulid}/verifier")->assertOk()->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('vente.statut', 'payee');

    $this->getJson("/api/v1/paiements/{$p->ulid}")->assertOk()->assertJsonPath('paiement.regle_le', fn ($v) => $v !== null);

    for ($i = 0; $i < 18; $i++) {
        $this->postJson("/api/v1/paiements/{$p->ulid}/verifier")->assertOk();
    }
    $this->postJson("/api/v1/paiements/{$p->ulid}/verifier")->assertStatus(429);

    // Une autre tentative a son propre compteur.
    ['paiement' => $p2] = venteAvecTentative($this->boutique, $this->user, paiement: ['payment_hash' => str_repeat('1', 64)]);
    $this->postJson("/api/v1/paiements/{$p2->ulid}/verifier")->assertOk();
});

it('expiration planifiée : facture échue → expire, vente sans tentative depuis 30 min → expiree, signaux diffusés', function () {
    Event::fake([DonneesModifiees::class]);
    passerelleFake();
    ['vente' => $echue, 'paiement' => $pEchu] = venteAvecTentative($this->boutique, $this->user, paiement: ['expire_at' => now()->subMinute()]);
    ['vente' => $valide, 'paiement' => $pValide] = venteAvecTentative($this->boutique, $this->user, paiement: ['payment_hash' => str_repeat('2', 64), 'expire_at' => now()->addMinutes(3)]);
    ['vente' => $ancienne, 'paiement' => $pAncien] = venteAvecTentative($this->boutique, $this->user, paiement: ['payment_hash' => str_repeat('3', 64), 'statut' => 'expire', 'expire_at' => now()->subMinutes(40)]);
    ['vente' => $wave] = venteAvecTentative($this->boutique, $this->user, 'wave_manuel');
    avecBoutique($this->boutique, function () use ($ancienne, $pAncien, $wave) {
        $ancienne->forceFill(['created_at' => now()->subMinutes(45)])->saveQuietly();
        $pAncien->forceFill(['created_at' => now()->subMinutes(45)])->saveQuietly();
        $wave->forceFill(['created_at' => now()->subHours(3)])->saveQuietly();
    });

    Artisan::call('paiements:expirer');

    expect(Artisan::output())->toContain('1 paiement(s), 1 vente(s)')
        ->and($pEchu->fresh()->statut)->toBe('expire')
        ->and($echue->fresh()->statut)->toBe('en_attente')     // expirée depuis moins de 30 min : la vente attend une nouvelle tentative
        ->and($pValide->fresh()->statut)->toBe('en_attente')
        ->and($valide->fresh()->statut)->toBe('en_attente')
        ->and($ancienne->fresh()->statut)->toBe('expiree')
        ->and($wave->fresh()->statut)->toBe('en_attente');       // Wave direct : attend la confirmation manuelle, jamais d'expiration automatique

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements');
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes');

    // Nouvelle tentative possible sur la vente dont la facture a expiré.
    coursDisponible();
    connecte($this->user)->postJson("/api/v1/ventes/{$echue->ulid}/paiements", ['methode' => 'lightning'])->assertCreated();
});

it('simuler : uniquement si paiement.simule (404 sinon), règle via la passerelle puis revérifie', function () {
    passerelleFake(['statut' => 'reglee']);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);
    ['paiement' => $reel] = venteAvecTentative($this->boutique, $this->user, paiement: ['payment_hash' => str_repeat('4', 64), 'simule' => false]);

    connecte($this->user)->postJson("/api/v1/paiements/{$reel->ulid}/simuler")->assertNotFound();

    $this->postJson("/api/v1/paiements/{$p->ulid}/simuler")->assertOk()->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('vente.statut', 'payee');
    Http::assertSent(fn ($r) => str_ends_with($r->url(), "/mock/{$this->boutique->ulid}/payer/".HASH_TEST));

    $this->postJson("/api/v1/paiements/{$p->ulid}/simuler")->assertStatus(409)->assertJsonPath('code', 'PAIEMENT_CLOS');

    // PayTech simulé : réglé directement.
    ['paiement' => $pt] = venteAvecTentative($this->boutique, $this->user, 'paytech', ['simule' => true, 'operateur' => 'orange_money']);
    $this->postJson("/api/v1/paiements/{$pt->ulid}/simuler")->assertOk()->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('paiement.operateur', 'orange_money');
});

it('un caissier ne voit que les tentatives de ses ventes', function () {
    passerelleFake();
    ['user' => $caissier] = boutiqueAvec('caissier', $this->boutique);
    ['user' => $autre] = boutiqueAvec('caissier', $this->boutique);
    ['paiement' => $p] = venteAvecTentative($this->boutique, $caissier);

    connecte($autre)->getJson("/api/v1/paiements/{$p->ulid}")->assertForbidden();
    connecte($autre)->postJson("/api/v1/paiements/{$p->ulid}/verifier")->assertForbidden();
    connecte($caissier)->getJson("/api/v1/paiements/{$p->ulid}")->assertOk();
    connecte($this->user)->getJson("/api/v1/paiements/{$p->ulid}")->assertOk();
});

it('confirme manuellement un paiement Wave direct (propriétaire / gérant), audité, jamais un caissier ni un autre moyen', function () {
    ['user' => $gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $caissier] = boutiqueAvec('caissier', $this->boutique);
    ['vente' => $vente, 'paiement' => $wave] = venteAvecTentative($this->boutique, $caissier, 'wave_manuel');
    ['paiement' => $ln] = venteAvecTentative($this->boutique, $caissier);

    connecte($caissier)->postJson("/api/v1/paiements/{$wave->ulid}/confirmer-manuellement", ['confirmation' => true])->assertForbidden();
    connecte($gerant)->postJson("/api/v1/paiements/{$wave->ulid}/confirmer-manuellement", [])->assertStatus(422);
    connecte($gerant)->postJson("/api/v1/paiements/{$ln->ulid}/confirmer-manuellement", ['confirmation' => true])->assertStatus(409)->assertJsonPath('code', 'CONFIRMATION_IMPOSSIBLE');

    connecte($gerant)->postJson("/api/v1/paiements/{$wave->ulid}/confirmer-manuellement", ['confirmation' => true])->assertOk()
        ->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('paiement.operateur', 'wave')->assertJsonPath('vente.statut', 'payee');

    expect($wave->fresh()->confirme_par)->toBe($gerant->id)->and($wave->fresh()->confirme_at)->not->toBeNull()
        ->and(JournalAudit::query()->where('action', 'paiement.confirme_manuellement')->where('user_id', $gerant->id)->exists())->toBeTrue();

    // Idempotent.
    $this->postJson("/api/v1/paiements/{$wave->ulid}/confirmer-manuellement", ['confirmation' => true])->assertOk()->assertJsonPath('paiement.statut', 'reussi');
    expect(Vente::toutesBoutiques()->whereKey($vente->id)->value('alerte'))->toBeNull();
});

it('portefeuille muet (Coinos) : la relecture GET vérifie la facture, au plus une fois toutes les 2 s, et l\'écran passe au vert', function () {
    passerelleFake(['statut' => 'reglee', 'regle_le' => now()->toIso8601String()]);
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);
    $lookups = fn () => collect(Http::recorded())->filter(fn ($r) => str_ends_with($r[0]->url(), '/factures/'.HASH_TEST))->count();

    // Aucune notification reçue : la seule relecture de l'écran suffit à constater le paiement.
    connecte($this->user)->getJson("/api/v1/paiements/{$p->ulid}")->assertOk()
        ->assertJsonPath('paiement.statut', 'reussi')->assertJsonPath('vente.statut', 'payee');
    expect($lookups())->toBe(1)->and($vente->fresh()->statut)->toBe('payee');

    // Déjà payé : plus aucun appel au portefeuille.
    $this->getJson("/api/v1/paiements/{$p->ulid}")->assertOk();
    expect($lookups())->toBe(1);
});

it('relecture GET : en attente → un seul lookup par fenêtre de 2 s ; portefeuille indisponible → simple relecture', function () {
    passerelleFake(['statut' => 'en_attente']);
    ['paiement' => $p] = venteAvecTentative($this->boutique, $this->user);
    $lookups = fn () => collect(Http::recorded())->filter(fn ($r) => str_ends_with($r[0]->url(), '/factures/'.HASH_TEST))->count();

    connecte($this->user)->getJson("/api/v1/paiements/{$p->ulid}")->assertOk()->assertJsonPath('paiement.statut', 'en_attente');
    $this->getJson("/api/v1/paiements/{$p->ulid}")->assertOk();
    expect($lookups())->toBe(1);

    $this->travel(3)->seconds();
    passerelleFake([], ['*/connexions/*/factures/*' => Http::response(['code' => 'PORTEFEUILLE_INJOIGNABLE', 'message' => 'relais muet'], 503)]);
    $this->getJson("/api/v1/paiements/{$p->ulid}")->assertOk()->assertJsonPath('paiement.statut', 'en_attente');
});

<?php

use App\Events\DonneesModifiees;
use Illuminate\Support\Facades\Event;

beforeEach(function () {
    coursDisponible();
    passerelleFake();
});

it('une vente créée émet « ventes » et « paiements » mais pas « parametres » (séquence hors de la table boutiques)', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();

    connecte($proprio)->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'lightning'])->assertCreated();

    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes' && $e->canal->name === 'private-boutique.'.$boutique->ulid && $e->auteur === $proprio->ulid);
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements');
    Event::assertNotDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'parametres');
    Event::assertDispatchedTimes(DonneesModifiees::class, 2);
});

it('la confirmation manuelle, l\'annulation et la nouvelle tentative émettent les bonnes rubriques', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio, 'boutique' => $boutique] = boutiquePrete();
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($boutique, $proprio, 'wave_manuel');

    connecte($proprio)->postJson("/api/v1/paiements/{$p->ulid}/confirmer-manuellement", ['confirmation' => true])->assertOk();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements');
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes');

    ['vente' => $v2] = venteAvecTentative($boutique, $proprio);
    Event::fake([DonneesModifiees::class]);
    $this->postJson("/api/v1/ventes/{$v2->ulid}/paiements", ['methode' => 'wave_manuel'])->assertCreated();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements');

    Event::fake([DonneesModifiees::class]);
    $this->postJson("/api/v1/ventes/{$v2->ulid}/annuler")->assertOk();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'ventes');
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'paiements');
});

it('les articles et le portefeuille émettent « articles » et « wallet » ; une lecture n\'émet rien', function () {
    Event::fake([DonneesModifiees::class]);
    ['user' => $proprio] = boutiquePrete();

    connecte($proprio)->postJson('/api/v1/articles', ['nom' => 'Pain', 'prix_xof' => 150])->assertCreated();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'articles');

    Event::fake([DonneesModifiees::class]);
    $this->deleteJson('/api/v1/boutique/wallet')->assertNoContent();
    Event::assertDispatched(DonneesModifiees::class, fn ($e) => $e->rubrique === 'wallet');

    Event::fake([DonneesModifiees::class]);
    $this->getJson('/api/v1/ventes')->assertOk();
    $this->getJson('/api/v1/tableau-de-bord')->assertOk();
    $this->getJson('/api/v1/cours')->assertOk();
    $this->postJson('/api/v1/paiements/01JCFXAMPK0000000000000ABC/verifier')->assertNotFound();
    Event::assertNotDispatched(DonneesModifiees::class);
});

<?php

use App\Models\Boutique;
use App\Models\User;
use App\Models\Vente;
use Carbon\CarbonImmutable;

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->proprio] = boutiquePrete();
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
});

/** Vente payée à une date donnée (fuseau boutique), par un caissier, via une méthode. */
function ventePayee(Boutique $boutique, User $caissier, int $montant, string $methode, string $quand): void
{
    $moment = CarbonImmutable::parse($quand, 'Africa/Dakar')->utc();
    ['vente' => $v, 'paiement' => $p] = venteAvecTentative($boutique, $caissier, $methode, $methode === 'lightning' ? ['payment_hash' => bin2hex(random_bytes(32))] : [], ['montant_xof' => $montant]);
    avecBoutique($boutique, function () use ($v, $p, $moment) {
        $v->forceFill(['statut' => 'payee', 'payee_at' => $moment, 'paiement_reussi_id' => $p->id, 'recu_jeton' => Vente::genererJetonRecu(), 'created_at' => $moment])->saveQuietly();
        $p->forceFill(['statut' => 'reussi', 'regle_at' => $moment])->save();
    });
}

it('agrège les ventes payées de la période dans le fuseau de la boutique (forme du contrat)', function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-08 15:00', 'Africa/Dakar'));
    ventePayee($this->boutique, $this->proprio, 1000, 'lightning', '2026-11-08 09:00');
    ventePayee($this->boutique, $this->caissier, 3000, 'paytech', '2026-11-08 12:30');
    ventePayee($this->boutique, $this->caissier, 500, 'wave_manuel', '2026-11-08 00:10');   // bien aujourd'hui (minuit passé, heure locale)
    ventePayee($this->boutique, $this->caissier, 2000, 'lightning', '2026-11-07 23:50');    // hier
    venteAvecTentative($this->boutique, $this->caissier, vente: ['montant_xof' => 99_000]);  // en attente : hors CA, dans les dernières ventes

    $reponse = connecte($this->proprio)->getJson('/api/v1/tableau-de-bord')->assertOk()
        ->assertJsonPath('periode', 'aujourdhui')->assertJsonPath('du', '2026-11-08')->assertJsonPath('au', '2026-11-08')
        ->assertJsonPath('chiffre_affaires_xof', 4500)->assertJsonPath('nombre_ventes', 3)->assertJsonPath('panier_moyen_xof', 1500)
        ->assertJsonPath('repartition.lightning', ['nombre' => 1, 'montant_xof' => 1000])
        ->assertJsonPath('repartition.mobile_money', ['nombre' => 2, 'montant_xof' => 3500])
        ->assertJsonPath('comparaison_pct', fn ($v) => (float) $v === 125.0) // 4500 vs 2000 hier
        ->assertJsonPath('serie', [['jour' => '2026-11-08', 'montant_xof' => 4500, 'nombre' => 3]])
        ->assertJsonCount(4, 'dernieres_ventes')
        ->assertJsonPath('dernieres_ventes.0.statut', 'en_attente')
        ->assertJsonStructure(['periode', 'du', 'au', 'chiffre_affaires_xof', 'nombre_ventes', 'panier_moyen_xof', 'repartition', 'comparaison_pct', 'serie', 'dernieres_ventes' => [['ulid', 'numero', 'montant_xof', 'statut', 'caissier']]]);

    $this->getJson('/api/v1/tableau-de-bord?periode=hier')->assertOk()->assertJsonPath('chiffre_affaires_xof', 2000)->assertJsonPath('comparaison_pct', null);

    $sept = $this->getJson('/api/v1/tableau-de-bord?periode=7j')->assertOk()->assertJsonPath('chiffre_affaires_xof', 6500)->assertJsonCount(7, 'serie')->json();
    expect($sept['serie'][6])->toBe(['jour' => '2026-11-08', 'montant_xof' => 4500, 'nombre' => 3])
        ->and($sept['serie'][0]['jour'])->toBe('2026-11-02')->and($sept['serie'][0]['montant_xof'])->toBe(0);

    $this->getJson('/api/v1/tableau-de-bord?periode=annee')->assertStatus(422);
});

it('le caissier ne voit que ses propres chiffres du jour, quelle que soit la période demandée', function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-08 15:00', 'Africa/Dakar'));
    ventePayee($this->boutique, $this->proprio, 1000, 'lightning', '2026-11-08 09:00');
    ventePayee($this->boutique, $this->caissier, 3000, 'paytech', '2026-11-08 12:30');
    ventePayee($this->boutique, $this->caissier, 2000, 'lightning', '2026-11-06 12:30');

    connecte($this->caissier)->getJson('/api/v1/tableau-de-bord?periode=30j')->assertOk()
        ->assertJsonPath('periode', 'aujourdhui')->assertJsonPath('chiffre_affaires_xof', 3000)->assertJsonPath('nombre_ventes', 1)
        ->assertJsonCount(1, 'dernieres_ventes')->assertJsonPath('dernieres_ventes.0.caissier.ulid', $this->caissier->ulid);
});

it('est vide mais bien formé sans vente, et refusé sans boutique', function () {
    connecte($this->proprio)->getJson('/api/v1/tableau-de-bord?periode=30j')->assertOk()
        ->assertJsonPath('chiffre_affaires_xof', 0)->assertJsonPath('panier_moyen_xof', 0)->assertJsonPath('comparaison_pct', null)->assertJsonCount(30, 'serie')->assertJsonPath('dernieres_ventes', []);

    connecte(User::factory()->create())->getJson('/api/v1/tableau-de-bord')->assertNotFound();
});

<?php

use App\Models\Vente;

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->user] = boutiquePrete(reglages: ['message_recu' => 'Merci et à bientôt !']);
    ['vente' => $this->vente, 'paiement' => $this->paiement] = venteAvecTentative($this->boutique, $this->user, vente: ['montant_xof' => 2500]);
    $this->jeton = 'A1B2C3D4E5F6G7H8I9J0K1L2M3N4O5P6';
    avecBoutique($this->boutique, function () {
        $this->vente->forceFill(['statut' => 'payee', 'payee_at' => now(), 'paiement_reussi_id' => $this->paiement->id, 'recu_jeton' => $this->jeton])->save();
        $this->paiement->forceFill(['statut' => 'reussi', 'regle_at' => now()])->save();
    });
});

it('renvoie le reçu public en JSON sans session, sans aucune donnée personnelle', function () {
    $reponse = $this->getJson("/r/{$this->jeton}")->assertOk()
        ->assertExactJson([
            'numero' => 'V-000001', 'montant_xof' => 2500, 'montant_sats' => 228, 'methode' => 'lightning', 'operateur' => null, 'moyen' => null,
            'statut' => 'payee', 'paye_le' => $this->vente->fresh()->payee_at->toIso8601String(),
            'boutique' => ['nom' => $this->boutique->nom, 'ville' => $this->boutique->ville],
            'message' => 'Merci et à bientôt !', 'alerte' => null, 'lignes' => [],
        ])
        ->assertHeader('X-Robots-Tag', 'noindex');

    $json = strtolower($reponse->getContent());
    foreach ([$this->user->email, $this->user->nom, 'caissier', 'bolt11', 'preimage', 'ulid', 'payment_hash'] as $interdit) {
        expect($json)->not->toContain(strtolower($interdit));
    }

    // La vente détaillée expose le chemin du reçu.
    connecte($this->user)->getJson("/api/v1/ventes/{$this->vente->ulid}")->assertJsonPath('vente.recu_url', "/r/{$this->jeton}");
});

it('renvoie 404 pour un jeton inconnu, mal formé ou une vente non payée', function () {
    $this->getJson('/r/'.str_repeat('Z', 32))->assertNotFound();
    $this->getJson('/r/court')->assertNotFound();
    $this->getJson('/r/'.str_repeat('a', 40))->assertNotFound();
    $this->getJson("/r/{$this->jeton}'")->assertNotFound();

    avecBoutique($this->boutique, fn () => $this->vente->forceFill(['statut' => 'annulee'])->save());
    $this->getJson("/r/{$this->jeton}")->assertNotFound();
});

it('sans front compilé (dev), un navigateur reçoit aussi le JSON ; limite 60/min par IP', function () {
    $this->get("/r/{$this->jeton}", ['Accept' => 'text/html'])->assertOk()->assertJsonPath('numero', 'V-000001');

    for ($i = 0; $i < 59; $i++) { // 1 + 59 = 60 requêtes autorisées
        $this->getJson("/r/{$this->jeton}")->assertOk();
    }
    $this->getJson("/r/{$this->jeton}")->assertStatus(429);
});

it('génère un jeton de 32 caractères imprévisible à chaque règlement', function () {
    $jetons = collect(range(1, 20))->map(fn () => Vente::genererJetonRecu());

    expect($jetons->unique()->count())->toBe(20)
        ->and($jetons->every(fn ($j) => preg_match('/^[A-Za-z0-9]{32}$/', $j) === 1))->toBeTrue();
});

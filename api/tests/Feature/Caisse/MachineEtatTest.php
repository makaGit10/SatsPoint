<?php

use App\Exceptions\BoutiqueCouranteAbsente;
use App\Exceptions\ErreurMetier;
use App\Models\EvenementPaiement;
use App\Models\JournalAudit;
use App\Models\Paiement;
use App\Models\Vente;
use App\Services\BoutiqueCourante;
use App\Services\MachineEtatPaiement;

/*
|--------------------------------------------------------------------------
| Machine d'état (CAHIER § 7.2) : toutes les transitions, double règlement, rejeu, paiement tardif.
| Testée hors HTTP, sans boutique courante : la machine fixe elle-même la boutique du paiement.
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    ['boutique' => $this->boutique, 'user' => $this->user] = boutiquePrete();
    $this->machine = app(MachineEtatPaiement::class);
    $this->source = MachineEtatPaiement::SOURCE_VERIFICATION;
});

it('en_attente → reussi : vente payée, jeton de reçu, autres tentatives annulées', function () {
    ['vente' => $vente, 'paiement' => $p1] = venteAvecTentative($this->boutique, $this->user);
    $p2 = avecBoutique($this->boutique, fn () => Paiement::create(['vente_id' => $vente->id, 'methode' => 'paytech', 'statut' => 'en_attente', 'montant_xof' => 100]));

    $resultat = $this->machine->reussir($p1, $this->source, 'payment_received', ['hash' => HASH_TEST], ['preimage' => str_repeat('d', 64), 'regle_at' => now()->subSecond()]);

    expect($resultat['effet'])->toBe('reussi')
        ->and($p1->statut)->toBe('reussi')
        ->and($p1->fresh()->regle_at)->not->toBeNull()
        ->and($p1->fresh()->preimage)->toBe(str_repeat('d', 64))
        ->and($p2->fresh()->statut)->toBe('annule');

    $vente->refresh();
    expect($vente->statut)->toBe('payee')
        ->and($vente->paiement_reussi_id)->toBe($p1->id)
        ->and($vente->payee_at)->not->toBeNull()
        ->and($vente->alerte)->toBeNull()
        ->and(strlen((string) $vente->recu_jeton))->toBe(32)
        ->and($vente->recuUrl())->toBe('/r/'.$vente->recu_jeton)
        ->and(EvenementPaiement::query()->where('paiement_id', $p1->id)->count())->toBe(1);
});

it('rejeu : le même événement reçu deux fois n\'a qu\'un seul effet, un événement différent sur un paiement réglé est sans effet', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    $this->machine->reussir($p, 'nwc', 'payment_received', ['hash' => HASH_TEST, 'regle_le' => 'T1']);
    $payeeAt = $vente->fresh()->payee_at;

    $rejeu = $this->machine->reussir($p, 'nwc', 'payment_received', ['hash' => HASH_TEST, 'regle_le' => 'T1']);
    expect($rejeu['effet'])->toBe('deja_traite');

    $autre = $this->machine->reussir($p, 'nwc', 'payment_received', ['hash' => HASH_TEST, 'regle_le' => 'T2']);
    expect($autre['effet'])->toBe('deja_regle');

    // Même payload, autre source (vérification manuelle après la notification) : traité comme déjà réglé.
    $verif = $this->machine->reussir($p, 'verification', 'payment_received', ['hash' => HASH_TEST, 'regle_le' => 'T1']);
    expect($verif['effet'])->toBe('deja_regle');

    expect($vente->fresh()->payee_at->equalTo($payeeAt))->toBeTrue()
        ->and($vente->fresh()->alerte)->toBeNull()
        ->and(EvenementPaiement::query()->count())->toBe(3);
});

it('double règlement : la vente reste payée, la seconde tentative est « reussi » avec alerte trop-perçu', function () {
    ['vente' => $vente, 'paiement' => $p1] = venteAvecTentative($this->boutique, $this->user);
    $p2 = avecBoutique($this->boutique, fn () => Paiement::create(['vente_id' => $vente->id, 'methode' => 'paytech', 'statut' => 'en_attente', 'montant_xof' => 100]));

    $this->machine->reussir($p1, 'nwc', 'payment_received', ['n' => 1]);
    expect($p2->fresh()->statut)->toBe('annule');

    // L'argent PayTech arrive quand même (le client avait déjà validé) : jamais ignoré.
    $resultat = $this->machine->reussir($p2, 'paytech_ipn', 'sale_complete', ['n' => 2]);

    expect($resultat['effet'])->toBe('trop_percu')
        ->and($p2->fresh()->statut)->toBe('reussi')
        ->and($vente->fresh()->statut)->toBe('payee')
        ->and($vente->fresh()->paiement_reussi_id)->toBe($p1->id)
        ->and($vente->fresh()->alerte)->toBe('trop_percu')
        ->and(JournalAudit::query()->where('action', 'paiement.trop_percu')->exists())->toBeTrue();
});

it('paiement confirmé après annulation : la vente repasse à payée avec alerte', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user, 'paytech');

    $this->machine->annulerVente($vente, $this->user);
    expect($vente->fresh()->statut)->toBe('annulee')->and($p->fresh()->statut)->toBe('annule');

    $resultat = $this->machine->reussir($p, 'paytech_ipn', 'sale_complete', ['n' => 1]);

    expect($resultat['effet'])->toBe('payee_apres_annulation')
        ->and($p->fresh()->statut)->toBe('reussi')
        ->and($vente->fresh()->statut)->toBe('payee')
        ->and($vente->fresh()->alerte)->toBe('payee_apres_annulation')
        ->and($vente->fresh()->recu_jeton)->not->toBeNull()
        ->and(JournalAudit::query()->where('action', 'paiement.recu_apres_annulation')->exists())->toBeTrue();
});

it('paiement reçu après expiration : même traitement (vente payée, alerte)', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user, paiement: ['expire_at' => now()->subMinute()]);

    expect($this->machine->expirer($p)['effet'])->toBe('expire')->and($p->fresh()->statut)->toBe('expire');
    expect($this->machine->expirer($p)['effet'])->toBe('sans_effet');
    expect($this->machine->expirerVente($vente))->not->toBeNull()->and($vente->fresh()->statut)->toBe('expiree');

    $resultat = $this->machine->reussir($p, 'nwc', 'payment_received', ['n' => 1]);
    expect($resultat['effet'])->toBe('payee_apres_annulation')
        ->and($vente->fresh()->statut)->toBe('payee')->and($vente->fresh()->alerte)->toBe('payee_apres_annulation');
});

it('echoue (refus PayTech) : seule une tentative en attente change, idempotent', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user, 'paytech');

    expect($this->machine->echouer($p, 'paytech_ipn', ['n' => 1])['effet'])->toBe('echoue')->and($p->fresh()->statut)->toBe('echoue');
    expect($this->machine->echouer($p, 'paytech_ipn', ['n' => 1])['effet'])->toBe('deja_traite');
    expect($this->machine->echouer($p, 'paytech_ipn', ['n' => 2])['effet'])->toBe('sans_effet');
    expect($vente->fresh()->statut)->toBe('en_attente'); // la vente reste ouverte à une autre tentative
});

it('annulerVente : seulement en attente, sinon 409 ; expirerVente : seulement sans tentative en attente', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);

    expect($this->machine->expirerVente($vente))->toBeNull(); // une tentative est encore en attente

    $this->machine->reussir($p, 'nwc', 'payment_received', ['n' => 1]);

    try {
        $this->machine->annulerVente($vente->fresh(), $this->user);
        $this->fail('exception attendue');
    } catch (ErreurMetier $e) {
        expect($e->codeErreur)->toBe('VENTE_NON_ANNULABLE')->and($e->statutHttp)->toBe(409);
    }

    expect($this->machine->expirerVente($vente->fresh()))->toBeNull()->and($vente->fresh()->statut)->toBe('payee');
});

it('l\'empreinte d\'idempotence est stable quel que soit l\'ordre des clés', function () {
    expect(MachineEtatPaiement::empreinte(['b' => 1, 'a' => ['y' => 2, 'x' => 1]]))
        ->toBe(MachineEtatPaiement::empreinte(['a' => ['x' => 1, 'y' => 2], 'b' => 1]))
        ->not->toBe(MachineEtatPaiement::empreinte(['a' => ['x' => 1, 'y' => 2], 'b' => 2]));
});

it('fonctionne sans boutique courante et respecte le cloisonnement', function () {
    ['vente' => $vente, 'paiement' => $p] = venteAvecTentative($this->boutique, $this->user);
    ['boutique' => $autre, 'user' => $autreUser] = boutiquePrete();
    ['paiement' => $pAutre] = venteAvecTentative($autre, $autreUser);

    app(BoutiqueCourante::class)->oublier();
    expect(fn () => Vente::query()->count())->toThrow(BoutiqueCouranteAbsente::class);

    $this->machine->reussir($p, 'nwc', 'payment_received', ['n' => 1]);

    expect($vente->fresh()->statut)->toBe('payee')->and($pAutre->fresh()->statut)->toBe('en_attente')
        ->and(app(BoutiqueCourante::class)->existe())->toBeFalse(); // état restauré
});

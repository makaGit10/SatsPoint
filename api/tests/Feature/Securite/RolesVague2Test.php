<?php

use App\Models\Article;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Matrice des droits (CAHIER § 3.3) appliquée aux routes de la vague 2 :
| pour chaque route, les rôles autorisés passent la Policy (≠ 403), les autres reçoivent 403.
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    coursDisponible();
    passerelleFake();
    ['boutique' => $this->boutique, 'user' => $this->proprietaire] = boutiquePrete();
    ['user' => $this->gerant] = boutiqueAvec('gerant', $this->boutique);
    ['user' => $this->caissier] = boutiqueAvec('caissier', $this->boutique);
    ['vente' => $this->vente, 'paiement' => $this->paiement] = venteAvecTentative($this->boutique, $this->proprietaire, 'wave_manuel');
    $this->article = avecBoutique($this->boutique, fn () => Article::create(['nom' => 'Pain', 'prix_xof' => 150]));
});

it('applique la matrice des droits par rôle', function (string $methode, string $chemin, array $corps, array $rolesAutorises) {
    // Du moins privilégié au plus privilégié : la ressource existe encore quand les rôles interdits sont testés.
    foreach (['caissier', 'gerant', 'proprietaire'] as $role) {
        $remplacer = fn (string $s) => str_replace(['{vente}', '{paiement}', '{article}'], [$this->vente->ulid, $this->paiement->ulid, $this->article->ulid], $s);
        $uri = $remplacer($chemin);
        $corpsRole = json_decode($remplacer(json_encode($corps)), true);
        $statut = connecte($this->{$role})->json($methode, $uri, $corpsRole)->getStatusCode();

        if (in_array($role, $rolesAutorises, true)) {
            expect($statut)->not->toBe(403, "{$role} devrait pouvoir {$methode} {$chemin} (reçu {$statut})");
        } else {
            expect($statut)->toBe(403, "{$role} ne devrait PAS pouvoir {$methode} {$chemin} (reçu {$statut})");
        }
    }
})->with([
    'liste des ventes' => ['GET', '/api/v1/ventes', [], ['proprietaire', 'gerant', 'caissier']],
    'encaisser' => ['POST', '/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'], ['proprietaire', 'gerant', 'caissier']],
    'détail d\'une vente d\'autrui' => ['GET', '/api/v1/ventes/{vente}', [], ['proprietaire', 'gerant']],
    'annuler la vente d\'autrui' => ['POST', '/api/v1/ventes/{vente}/annuler', [], ['proprietaire', 'gerant']],
    'nouvelle tentative sur la vente d\'autrui' => ['POST', '/api/v1/ventes/{vente}/paiements', ['methode' => 'wave_manuel'], ['proprietaire', 'gerant']],
    'statut d\'un paiement d\'autrui' => ['GET', '/api/v1/paiements/{paiement}', [], ['proprietaire', 'gerant']],
    'confirmer manuellement' => ['POST', '/api/v1/paiements/{paiement}/confirmer-manuellement', ['confirmation' => true], ['proprietaire', 'gerant']],
    'export CSV' => ['GET', '/api/v1/exports/ventes?format=csv', [], ['proprietaire', 'gerant']],
    'tableau de bord' => ['GET', '/api/v1/tableau-de-bord', [], ['proprietaire', 'gerant', 'caissier']],
    'cours' => ['GET', '/api/v1/cours', [], ['proprietaire', 'gerant', 'caissier']],
    'solde du portefeuille' => ['GET', '/api/v1/wallet', [], ['proprietaire', 'gerant']],
    'historique du portefeuille' => ['GET', '/api/v1/wallet/transactions', [], ['proprietaire', 'gerant']],
    'recevoir' => ['POST', '/api/v1/wallet/recevoir', ['montant_sats' => 100], ['proprietaire', 'gerant']],
    'aperçu d\'envoi' => ['POST', '/api/v1/wallet/envoyer/apercu', ['destination' => 'lnbc10u1pfake'], ['proprietaire']],
    'envoyer des sats' => ['POST', '/api/v1/wallet/envoyer', ['destination' => 'lnbc10u1pfake', 'password' => MDP_TEST], ['proprietaire']],
    'connecter le portefeuille' => ['PUT', '/api/v1/boutique/wallet', ['uri' => 'mock://demo'], ['proprietaire']],
    'révoquer le portefeuille' => ['DELETE', '/api/v1/boutique/wallet', [], ['proprietaire']],
    'configurer PayTech' => ['PUT', '/api/v1/boutique/paytech', ['api_key' => 'cle-0123456789', 'api_secret' => 'secret-0123456789', 'environnement' => 'test'], ['proprietaire']],
    'supprimer PayTech' => ['DELETE', '/api/v1/boutique/paytech', [], ['proprietaire']],
    'vérifier PayTech' => ['POST', '/api/v1/boutique/paytech/verifier', [], ['proprietaire']],
    'lire les articles' => ['GET', '/api/v1/articles', [], ['proprietaire', 'gerant', 'caissier']],
    'créer un article' => ['POST', '/api/v1/articles', ['nom' => 'X', 'prix_xof' => 1], ['proprietaire', 'gerant']],
    'modifier un article' => ['PATCH', '/api/v1/articles/{article}', ['prix_xof' => 2], ['proprietaire', 'gerant']],
    'supprimer un article' => ['DELETE', '/api/v1/articles/{article}', [], ['proprietaire', 'gerant']],
    'ordonner les articles' => ['POST', '/api/v1/articles/ordre', ['ulids' => ['{article}']], ['proprietaire', 'gerant']],
]);

it('un membre désactivé et un super-admin n\'accèdent à rien', function () {
    ['user' => $inactif, 'membre' => $m] = boutiqueAvec('gerant', $this->boutique);
    $m->forceFill(['actif' => false])->save();
    $admin = User::factory()->superAdmin()->create();

    foreach ([$inactif, $admin] as $user) {
        connecte($user)->getJson('/api/v1/ventes')->assertNotFound();
        $this->getJson("/api/v1/ventes/{$this->vente->ulid}")->assertNotFound();
        $this->getJson('/api/v1/wallet')->assertNotFound();
        $this->getJson('/api/v1/articles')->assertNotFound();
        $this->postJson('/api/v1/ventes', ['montant_xof' => 100, 'methode' => 'wave_manuel'])->assertNotFound();
    }
});

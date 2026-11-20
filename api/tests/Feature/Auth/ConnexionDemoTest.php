<?php

use App\Models\Boutique;
use App\Models\JournalAudit;
use App\Models\Membre;
use App\Models\User;

/** Boutique de démonstration : propriétaire, gérant et caissier aux e-mails configurés. */
function boutiqueDemoJury(): array
{
    $boutique = Boutique::factory()->create();
    $comptes = [];
    foreach (['proprietaire' => 'email_proprietaire', 'gerant' => 'email_gerant', 'caissier' => 'email_caissier'] as $role => $cle) {
        $user = User::factory()->create(['email' => config("satspoint.demo.$cle")]);
        boutiqueAvec($role, $boutique, $user);
        $comptes[$role] = $user;
    }

    return ['boutique' => $boutique, 'comptes' => $comptes];
}

it('accès rapide désactivé par défaut : 404 sur les profils et la connexion', function () {
    boutiqueDemoJury();
    $this->getJson('/api/v1/auth/demo/profils')->assertNotFound();
    $this->postJson('/api/v1/auth/demo/connexion', ['profil' => 'proprietaire'])->assertNotFound();
});

it('connecte en un clic au propriétaire, au gérant ou au caissier, et journalise', function () {
    config(['satspoint.demo.connexion_rapide' => true]);
    ['comptes' => $comptes] = boutiqueDemoJury();

    $this->getJson('/api/v1/auth/demo/profils')->assertOk()
        ->assertJsonPath('profils.0.profil', 'proprietaire')->assertJsonPath('profils.1.profil', 'gerant')->assertJsonPath('profils.2.profil', 'caissier')
        ->assertJsonPath('profils.0.actuel', false);

    foreach (['proprietaire', 'gerant', 'caissier'] as $profil) {
        app('auth')->forgetGuards();
        app(\App\Services\BoutiqueCourante::class)->oublier();
        $this->postJson('/api/v1/auth/demo/connexion', ['profil' => $profil])->assertOk()
            ->assertJsonPath('utilisateur.email', $comptes[$profil]->email);
        // Nouvelle requête HTTP : les gardes et la boutique courante ne survivent pas d'une requête à l'autre.
        app('auth')->forgetGuards();
        app(\App\Services\BoutiqueCourante::class)->oublier();
        $this->getJson('/api/v1/moi')->assertOk()->assertJsonPath('utilisateur.boutique.role', $profil);
        app('auth')->forgetGuards();
        $this->getJson('/api/v1/auth/demo/profils')->assertOk()
            ->assertJson(['profils' => [['profil' => 'proprietaire', 'actuel' => $profil === 'proprietaire'], ['profil' => 'gerant', 'actuel' => $profil === 'gerant'], ['profil' => 'caissier', 'actuel' => $profil === 'caissier']]]);
    }
    expect(JournalAudit::query()->where('action', 'auth.connexion_demo')->count())->toBe(3);
});

it('jamais le super-admin ni un profil inconnu', function () {
    config(['satspoint.demo.connexion_rapide' => true]);
    boutiqueDemoJury();
    User::factory()->superAdmin()->create();

    $this->postJson('/api/v1/auth/demo/connexion', ['profil' => 'super_admin'])->assertUnprocessable();
    $this->postJson('/api/v1/auth/demo/connexion', ['profil' => 'admin'])->assertUnprocessable();
    $this->getJson('/api/v1/auth/demo/profils')->assertOk()->assertJsonCount(3, 'profils');
});

it('protège la boutique partagée : portefeuille, équipe, réglages, suppressions et 2FA refusés aux comptes démo', function () {
    config(['satspoint.demo.connexion_rapide' => true]);
    ['comptes' => $comptes] = boutiqueDemoJury();

    connecte($comptes['proprietaire']);
    $this->deleteJson('/api/v1/boutique/wallet')->assertForbidden()->assertJsonPath('code', 'DEMO_PROTEGE');
    $this->patchJson('/api/v1/boutique', ['nom' => 'Piraté'])->assertForbidden()->assertJsonPath('code', 'DEMO_PROTEGE');
    $this->postJson('/api/v1/equipe/invitations', ['contact' => '+221771234567', 'role' => 'caissier'])->assertForbidden();
    $this->postJson('/api/v1/auth/2fa/initialiser')->assertForbidden();
    $this->postJson('/api/v1/auth/deconnexion-partout')->assertForbidden();

    // Un vrai commerçant n'est jamais concerné.
    ['user' => $autre] = boutiqueAvec('proprietaire');
    connecte($autre)->patchJson('/api/v1/boutique', ['nom' => 'Ma boutique'])->assertOk();

    // Accès rapide coupé : la démo redevient modifiable par sa propriétaire.
    config(['satspoint.demo.connexion_rapide' => false]);
    connecte($comptes['proprietaire'])->patchJson('/api/v1/boutique', ['nom' => 'Boutique Démo'])->assertOk();
});

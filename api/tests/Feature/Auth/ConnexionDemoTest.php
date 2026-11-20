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

it('Studio (démo jury) : console en lecture seule, sans 2FA ; le vrai super-admin reste protégé', function () {
    config(['satspoint.demo.connexion_rapide' => true]);
    boutiqueDemoJury();
    $studio = User::factory()->superAdmin()->create(['email' => config('satspoint.demo.email_studio')]);
    $vrai = User::factory()->superAdmin()->create();

    $this->getJson('/api/v1/auth/demo/profils')->assertOk()->assertJsonPath('profils.3.profil', 'studio');
    $this->postJson('/api/v1/auth/demo/connexion', ['profil' => 'studio'])->assertOk()->assertJsonPath('utilisateur.email', $studio->email);

    connecte($studio);
    $this->getJson('/api/v1/moi')->assertOk()->assertJsonPath('utilisateur.deux_fa.requise', false);
    $this->getJson('/api/v1/admin/audio/matrice')->assertOk();
    $this->getJson('/api/v1/admin/statistiques')->assertOk();
    $this->getJson('/api/v1/admin/langues')->assertOk();
    foreach (['admin/journal', 'admin/boutiques'] as $chemin) {
        $this->getJson("/api/v1/$chemin")->assertForbidden()->assertJsonPath('code', 'DEMO_PROTEGE');
    }
    $this->postJson('/api/v1/admin/langues', ['code' => 'xx'])->assertForbidden()->assertJsonPath('code', 'DEMO_PROTEGE');

    // Le wolof publié de la propriétaire : écoute seulement, jamais remplacé, publié ni supprimé par le jury.
    $cle = \App\Models\CleAudio::query()->firstOrCreate(['cle' => 'caisse.encaisser'], ['ecran' => 'caisse', 'contexte' => 'Bouton — Caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);
    $wo = \App\Models\Audio::query()->create(['cle_audio_id' => $cle->id, 'langue' => 'wo', 'statut' => 'publie', 'chemin' => 'audio/wo/caisse.encaisser.mp3', 'empreinte' => str_repeat('a', 64), 'duree_ms' => 1000, 'taille' => 1000, 'publie_at' => now()]);
    $this->postJson('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'wo'])->assertForbidden()->assertJsonPath('code', 'DEMO_PROTEGE');
    $this->postJson('/api/v1/admin/audio/publier', ['ids' => [$wo->id]])->assertForbidden();
    $this->postJson('/api/v1/admin/audio/publier', ['cle' => 'caisse.encaisser', 'langue' => 'wo'])->assertForbidden();
    $this->deleteJson("/api/v1/admin/audio/{$wo->id}")->assertForbidden();
    expect($wo->fresh()->statut)->toBe('publie');

    // La langue d'essai (bambara) : le jury enregistre et publie pour de vrai (la validation métier reprend la main).
    $this->postJson('/api/v1/admin/audio', ['cle' => 'caisse.encaisser', 'langue' => 'bm'])->assertStatus(422);
    $this->postJson('/api/v1/admin/audio/publier', ['cle' => 'caisse.encaisser', 'langue' => 'bm'])->assertJsonMissing(['code' => 'DEMO_PROTEGE']);

    // Le vrai super-admin n'est jamais concerné : 2FA toujours exigée, console complète.
    connecte($vrai)->getJson('/api/v1/admin/statistiques')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');

    // Accès rapide coupé : plus de connexion en un clic, et le compte Studio retombe sous la 2FA obligatoire.
    config(['satspoint.demo.connexion_rapide' => false]);
    $this->postJson('/api/v1/auth/demo/connexion', ['profil' => 'studio'])->assertNotFound();
    connecte($studio)->getJson('/api/v1/admin/audio/matrice')->assertForbidden()->assertJsonPath('code', 'DEUX_FA_REQUISE');
});

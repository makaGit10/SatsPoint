<?php

use App\Models\JournalAudit;
use App\Models\User;
use Illuminate\Support\Facades\Http;

it('inscrit un utilisateur par e-mail, le connecte et renvoie la forme attendue', function () {
    $reponse = $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa Ndiaye',
        'identifiant' => 'Awa@Example.com',
        'password' => 'Un-mot-de-passe-solide-2026',
        'password_confirmation' => 'Un-mot-de-passe-solide-2026',
        'locale' => 'en',
    ]);

    $reponse->assertCreated()
        ->assertJsonStructure(['utilisateur' => ['ulid', 'nom', 'email', 'telephone', 'role_plateforme', 'preferences' => ['locale', 'langue_audio', 'theme', 'aide_vocale'], 'boutique']])
        ->assertJsonPath('utilisateur.email', 'awa@example.com')
        ->assertJsonPath('utilisateur.telephone', null)
        ->assertJsonPath('utilisateur.role_plateforme', null)
        ->assertJsonPath('utilisateur.preferences.locale', 'en')
        ->assertJsonPath('utilisateur.boutique', null);

    $this->assertAuthenticated('web');
    expect(User::query()->where('email', 'awa@example.com')->first()->ulid)->toMatch('/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/');
    expect(JournalAudit::query()->where('action', 'auth.inscription')->exists())->toBeTrue();
});

it('inscrit un utilisateur par téléphone sénégalais normalisé en E.164', function () {
    $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Moussa Diop',
        'identifiant' => '77 123 45 67',
        'password' => 'Un-mot-de-passe-solide-2026',
        'password_confirmation' => 'Un-mot-de-passe-solide-2026',
    ])->assertCreated()->assertJsonPath('utilisateur.telephone', '+221771234567')->assertJsonPath('utilisateur.email', null);
});

it('refuse un mot de passe trop court', function () {
    $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa',
        'identifiant' => 'awa@example.com',
        'password' => 'court1234',
        'password_confirmation' => 'court1234',
    ])->assertStatus(422)->assertJsonPath('code', 'VALIDATION')->assertJsonValidationErrors(['password']);
});

it('refuse un mot de passe compromis (HIBP)', function () {
    $mdp = 'password-compromis-2026';
    $hash = strtoupper(sha1($mdp));
    Tests\TestCase::$corpsHibp = substr($hash, 5).':1234';

    $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa',
        'identifiant' => 'awa@example.com',
        'password' => $mdp,
        'password_confirmation' => $mdp,
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('refuse un identifiant invalide ou déjà pris sans fuite de détail technique', function () {
    User::factory()->create(['email' => 'pris@example.com']);

    $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa', 'identifiant' => 'pas-un-identifiant', 'password' => 'Un-mot-de-passe-solide-2026', 'password_confirmation' => 'Un-mot-de-passe-solide-2026',
    ])->assertStatus(422)->assertJsonValidationErrors(['identifiant']);

    $this->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa', 'identifiant' => 'PRIS@example.com', 'password' => 'Un-mot-de-passe-solide-2026', 'password_confirmation' => 'Un-mot-de-passe-solide-2026',
    ])->assertStatus(422)->assertJsonValidationErrors(['identifiant']);
});

it('refuse l\'inscription d\'un utilisateur déjà connecté', function () {
    connecte(User::factory()->create())->postJson('/api/v1/auth/inscription', [
        'nom' => 'Awa', 'identifiant' => 'autre@example.com', 'password' => 'Un-mot-de-passe-solide-2026', 'password_confirmation' => 'Un-mot-de-passe-solide-2026',
    ])->assertForbidden();
});

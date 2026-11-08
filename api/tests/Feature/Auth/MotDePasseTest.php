<?php

use App\Models\User;
use App\Notifications\ReinitialisationMotDePasse;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;

it('répond 202 que le compte existe ou non et envoie un lien de 30 minutes à usage unique', function () {
    Notification::fake();
    $user = User::factory()->create(['email' => 'awa@example.com']);

    $this->postJson('/api/v1/auth/mot-de-passe/oubli', ['identifiant' => 'inconnu@example.com'])->assertStatus(202);
    $this->postJson('/api/v1/auth/mot-de-passe/oubli', ['identifiant' => 'AWA@example.com'])->assertStatus(202);

    Notification::assertSentTo($user, ReinitialisationMotDePasse::class, function (ReinitialisationMotDePasse $n) use ($user) {
        $lien = $n->lien($user);

        expect($lien)->toStartWith(config('satspoint.frontend_url').'/reinitialisation?jeton=')
            ->and($lien)->toContain('identifiant=awa%40example.com');

        return Password::broker()->tokenExists($user, $n->jeton);
    });
    Notification::assertCount(1);
});

it('réinitialise le mot de passe avec un jeton valide, une seule fois, puis révoque les sessions', function () {
    Notification::fake();
    $user = User::factory()->create(['email' => 'awa@example.com']);
    $jeton = Password::broker()->createToken($user);

    $this->postJson('/api/v1/auth/mot-de-passe/reinitialisation', [
        'jeton' => $jeton,
        'identifiant' => 'awa@example.com',
        'password' => 'Nouveau-mot-de-passe-2026!',
        'password_confirmation' => 'Nouveau-mot-de-passe-2026!',
    ])->assertOk();

    $user = $user->fresh();
    expect(Hash::check('Nouveau-mot-de-passe-2026!', $user->password))->toBeTrue()
        ->and($user->sessions_revoquees_at)->not->toBeNull();

    // Usage unique.
    $this->postJson('/api/v1/auth/mot-de-passe/reinitialisation', [
        'jeton' => $jeton,
        'identifiant' => 'awa@example.com',
        'password' => 'Encore-un-autre-mdp-2026!',
        'password_confirmation' => 'Encore-un-autre-mdp-2026!',
    ])->assertStatus(422)->assertJsonValidationErrors(['jeton']);
});

it('refuse un jeton périmé (30 minutes) ou faux', function () {
    $user = User::factory()->create(['email' => 'awa@example.com']);
    $jeton = Password::broker()->createToken($user);

    $this->travel(31)->minutes();

    $this->postJson('/api/v1/auth/mot-de-passe/reinitialisation', [
        'jeton' => $jeton, 'identifiant' => 'awa@example.com',
        'password' => 'Nouveau-mot-de-passe-2026!', 'password_confirmation' => 'Nouveau-mot-de-passe-2026!',
    ])->assertStatus(422)->assertJsonValidationErrors(['jeton']);

    $this->travelBack();

    $this->postJson('/api/v1/auth/mot-de-passe/reinitialisation', [
        'jeton' => 'faux-jeton', 'identifiant' => 'awa@example.com',
        'password' => 'Nouveau-mot-de-passe-2026!', 'password_confirmation' => 'Nouveau-mot-de-passe-2026!',
    ])->assertStatus(422)->assertJsonValidationErrors(['jeton']);
});

it('limite les demandes d\'oubli à 3 par heure et par identifiant', function () {
    Notification::fake();
    User::factory()->create(['email' => 'awa@example.com']);

    for ($i = 0; $i < 3; $i++) {
        $this->postJson('/api/v1/auth/mot-de-passe/oubli', ['identifiant' => 'awa@example.com'])->assertStatus(202);
    }

    $this->postJson('/api/v1/auth/mot-de-passe/oubli', ['identifiant' => 'awa@example.com'])->assertStatus(429);
});

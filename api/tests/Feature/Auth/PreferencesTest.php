<?php

use App\Models\User;

it('renvoie /moi avec la forme exacte attendue et la boutique courante', function () {
    ['user' => $user, 'boutique' => $boutique] = boutiqueAvec('gerant');

    connecte($user)->getJson('/api/v1/moi')
        ->assertOk()
        ->assertExactJson([
            'utilisateur' => [
                'ulid' => $user->ulid,
                'nom' => $user->nom,
                'email' => $user->email,
                'telephone' => null,
                'role_plateforme' => null,
                'preferences' => ['locale' => 'fr', 'langue_audio' => 'wo', 'theme' => 'auto', 'aide_vocale' => true],
                'boutique' => [
                    'ulid' => $boutique->ulid,
                    'nom' => $boutique->nom,
                    'ville' => $boutique->ville,
                    'devise' => 'XOF',
                    'role' => 'gerant',
                    'configuration' => ['wallet' => false, 'paytech' => false, 'paiement_test' => false],
                ],
            ],
        ]);
});

it('met à jour les préférences avec validation stricte', function () {
    $user = User::factory()->create();

    connecte($user)->patchJson('/api/v1/moi/preferences', ['locale' => 'en', 'langue_audio' => 'srr', 'theme' => 'sombre', 'aide_vocale' => false])
        ->assertOk()
        ->assertJsonPath('utilisateur.preferences', ['locale' => 'en', 'langue_audio' => 'srr', 'theme' => 'sombre', 'aide_vocale' => false]);

    $this->getJson('/api/v1/moi')->assertJsonPath('utilisateur.preferences.langue_audio', 'srr');

    $this->patchJson('/api/v1/moi/preferences', ['locale' => 'de'])->assertStatus(422)->assertJsonValidationErrors(['locale']);
    $this->patchJson('/api/v1/moi/preferences', ['langue_audio' => 'xx'])->assertStatus(422)->assertJsonValidationErrors(['langue_audio']);
    $this->patchJson('/api/v1/moi/preferences', ['theme' => 'rose'])->assertStatus(422)->assertJsonValidationErrors(['theme']);
    $this->patchJson('/api/v1/moi/preferences', ['aide_vocale' => 'peut-être'])->assertStatus(422)->assertJsonValidationErrors(['aide_vocale']);
});

it('refuse /moi sans session', function () {
    $this->getJson('/api/v1/moi')->assertStatus(401);
    $this->patchJson('/api/v1/moi/preferences', ['locale' => 'en'])->assertStatus(401);
});

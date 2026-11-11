<?php

use App\Models\User;

it('n\'expose jamais le code 2FA hors environnement local (route absente)', function () {
    $admin = User::factory()->superAdmin()->create();

    // Environnement de test : la route n'est pas déclarée, quelle que soit la variable.
    connecte($admin)->getJson('/api/v1/auth/2fa/code-local')->assertNotFound();
    expect(config('satspoint.deux_fa_code_local'))->toBeFalse();
});

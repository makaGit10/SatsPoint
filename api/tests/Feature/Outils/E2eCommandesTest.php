<?php

use App\Models\Boutique;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;

it('e2e:compte crée un compte préfixé et refuse un préfixe libre', function () {
    expect(Artisan::call('e2e:compte', ['prefixe' => 'TEST-E2E-pest', '--nom' => 'Awa']))->toBe(0);
    $sortie = json_decode(trim(Artisan::output()), true);

    $user = User::query()->where('email', $sortie['identifiant'])->firstOrFail();
    expect($user->nom)->toBe('TEST-E2E-pest Awa')
        ->and($user->estSuperAdmin())->toBeFalse()
        ->and(password_verify($sortie['password'], $user->password))->toBeTrue();

    expect(Artisan::call('e2e:compte', ['prefixe' => 'PROD-x']))->toBe(1);
    expect(Artisan::call('e2e:compte', ['prefixe' => 'TEST-E2E-pest', '--super-admin' => true]))->toBe(0);
    expect(User::query()->where('role_plateforme', User::ROLE_SUPER_ADMIN)->where('nom', 'like', 'TEST-E2E-pest%')->count())->toBe(1);
});

it('e2e:nettoyer supprime seulement les données préfixées', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');
    $boutique->forceFill(['nom' => 'TEST-E2E-pest boutique'])->save();
    $proprio->forceFill(['nom' => 'TEST-E2E-pest proprio'])->save();
    $sansEmail = User::factory()->create(['nom' => 'TEST-E2E-pest tel', 'email' => null, 'telephone' => '+221701234567']);
    ['boutique' => $autre] = boutiqueAvec('proprietaire');

    expect(Artisan::call('e2e:nettoyer', ['prefixe' => 'TEST-E2E-pest']))->toBe(0);

    expect(Boutique::query()->whereKey($boutique->id)->exists())->toBeFalse()
        ->and(User::query()->whereKey($proprio->id)->exists())->toBeFalse()
        ->and(User::query()->whereKey($sansEmail->id)->exists())->toBeFalse()
        ->and(Boutique::query()->whereKey($autre->id)->exists())->toBeTrue();

    expect(Artisan::call('e2e:nettoyer', ['prefixe' => 'tout']))->toBe(1);
});

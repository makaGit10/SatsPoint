<?php

use App\Exceptions\BoutiqueCouranteAbsente;
use App\Models\Article;
use App\Models\Boutique;
use App\Models\Membre;
use App\Services\BoutiqueCourante;

it('refuse toute requête métier sans boutique courante', function () {
    expect(fn () => Article::query()->count())->toThrow(BoutiqueCouranteAbsente::class)
        ->and(fn () => Membre::all())->toThrow(BoutiqueCouranteAbsente::class)
        ->and(fn () => Article::create(['nom' => 'X', 'prix_xof' => 100]))->toThrow(BoutiqueCouranteAbsente::class);
});

it('cloisonne les données entre boutiques et remplit boutique_id automatiquement', function () {
    $a = Boutique::factory()->create();
    $b = Boutique::factory()->create();

    avecBoutique($a, fn () => Article::create(['nom' => 'Café Touba', 'prix_xof' => 200]));
    avecBoutique($b, fn () => Article::create(['nom' => 'Bissap', 'prix_xof' => 300]));

    avecBoutique($a, function () use ($a) {
        expect(Article::query()->pluck('nom')->all())->toBe(['Café Touba'])
            ->and(Article::query()->first()->boutique_id)->toBe($a->id)
            ->and(Article::query()->where('nom', 'Bissap')->exists())->toBeFalse();
    });

    expect(Article::toutesBoutiques()->count())->toBe(2)
        ->and(Article::pourBoutique($b)->pluck('nom')->all())->toBe(['Bissap']);
});

it('résout la boutique courante depuis le membre actif de l\'utilisateur connecté', function () {
    ['user' => $user, 'boutique' => $boutique] = boutiqueAvec('caissier');
    avecBoutique($boutique, fn () => Article::create(['nom' => 'Pain', 'prix_xof' => 150]));
    avecBoutique(Boutique::factory()->create(), fn () => Article::create(['nom' => 'Ailleurs', 'prix_xof' => 1]));

    connecte($user);

    expect(app(BoutiqueCourante::class)->obtenir()->id)->toBe($boutique->id)
        ->and(Article::query()->pluck('nom')->all())->toBe(['Pain']);
});

it('n\'applique jamais une boutique d\'un autre utilisateur après changement de session', function () {
    ['user' => $u1, 'boutique' => $b1] = boutiqueAvec('proprietaire');
    ['user' => $u2, 'boutique' => $b2] = boutiqueAvec('proprietaire');

    connecte($u1);
    expect(app(BoutiqueCourante::class)->id())->toBe($b1->id);

    connecte($u2);
    expect(app(BoutiqueCourante::class)->id())->toBe($b2->id);
});

<?php

use App\Models\CleAudio;
use Database\Seeders\CleAudioSeeder;
use Illuminate\Support\Facades\Storage;

/*
|--------------------------------------------------------------------------
| Registre des clés vocales (CAHIER § 6.12 « source unique des clés »)
|--------------------------------------------------------------------------
*/

function fichierCles(array $cles): string
{
    Storage::disk('local')->put('tests/cles-vocales.json', json_encode($cles, JSON_UNESCAPED_UNICODE));

    return Storage::disk('local')->path('tests/cles-vocales.json');
}

it('seede un jeu idempotent d\'une trentaine de clés essentielles du parcours d\'encaissement', function () {
    $this->seed(CleAudioSeeder::class);
    $this->seed(CleAudioSeeder::class);

    expect(CleAudio::query()->count())->toBeGreaterThanOrEqual(30)
        ->and(CleAudio::query()->where('essentielle', false)->count())->toBe(0)
        ->and(CleAudio::query()->where('cle', 'paiement.recu')->first())->not->toBeNull()
        ->and(CleAudio::query()->where('cle', 'caisse.encaisser')->value('ordre'))->toBe(11);

    foreach (['langue.wo', 'langue.srr', 'langue.ff', 'langue.dyo', 'langue.fr', 'langue.en', 'nav.caisse', 'commun.retour', 'succes.nouvelle_vente'] as $cle) {
        expect(CleAudio::query()->where('cle', $cle)->exists())->toBeTrue($cle);
    }
});

it('synchronise le registre depuis le fichier du front : upsert dans l\'ordre, clés disparues conservées mais marquées', function () {
    CleAudio::create(['cle' => 'ancienne.cle', 'ecran' => 'x', 'texte_fr' => 'Ancienne', 'texte_en' => 'Old', 'ordre' => 99]);
    CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Vieux texte', 'texte_en' => 'Old text', 'ordre' => 5, 'essentielle' => false]);

    $chemin = fichierCles([
        ['cle' => 'nav.caisse', 'ecran' => 'navigation', 'contexte' => 'Onglet', 'texte_fr' => 'Caisse', 'texte_en' => 'Checkout', 'essentielle' => true],
        ['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'contexte' => 'Bouton principal', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => false],
        ['cle' => 'reglages.theme.sombre', 'ecran' => 'reglages', 'texte_fr' => 'Sombre', 'texte_en' => 'Dark'],
        ['cle' => '../../etc/passwd', 'ecran' => 'x', 'texte_fr' => 'x', 'texte_en' => 'x'],   // forme invalide : ignorée
        ['cle' => 'nav.caisse', 'ecran' => 'doublon', 'texte_fr' => 'x', 'texte_en' => 'x'], // doublon : ignoré
    ]);

    $this->artisan('audio:synchroniser', ['chemin' => $chemin])
        ->expectsOutputToContain('2 créées, 1 mises à jour')
        ->assertSuccessful();

    expect(CleAudio::query()->count())->toBe(4);

    $encaisser = CleAudio::query()->where('cle', 'caisse.encaisser')->first();
    expect($encaisser->ordre)->toBe(2)->and($encaisser->texte_fr)->toBe('Encaisser')->and($encaisser->presente_dans_code)->toBeTrue()
        ->and($encaisser->essentielle)->toBeTrue(); // clé du parcours d'encaissement : essentielle quoi qu'en dise le fichier

    expect(CleAudio::query()->where('cle', 'nav.caisse')->value('ordre'))->toBe(1)
        ->and(CleAudio::query()->where('cle', 'reglages.theme.sombre')->value('essentielle'))->toBeFalse()
        ->and(CleAudio::query()->where('cle', 'ancienne.cle')->value('presente_dans_code'))->toBeFalse()
        ->and(CleAudio::query()->where('cle', 'like', '%passwd%')->exists())->toBeFalse();

    // Relance identique : rien ne bouge.
    $this->artisan('audio:synchroniser', ['chemin' => $chemin])->expectsOutputToContain('0 créées, 0 mises à jour')->assertSuccessful();

    // La clé réapparaît dans le code : à nouveau présente.
    $chemin = fichierCles([['cle' => 'ancienne.cle', 'ecran' => 'x', 'texte_fr' => 'Revenue', 'texte_en' => 'Back']]);
    $this->artisan('audio:synchroniser', ['chemin' => $chemin])->assertSuccessful();
    expect(CleAudio::query()->where('cle', 'ancienne.cle')->value('presente_dans_code'))->toBeTrue()
        ->and(CleAudio::query()->where('cle', 'nav.caisse')->value('presente_dans_code'))->toBeFalse();
});

it('sans fichier, la commande seede le jeu essentiel et réussit ; un JSON invalide échoue sans rien modifier', function () {
    $this->artisan('audio:synchroniser', ['chemin' => '/inexistant/cles.json'])->assertSuccessful();
    expect(CleAudio::query()->count())->toBeGreaterThanOrEqual(30);

    Storage::disk('local')->put('tests/invalide.json', '{pas du json');
    $this->artisan('audio:synchroniser', ['chemin' => Storage::disk('local')->path('tests/invalide.json')])->assertFailed();
    expect(CleAudio::query()->where('presente_dans_code', false)->count())->toBe(0);
});

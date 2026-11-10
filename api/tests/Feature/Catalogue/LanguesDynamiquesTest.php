<?php

use App\Jobs\TraiterAudio;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\Langue;
use App\Models\User;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;

/*
|--------------------------------------------------------------------------
| Langues dynamiques (CONTRAT_API § 14.1 et 14.5) : manifeste, dépôt / publication au studio, matrice,
| préférences, statistiques, registre des clés vocales.
|--------------------------------------------------------------------------
*/

beforeEach(function () {
    Storage::fake('public');
    Storage::fake('local');
    Storage::fake('cache-audio');
});

it('ouvre une nouvelle langue au studio : colonne de matrice, dépôt, publication, manifeste ; refusée une fois désactivée', function () {
    Queue::fake();
    superAdminPret();
    CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge', 'essentielle' => true, 'ordre' => 1]);

    // Avant création : langue inconnue partout.
    $this->getJson('/api/v1/audio/manifeste/bm')->assertNotFound();
    $this->getJson('/api/v1/admin/audio/matrice?langue=bm')->assertStatus(422);

    $this->postJson('/api/v1/admin/langues', ['code' => 'bm', 'nom_local' => 'Bamanankan', 'nom_fr' => 'Bambara', 'nom_en' => 'Bambara', 'pays' => ['ML']])->assertCreated();

    $m = $this->getJson('/api/v1/admin/audio/matrice')->assertOk();
    expect(array_column($m->json('langues'), 'code'))->toBe(['wo', 'srr', 'ff', 'dyo', 'bm', 'fr'])
        ->and(collect($m->json('langues'))->firstWhere('code', 'bm'))->toBe(['code' => 'bm', 'nom' => 'Bambara', 'nom_local' => 'Bamanankan', 'pays' => ['ML']])
        ->and($m->json('couverture.bm.total'))->toBe(2)                 // caisse.encaisser + langue.bm
        ->and(array_column($m->json('cles'), 'cle'))->toContain('langue.bm');

    $id = $this->post('/api/v1/admin/audio', ['cle' => 'langue.bm', 'langue' => 'bm', 'fichier' => wavGenere(0.3, 0.6)])->assertStatus(202)->json('audio.id');
    app()->call([new TraiterAudio($id), 'handle']);
    expect(Audio::query()->find($id)->statut)->toBe('brouillon');

    $this->postJson('/api/v1/admin/audio/publier', ['cle' => 'langue.bm', 'langue' => 'bm'])->assertOk()->assertJsonPath('publies', 1);

    $manifeste = $this->getJson('/api/v1/audio/manifeste/bm')->assertOk()->assertJsonPath('langue', 'bm');
    $audios = $manifeste->json('audios');
    expect(array_keys($audios))->toBe(['langue.bm'])
        ->and($audios['langue.bm'])->toContain('/audio/bm/langue.bm.');
    $this->get((string) parse_url($audios['langue.bm'], PHP_URL_PATH))->assertOk();

    // Désactivée : plus de dépôt ni de colonne, mais le manifeste reste servi (appareils qui l'avaient choisie).
    $this->patchJson('/api/v1/admin/langues/bm', ['actif' => false])->assertOk();
    $this->post('/api/v1/admin/audio', ['cle' => 'langue.bm', 'langue' => 'bm', 'fichier' => wavGenere(0.3, 0.6)])->assertStatus(422)->assertJsonValidationErrors(['langue']);
    expect(array_column($this->getJson('/api/v1/admin/audio/matrice')->json('langues'), 'code'))->not->toContain('bm');
    $this->getJson('/api/v1/audio/manifeste/bm')->assertOk();

    // Une langue qui a un audio publié ne se supprime pas.
    $this->deleteJson('/api/v1/admin/langues/bm')->assertStatus(409)->assertJsonPath('code', 'LANGUE_UTILISEE');

    // Couverture de la console : langues actives seulement.
    expect(array_keys($this->getJson('/api/v1/admin/statistiques')->json('couverture_audio')))->toBe(['wo', 'srr', 'ff', 'dyo', 'fr']);
});

it('accepte comme langue audio des préférences toute langue active, et seulement elles', function () {
    $user = User::factory()->create();
    Langue::create(['code' => 'mos', 'nom_local' => 'Mooré', 'nom_fr' => 'Mooré', 'nom_en' => 'Mossi', 'pays' => ['BF'], 'actif' => true, 'ordre' => 6]);
    Langue::create(['code' => 'ee', 'nom_local' => 'Eʋegbe', 'nom_fr' => 'Éwé', 'nom_en' => 'Ewe', 'pays' => ['TG'], 'actif' => false, 'ordre' => 7]);

    connecte($user)->patchJson('/api/v1/moi/preferences', ['langue_audio' => 'mos'])->assertOk()->assertJsonPath('utilisateur.preferences.langue_audio', 'mos');
    $this->patchJson('/api/v1/moi/preferences', ['langue_audio' => 'ee'])->assertStatus(422)->assertJsonValidationErrors(['langue_audio']);
    $this->patchJson('/api/v1/moi/preferences', ['langue_audio' => 'xx'])->assertStatus(422);
    $this->patchJson('/api/v1/moi/preferences', ['langue_audio' => 'wo'])->assertOk();
});

it('audio:synchroniser ne retire jamais la clé vocale d\'une langue du catalogue', function () {
    superAdminPret();
    $this->postJson('/api/v1/admin/langues', ['code' => 'dyu', 'nom_local' => 'Julakan', 'nom_fr' => 'Dioula', 'nom_en' => 'Dyula', 'pays' => ['CI', 'BF']])->assertCreated();
    CleAudio::create(['cle' => 'ancienne.cle', 'ecran' => 'x', 'texte_fr' => 'x', 'texte_en' => 'x']);

    Storage::disk('local')->put('tests/cles.json', json_encode([['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']]));
    $this->artisan('audio:synchroniser', ['chemin' => Storage::disk('local')->path('tests/cles.json'), '--sans-signal' => true])->assertSuccessful();

    expect(CleAudio::query()->where('cle', 'langue.dyu')->value('presente_dans_code'))->toBeTrue()
        ->and(CleAudio::query()->where('cle', 'ancienne.cle')->value('presente_dans_code'))->toBeFalse();
});

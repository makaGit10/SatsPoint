<?php

use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\User;
use Illuminate\Support\Facades\Http;

it('expose /api/v1/config avec la forme exacte', function () {
    $this->getJson('/api/v1/config')->assertOk()->assertExactJson([
        'app' => ['nom' => config('app.name'), 'env' => 'testing', 'demo' => true, 'version' => config('satspoint.version')],
        'reverb' => ['cle' => config('reverb.apps.apps.0.key'), 'hote' => config('satspoint.reverb_public.hote'), 'port' => config('satspoint.reverb_public.port'), 'schema' => config('satspoint.reverb_public.schema')],
        'locales' => ['fr', 'en'],
        'langues_audio' => [
            ['code' => 'wo', 'nom' => 'Wolof', 'nom_local' => 'Wolof'],
            ['code' => 'srr', 'nom' => 'Sérère', 'nom_local' => 'Seereer'],
            ['code' => 'ff', 'nom' => 'Pulaar', 'nom_local' => 'Pulaar'],
            ['code' => 'dyo', 'nom' => 'Diola', 'nom_local' => 'Joola'],
            ['code' => 'fr', 'nom' => 'Français', 'nom_local' => 'Français'],
        ],
    ]);

    // La clé publique Reverb est exposée, jamais le secret.
    expect($this->getJson('/api/v1/config')->getContent())->not->toContain(config('reverb.apps.apps.0.secret'));
});

it('répond /up et /sante (base ok, dépendances externes dégradées en test)', function () {
    Http::fake(['*' => Http::response('', 500)]);

    $this->get('/up')->assertOk();

    $this->getJson('/sante')->assertOk()
        ->assertJsonStructure(['statut', 'base', 'redis', 'reverb', 'passerelle', 'cours' => ['age_s'], 'version', 'horodatage'])
        ->assertJsonPath('base', true)
        ->assertJsonPath('redis', true)
        ->assertJsonPath('reverb', false)
        ->assertJsonPath('passerelle', false)
        ->assertJsonPath('cours.age_s', null)
        ->assertJsonPath('statut', 'degrade');
});

it('sert le manifeste audio publié avec cache et ETag', function () {
    $admin = User::factory()->superAdmin()->create();
    $cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']);
    $cle2 = CleAudio::create(['cle' => 'caisse.annuler', 'ecran' => 'caisse', 'texte_fr' => 'Annuler', 'texte_en' => 'Cancel']);
    Audio::create(['cle_audio_id' => $cle->id, 'langue' => 'wo', 'chemin' => 'audio/wo/x.mp3', 'empreinte' => str_repeat('a', 64), 'duree_ms' => 900, 'taille' => 4000, 'statut' => 'publie', 'enregistre_par' => $admin->id, 'publie_at' => now()]);
    Audio::create(['cle_audio_id' => $cle2->id, 'langue' => 'wo', 'chemin' => 'audio/wo/y.mp3', 'empreinte' => str_repeat('b', 64), 'statut' => 'brouillon', 'enregistre_par' => $admin->id]);

    $vide = $this->getJson('/api/v1/audio/manifeste/srr')->assertOk()->assertJsonPath('langue', 'srr')->assertJsonPath('audios', []);
    expect($vide->json('version'))->toBeString()->toHaveLength(16)->and(array_keys($vide->json()))->toBe(['langue', 'version', 'audios']);

    $reponse = $this->getJson('/api/v1/audio/manifeste/wo')->assertOk()
        ->assertJsonPath('langue', 'wo')
        ->assertJsonPath('audios', ['caisse.encaisser' => url('/audio/wo/caisse.encaisser.'.str_repeat('a', 16).'.mp3')])
        ->assertHeader('ETag');

    expect($reponse->headers->get('Cache-Control'))->toContain('max-age=60')->toContain('public');

    $this->withHeaders(['If-None-Match' => $reponse->headers->get('ETag')])->getJson('/api/v1/audio/manifeste/wo')->assertStatus(304);

    $this->getJson('/api/v1/audio/manifeste/xx')->assertNotFound();
    $this->getJson('/api/v1/audio/manifeste/klingon')->assertNotFound();
});

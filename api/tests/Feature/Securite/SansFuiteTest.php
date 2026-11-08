<?php

use App\Models\ComptePaytech;
use App\Models\ConnexionWallet;
use App\Models\User;
use Illuminate\Log\Events\MessageLogged;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

const MOTS_INTERDITS = ['uri_chiffree', 'api_secret', 'api_key', 'secret', 'password', 'two_factor', 'remember_token', 'jeton_hash', 'pin_hash', 'nostr+walletconnect', 'mock://'];

it('n\'expose aucun secret dans /moi, /boutique et /equipe', function () {
    ['user' => $proprio, 'boutique' => $boutique] = boutiqueAvec('proprietaire');

    avecBoutique($boutique, function () {
        ConnexionWallet::create(['uri_chiffree' => 'nostr+walletconnect://pubkey?relay=wss://relay.example&secret=TRES-SECRET', 'statut' => 'active']);
        ComptePaytech::create(['api_key_chiffree' => 'CLE-PAYTECH', 'api_secret_chiffree' => 'SECRET-PAYTECH', 'environnement' => 'test', 'statut' => 'actif']);
    });

    $reponses = [
        connecte($proprio)->getJson('/api/v1/moi')->assertOk()->assertJsonPath('utilisateur.boutique.configuration', ['wallet' => true, 'paytech' => true, 'paiement_test' => false]),
        $this->getJson('/api/v1/boutique')->assertOk()->assertJsonPath('boutique.paytech', ['configure' => true, 'environnement' => 'test']),
        $this->getJson('/api/v1/equipe')->assertOk(),
    ];

    foreach ($reponses as $reponse) {
        $json = strtolower($reponse->getContent());
        foreach (MOTS_INTERDITS as $mot) {
            expect($json)->not->toContain(strtolower($mot));
        }
        expect($json)->not->toContain('tres-secret')->not->toContain('cle-paytech')->not->toContain('secret-paytech');
    }
});

it('stocke les secrets chiffrés en base (jamais en clair) et les relit déchiffrés', function () {
    ['boutique' => $boutique] = boutiqueAvec('proprietaire');

    avecBoutique($boutique, function () use ($boutique) {
        ConnexionWallet::create(['uri_chiffree' => 'mock://demo', 'statut' => 'active']);
        ComptePaytech::create(['api_key_chiffree' => 'CLE', 'api_secret_chiffree' => 'SECRET', 'environnement' => 'test', 'statut' => 'actif']);

        $brut = DB::table('connexions_wallet')->where('boutique_id', $boutique->id)->value('uri_chiffree');
        expect($brut)->toStartWith('v1:')->not->toContain('mock://');
        expect(ConnexionWallet::query()->first()->uri_chiffree)->toBe('mock://demo');

        $brutPaytech = DB::table('comptes_paytech')->where('boutique_id', $boutique->id)->first();
        expect($brutPaytech->api_key_chiffree)->not->toContain('CLE')->and($brutPaytech->api_secret_chiffree)->not->toContain('SECRET');
        expect(ComptePaytech::query()->first()->api_secret_chiffree)->toBe('SECRET');
    });

    $user = User::factory()->create();
    $user->forceFill(['two_factor_secret' => 'JBSWY3DPEHPK3PXP'])->save();
    expect(DB::table('users')->where('id', $user->id)->value('two_factor_secret'))->toStartWith('v1:')
        ->and($user->fresh()->two_factor_secret)->toBe('JBSWY3DPEHPK3PXP')
        ->and($user->fresh()->toArray())->not->toHaveKeys(['two_factor_secret', 'password', 'remember_token']);
});

it('n\'écrit aucune donnée personnelle ni mot de passe dans les logs lors d\'une connexion', function () {
    $user = User::factory()->create(['email' => 'awa.ndiaye@example.com', 'telephone' => '+221771234567']);

    $messages = [];
    Log::listen(function (MessageLogged $e) use (&$messages) {
        $messages[] = $e->message.' '.json_encode($e->context);
    });

    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa.ndiaye@example.com', 'password' => 'mauvais-mdp'])->assertStatus(401);
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => 'awa.ndiaye@example.com', 'password' => MDP_TEST])->assertOk();
    $this->postJson('/api/v1/auth/connexion', ['identifiant' => '+221771234567', 'password' => MDP_TEST])->assertOk();

    $tout = implode("\n", $messages);
    expect($tout)->not->toContain('awa.ndiaye')->not->toContain('771234567')->not->toContain(MDP_TEST)->not->toContain('mauvais-mdp')->not->toContain($user->nom);
});

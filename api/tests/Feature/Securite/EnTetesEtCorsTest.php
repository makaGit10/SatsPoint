<?php

it('ajoute les en-têtes de sécurité sur les réponses API', function () {
    $reponse = $this->getJson('/api/v1/config')->assertOk();

    $reponse->assertHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'DENY')
        ->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
        ->assertHeaderMissing('Strict-Transport-Security')
        ->assertHeaderMissing('X-Powered-By');

    expect($reponse->headers->get('Permissions-Policy'))->toContain('camera=()')->toContain('microphone=()')
        ->and($reponse->headers->get('Cache-Control'))->toContain('no-store');
});

it('ajoute HSTS en HTTPS', function () {
    $this->getJson('https://localhost:8120/api/v1/config')
        ->assertOk()
        ->assertHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
});

it('autorise CORS uniquement pour les origines déclarées, avec les cookies', function () {
    $front = config('satspoint.frontend_url');

    $ok = $this->withHeaders(['Origin' => $front, 'Access-Control-Request-Method' => 'GET'])
        ->options('/api/v1/moi');
    $ok->assertNoContent();
    expect($ok->headers->get('Access-Control-Allow-Origin'))->toBe($front)
        ->and($ok->headers->get('Access-Control-Allow-Credentials'))->toBe('true');

    $refus = $this->withHeaders(['Origin' => 'https://evil.example', 'Access-Control-Request-Method' => 'GET'])
        ->options('/api/v1/moi');
    expect($refus->headers->get('Access-Control-Allow-Origin'))->toBeNull();

    // Une requête simple depuis une origine inconnue ne reçoit pas d'en-tête CORS.
    $simple = $this->withHeaders(['Origin' => 'https://evil.example'])->getJson('/api/v1/config');
    expect($simple->headers->get('Access-Control-Allow-Origin'))->toBeNull();

    // Jamais « * ».
    expect(config('cors.allowed_origins'))->not->toContain('*')->and(config('cors.allowed_origins'))->toContain($front);
});

it('ne renvoie pas de détails techniques sur une route inconnue ou une méthode interdite', function () {
    $this->getJson('/api/v1/inexistant')->assertNotFound()->assertExactJson(['message' => 'Ressource introuvable.', 'code' => 'INTROUVABLE']);
    $this->deleteJson('/api/v1/config')->assertStatus(405)->assertJsonPath('code', 'METHODE_INTERDITE');
});

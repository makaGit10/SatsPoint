<?php

use App\Models\Invitation;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| GET /api/v1/invitations/{jeton} — aperçu public d'une invitation (CONTRAT_API V3.8)
|--------------------------------------------------------------------------
*/

/** Crée une invitation en attente et renvoie le jeton en clair. */
function invitationEnAttente(array $boutiqueEtProprio, string $contact = 'aminata.sow@example.sn', string $role = 'caissier', ?DateTimeInterface $expire = null): string
{
    $jeton = str_repeat('k', 24).bin2hex(random_bytes(12));

    avecBoutique($boutiqueEtProprio['boutique'], function () use ($jeton, $contact, $role, $expire, $boutiqueEtProprio) {
        $inv = new Invitation(['contact' => $contact, 'role' => $role, 'expire_at' => $expire ?? now()->addHours(72)]);
        $inv->forceFill(['jeton_hash' => Invitation::hacher($jeton), 'invite_par' => $boutiqueEtProprio['user']->id])->save();
    });

    return $jeton;
}

it('renvoie le nom de la boutique, le rôle, le contact masqué et l\'expiration — sans session', function () {
    $b = boutiqueAvec('proprietaire');
    $b['boutique']->forceFill(['nom' => 'Boutique Ndèye'])->save();
    $jeton = invitationEnAttente($b);

    $r = $this->getJson("/api/v1/invitations/{$jeton}")->assertOk()
        ->assertJsonPath('invitation.boutique', ['nom' => 'Boutique Ndèye'])
        ->assertJsonPath('invitation.role', 'caissier')
        ->assertJsonPath('invitation.contact_masque', 'am***@example.sn')
        ->assertHeader('Cache-Control', 'no-store, private');

    expect(array_keys($r->json('invitation')))->toBe(['boutique', 'role', 'contact_masque', 'expire_le'])
        ->and($r->json('invitation.expire_le'))->toBeString()
        ->and($r->getContent())->not->toContain('aminata')->not->toContain($b['boutique']->ulid)->not->toContain('jeton');
});

it('masque aussi un numéro de téléphone', function () {
    $jeton = invitationEnAttente(boutiqueAvec('proprietaire'), '+221771234567', 'gerant');

    $this->getJson("/api/v1/invitations/{$jeton}")->assertOk()
        ->assertJsonPath('invitation.role', 'gerant')
        ->assertJsonPath('invitation.contact_masque', '+221*****67');
});

it('répond 404 à un jeton inconnu et refuse un jeton de forme invalide', function () {
    $this->getJson('/api/v1/invitations/'.str_repeat('z', 48))->assertNotFound()->assertJsonPath('code', 'INTROUVABLE');
    $this->getJson('/api/v1/invitations/court')->assertNotFound();
    $this->getJson('/api/v1/invitations/'.str_repeat('a', 30).'..%2F..%2Fetc')->assertNotFound();
});

it('répond 410 INVITATION_EXPIREE à une invitation expirée, déjà acceptée ou d\'une boutique suspendue', function () {
    $b = boutiqueAvec('proprietaire');

    $expiree = invitationEnAttente($b, 'a@example.sn', 'caissier', now()->subMinute());
    $this->getJson("/api/v1/invitations/{$expiree}")->assertStatus(410)->assertJsonPath('code', 'INVITATION_EXPIREE');

    $acceptee = invitationEnAttente($b, 'b@example.sn');
    Invitation::toutesBoutiques()->where('jeton_hash', Invitation::hacher($acceptee))->update(['acceptee_at' => now()]);
    $this->getJson("/api/v1/invitations/{$acceptee}")->assertStatus(410)->assertJsonPath('code', 'INVITATION_EXPIREE');

    $valide = invitationEnAttente($b, 'c@example.sn');
    $this->getJson("/api/v1/invitations/{$valide}")->assertOk();
    $b['boutique']->forceFill(['statut' => 'suspendue'])->save();
    $this->getJson("/api/v1/invitations/{$valide}")->assertStatus(410);
});

it('est accessible connecté comme anonyme, et l\'acceptation reste réservée à une session', function () {
    $b = boutiqueAvec('proprietaire');
    $jeton = invitationEnAttente($b, 'moussa@example.com');

    $this->postJson("/api/v1/invitations/{$jeton}/accepter")->assertUnauthorized();

    $moussa = User::factory()->create(['email' => 'moussa@example.com']);
    connecte($moussa)->getJson("/api/v1/invitations/{$jeton}")->assertOk()->assertJsonPath('invitation.contact_masque', 'mo***@example.com');
    $this->postJson("/api/v1/invitations/{$jeton}/accepter")->assertOk()->assertJsonPath('utilisateur.boutique.role', 'caissier');

    // Une fois acceptée, l'aperçu public la dit expirée.
    $this->getJson("/api/v1/invitations/{$jeton}")->assertStatus(410);
});

it('limite les consultations à 20 par minute et par IP (énumération de jetons)', function () {
    for ($i = 0; $i < 20; $i++) {
        $this->getJson('/api/v1/invitations/'.str_repeat('q', 40).sprintf('%08d', $i))->assertNotFound();
    }
    $this->getJson('/api/v1/invitations/'.str_repeat('q', 48))->assertStatus(429)->assertJsonPath('code', 'TROP_DE_TENTATIVES');
});

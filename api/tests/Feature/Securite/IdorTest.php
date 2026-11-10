<?php

use App\Models\Article;
use App\Models\Audio;
use App\Models\CleAudio;
use App\Models\Import;
use App\Models\Invitation;
use App\Models\Membre;
use App\Models\MoyenPaiement;
use Illuminate\Routing\Route as RouteInstance;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Balayage anti-IDOR automatique (DIRECTIVES § 2 règle 3, CAHIER § 13.2)
|--------------------------------------------------------------------------
| Pour CHAQUE route authentifiée de routes/api.php qui porte un paramètre,
| un utilisateur d'une AUTRE boutique doit recevoir 403 ou 404 quand il vise
| une ressource de la boutique A. Toute nouvelle route paramétrée est couverte
| automatiquement.
*/

function routesParametreesAuthentifiees(): array
{
    return collect(Route::getRoutes()->getRoutes())
        ->filter(fn (RouteInstance $r) => str_starts_with($r->uri(), 'api/v1/'))
        ->filter(fn (RouteInstance $r) => in_array('auth:sanctum', $r->gatherMiddleware(), true))
        ->filter(fn (RouteInstance $r) => $r->parameterNames() !== [])
        ->mapWithKeys(fn (RouteInstance $r) => [implode('|', array_diff($r->methods(), ['HEAD'])).' /'.$r->uri() => $r])
        ->all();
}

it('couvre bien des routes paramétrées (sinon le balayage est vide)', function () {
    expect(count(routesParametreesAuthentifiees()))->toBeGreaterThanOrEqual(12);
});

it('refuse l\'accès inter-boutiques sur chaque route paramétrée', function () {
    // Boutique A et ses ressources.
    ['boutique' => $boutiqueA, 'user' => $proprioA] = boutiqueAvec('proprietaire');
    ['membre' => $membreA] = boutiqueAvec('caissier', $boutiqueA);
    $jetonA = str_repeat('a', 48);
    $invitationA = avecBoutique($boutiqueA, function () use ($jetonA, $proprioA) {
        $inv = new Invitation(['contact' => 'intrus@example.com', 'role' => 'caissier', 'expire_at' => now()->addDay()]);
        $inv->forceFill(['jeton_hash' => Invitation::hacher($jetonA), 'invite_par' => $proprioA->id])->save();

        return $inv;
    });

    // Vague 2 : vente, tentative de paiement et article de la boutique A.
    $articleA = avecBoutique($boutiqueA, fn () => Article::create(['nom' => 'Café', 'prix_xof' => 200]));
    ['vente' => $venteA, 'paiement' => $paiementA] = venteAvecTentative($boutiqueA, $proprioA, 'wave_manuel');

    // Vague 3 : import de la boutique A, audio de la plateforme (console réservée au super-admin + 2FA).
    $importA = avecBoutique($boutiqueA, fn () => Import::create(['user_id' => $proprioA->id, 'type' => 'articles', 'fichier' => 'imports/x.csv', 'statut' => 'analyse', 'analyse' => ['colonnes' => ['Nom', 'Prix'], 'format' => 'csv', 'total' => 1]]));
    $cle = CleAudio::create(['cle' => 'caisse.encaisser', 'ecran' => 'caisse', 'texte_fr' => 'Encaisser', 'texte_en' => 'Charge']);
    $audio = Audio::create(['cle_audio_id' => $cle->id, 'langue' => 'wo', 'chemin' => 'audio/wo/caisse.encaisser.aaaaaaaa.mp3', 'empreinte' => str_repeat('a', 64), 'statut' => 'brouillon']);

    // Utilisateur de la boutique B (propriétaire : le rôle le plus puissant), boutique prête à encaisser.
    ['user' => $proprioB] = boutiquePrete();

    $valeurs = [
        'membre' => $membreA->ulid,
        'invitation' => $invitationA->ulid,
        'jeton' => $jetonA,
        'vente' => $venteA->ulid,
        'paiement' => $paiementA->ulid,
        'article' => $articleA->ulid,
        'import' => $importA->ulid,
        'boutique' => $boutiqueA->ulid,
        'audio' => (string) $audio->id,
        // Catalogues (CONTRAT_API § 14) : console réservée au super-admin ; moyen d'un AUTRE pays que la boutique B (SN).
        'langue' => 'wo',
        'pays' => 'SN',
        'moyen' => MoyenPaiement::query()->where('pays', 'CI')->value('ulid'),
    ];

    $resultats = [];

    foreach (routesParametreesAuthentifiees() as $libelle => $route) {
        $uri = $route->uri();

        foreach ($route->parameterNames() as $param) {
            if (! array_key_exists($param, $valeurs)) {
                $this->fail("Paramètre de route non couvert par le balayage anti-IDOR : {{$param}} sur {$uri}. Ajoutez une valeur de la boutique A dans IdorTest.");
            }
            $uri = preg_replace('/\{'.$param.'\??\}/', $valeurs[$param], $uri);
        }

        $methode = strtolower(array_values(array_diff($route->methods(), ['HEAD']))[0]);
        $corps = match (true) {
            str_contains($uri, 'paiements') && str_ends_with($route->uri(), '{vente}/paiements') => ['methode' => 'wave_manuel'],
            str_ends_with($route->uri(), 'confirmer-manuellement') => ['confirmation' => true],
            str_contains($route->uri(), 'articles/') => ['nom' => 'Pirate', 'prix_xof' => 1],
            str_ends_with($route->uri(), '{import}/executer') => ['correspondance' => ['Nom' => 'nom', 'Prix' => 'prix_xof'], 'mode' => 'creer'],
            str_contains($route->uri(), 'admin/boutiques/') => ['statut' => 'suspendue'],
            in_array($methode, ['patch', 'put'], true) => ['role' => 'gerant', 'actif' => true],
            default => [],
        };

        $reponse = connecte($proprioB)->json($methode, '/'.$uri, $corps);
        $resultats[$libelle] = $reponse->getStatusCode();

        expect($reponse->getStatusCode())->toBeIn([403, 404], "IDOR possible sur {$libelle} : statut {$reponse->getStatusCode()}");
    }

    // Les ressources de A existent toujours (aucune modification parasite).
    expect($venteA->fresh()->statut)->toBe('en_attente')
        ->and($paiementA->fresh()->statut)->toBe('en_attente')
        ->and($articleA->fresh()->nom)->toBe('Café')
        ->and($boutiqueA->fresh()->statut)->toBe('active')
        ->and(Import::toutesBoutiques()->whereKey($importA->id)->value('statut'))->toBe('analyse')
        ->and($audio->fresh()->statut)->toBe('brouillon');
    expect(Membre::toutesBoutiques()->whereKey($membreA->id)->first()->role)->toBe('caissier');
    expect(Invitation::toutesBoutiques()->whereKey($invitationA->id)->first()?->acceptee_at)->toBeNull();
    expect(Invitation::toutesBoutiques()->whereKey($invitationA->id)->exists())->toBeTrue();
});

it('le propriétaire de la boutique A accède bien à ses ressources (le balayage n\'est pas un faux positif)', function () {
    ['boutique' => $boutiqueA, 'user' => $proprioA] = boutiqueAvec('proprietaire');
    ['membre' => $membreA] = boutiqueAvec('caissier', $boutiqueA);

    connecte($proprioA)->patchJson("/api/v1/equipe/{$membreA->ulid}", ['role' => 'gerant'])->assertOk();
});

it('refuse un ulid mal formé (contrainte de route) avant toute requête', function () {
    ['user' => $proprio] = boutiqueAvec('proprietaire');

    connecte($proprio)->patchJson('/api/v1/equipe/1', ['role' => 'gerant'])->assertNotFound();
    connecte($proprio)->patchJson("/api/v1/equipe/'%20OR%201=1", ['role' => 'gerant'])->assertNotFound();
});

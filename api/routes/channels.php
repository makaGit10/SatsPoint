<?php

use App\Models\Membre;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Canaux temps réel (CAHIER § 12, DIRECTIVES § 3)
|--------------------------------------------------------------------------
| Les canaux privés sont autorisés APRÈS vérification de la session ; le signal
| ne contient jamais de donnée métier.
*/

// Membres actifs de la boutique uniquement.
Broadcast::channel('boutique.{ulid}', function (User $user, string $ulid) {
    return Membre::toutesBoutiques()
        ->where('user_id', $user->id)
        ->where('actif', true)
        ->whereHas('boutique', fn ($q) => $q->where('ulid', $ulid)->where('statut', 'active'))
        ->exists();
});

// L'utilisateur lui-même.
Broadcast::channel('user.{ulid}', fn (User $user, string $ulid) => hash_equals($user->ulid, $ulid));

// Console plateforme : super-admin seulement.
Broadcast::channel('admin', fn (User $user) => $user->estSuperAdmin());

// Le canal « plateforme » est public (manifeste audio) : aucune autorisation nécessaire.

<?php

namespace App\Services;

use App\Events\DonneesModifiees;
use App\Models\Boutique;
use App\Models\User;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Support\Facades\Log;

/**
 * Point d'émission unique des signaux temps réel. Utilisé par le middleware
 * DiffuserEcritures (HTTP) et par les jobs (passerelle, PayTech, imports).
 *
 * Un échec d'émission est journalisé et n'est JAMAIS propagé à l'appelant.
 */
class Diffuseur
{
    /** Signal sur le canal privé d'une boutique : private-boutique.{ulid}. */
    public function rubrique(Boutique|string $boutique, string $rubrique, User|string|null $auteur = null): void
    {
        $ulid = $boutique instanceof Boutique ? $boutique->ulid : $boutique;

        $this->emettre(new PrivateChannel('boutique.'.$ulid), $rubrique, $auteur);
    }

    /** Signal sur le canal privé d'un utilisateur : private-user.{ulid}. */
    public function utilisateur(User|string $utilisateur, string $rubrique, User|string|null $auteur = null): void
    {
        $ulid = $utilisateur instanceof User ? $utilisateur->ulid : $utilisateur;

        $this->emettre(new PrivateChannel('user.'.$ulid), $rubrique, $auteur);
    }

    /** Signal public à toute la plateforme (ex. nouveau manifeste audio publié). */
    public function plateforme(string $rubrique, User|string|null $auteur = null): void
    {
        $this->emettre(new Channel('plateforme'), $rubrique, $auteur);
    }

    /** Signal réservé aux super-admins : private-admin. */
    public function admin(string $rubrique, User|string|null $auteur = null): void
    {
        $this->emettre(new PrivateChannel('admin'), $rubrique, $auteur);
    }

    private function emettre(Channel $canal, string $rubrique, User|string|null $auteur): void
    {
        $auteurUlid = $auteur instanceof User ? $auteur->ulid : $auteur;

        try {
            // Passage par le répartiteur d'événements (et non broadcast()) : interceptable par Event::fake().
            event(new DonneesModifiees($canal, $rubrique, $auteurUlid));
        } catch (\Throwable $e) {
            Log::warning('temps-reel: émission impossible', [
                'canal' => $canal->name,
                'rubrique' => $rubrique,
                'erreur' => $e::class,
                'detail' => mb_substr($e->getMessage(), 0, 200),
            ]);
        }
    }
}

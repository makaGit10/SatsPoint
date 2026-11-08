<?php

namespace App\Notifications;

use App\Models\Invitation;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

/**
 * Invitation à rejoindre une boutique. Envoyée « à la volée » (Notification::route) vers le contact.
 */
class InvitationEquipe extends Notification
{
    use Queueable;

    public function __construct(
        public readonly Invitation $invitation,
        #[\SensitiveParameter] public readonly string $jeton,
        public readonly string $nomBoutique,
        public readonly string $nomInvitant,
    ) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public static function lien(#[\SensitiveParameter] string $jeton): string
    {
        return config('satspoint.frontend_url').'/invitation/'.$jeton;
    }

    public function toMail(object $notifiable): MailMessage
    {
        $roles = ['proprietaire' => 'propriétaire', 'gerant' => 'gérant(e)', 'caissier' => 'caissier / caissière'];
        $role = $roles[$this->invitation->role] ?? $this->invitation->role;
        $heures = (int) config('satspoint.invitation.duree_heures', 72);

        return (new MailMessage)
            ->subject("SatsPoint — {$this->nomInvitant} vous invite à rejoindre « {$this->nomBoutique} »")
            ->greeting('Bonjour,')
            ->line("{$this->nomInvitant} vous invite à rejoindre la boutique « {$this->nomBoutique} » sur SatsPoint en tant que {$role}.")
            ->action('Accepter l\'invitation', self::lien($this->jeton))
            ->line("Ce lien est valable {$heures} heures et ne peut servir qu'une seule fois.")
            ->line('Si vous ne connaissez pas cette boutique, ignorez ce message.')
            ->salutation('L\'équipe SatsPoint');
    }
}

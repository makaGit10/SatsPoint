<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ReinitialisationMotDePasse extends Notification
{
    use Queueable;

    public function __construct(#[\SensitiveParameter] public readonly string $jeton) {}

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    public function lien(object $notifiable): string
    {
        return config('satspoint.frontend_url').'/reinitialisation?'.http_build_query([
            'jeton' => $this->jeton,
            'identifiant' => $notifiable->getEmailForPasswordReset(),
        ]);
    }

    public function toMail(object $notifiable): MailMessage
    {
        $minutes = (int) config('auth.passwords.users.expire', 30);

        return (new MailMessage)
            ->subject('SatsPoint — réinitialisation de votre mot de passe')
            ->greeting('Bonjour,')
            ->line('Vous avez demandé à réinitialiser votre mot de passe SatsPoint.')
            ->action('Choisir un nouveau mot de passe', $this->lien($notifiable))
            ->line("Ce lien est valable {$minutes} minutes et ne peut servir qu'une seule fois.")
            ->line('Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement ce message : votre mot de passe reste inchangé.')
            ->salutation('L\'équipe SatsPoint');
    }
}

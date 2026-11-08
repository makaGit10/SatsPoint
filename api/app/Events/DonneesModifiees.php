<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Signal temps réel (DIRECTIVES § 3) : AUCUNE donnée métier, seulement
 * la rubrique touchée, l'auteur (ulid) et l'heure. Les écrans rechargent via l'API.
 */
class DonneesModifiees implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public readonly string $horodatage;

    public function __construct(
        public readonly Channel $canal,
        public readonly string $rubrique,
        public readonly ?string $auteur = null,
    ) {
        $this->horodatage = now()->toIso8601String();
    }

    public function broadcastOn(): Channel
    {
        return $this->canal;
    }

    public function broadcastAs(): string
    {
        return 'donnees.modifiees';
    }

    /** @return array{rubrique: string, auteur: ?string, horodatage: string} */
    public function broadcastWith(): array
    {
        return [
            'rubrique' => $this->rubrique,
            'auteur' => $this->auteur,
            'horodatage' => $this->horodatage,
        ];
    }
}

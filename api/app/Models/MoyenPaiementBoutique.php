<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Activation d'un moyen du pays par une boutique, avec son numéro ou son lien marchand.
 * Cloisonné par boutique (BoutiqueScope). La valeur est en clair, comme reglages.wave_lien :
 * c'est une information publique montrée à chaque client qui paie, pas un secret d'accès.
 */
class MoyenPaiementBoutique extends Model
{
    use AppartientAUneBoutique;

    protected $table = 'moyens_paiement_boutique';

    protected $fillable = ['moyen_paiement_id', 'valeur', 'active'];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    public function moyen(): BelongsTo
    {
        return $this->belongsTo(MoyenPaiement::class, 'moyen_paiement_id');
    }
}

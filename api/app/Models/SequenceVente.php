<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Numérotation des ventes par boutique (V-000001, V-000002…), continue et sans trou visible.
 * Table technique : ses écritures n'émettent aucun signal temps réel (non listée dans satspoint.temps_reel.tables).
 */
class SequenceVente extends Model
{
    protected $table = 'sequences_vente';

    protected $primaryKey = 'boutique_id';

    public $incrementing = false;

    public $timestamps = false;

    protected $fillable = ['boutique_id', 'dernier_numero'];

    /**
     * Réserve le numéro suivant pour la boutique, atomiquement (verrou de ligne pris par l'UPSERT).
     * À appeler DANS la transaction qui crée la vente : un échec annule la réservation.
     */
    public static function suivant(int $boutiqueId): int
    {
        $ligne = DB::selectOne(
            'INSERT INTO sequences_vente (boutique_id, dernier_numero, updated_at) VALUES (?, 1, now())
             ON CONFLICT (boutique_id) DO UPDATE SET dernier_numero = sequences_vente.dernier_numero + 1, updated_at = now()
             RETURNING dernier_numero',
            [$boutiqueId]
        );

        return (int) $ligne->dernier_numero;
    }
}

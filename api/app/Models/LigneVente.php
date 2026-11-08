<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LigneVente extends Model
{
    use AppartientAUneBoutique;

    protected $table = 'lignes_vente';

    protected $fillable = [
        'vente_id',
        'article_id',
        'libelle',
        'quantite',
        'prix_unitaire_xof',
    ];

    protected function casts(): array
    {
        return [
            'quantite' => 'integer',
            'prix_unitaire_xof' => 'integer',
        ];
    }

    public function vente(): BelongsTo
    {
        return $this->belongsTo(Vente::class);
    }

    public function article(): BelongsTo
    {
        return $this->belongsTo(Article::class);
    }
}

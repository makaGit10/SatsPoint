<?php

namespace App\Models;

use App\Models\Concerns\AppartientAUneBoutique;
use App\Models\Concerns\AUlid;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
    use AppartientAUneBoutique, AUlid, HasFactory;

    protected $fillable = [
        'nom',
        'prix_xof',
        'categorie',
        'couleur',
        'sku',
        'actif',
        'position',
    ];

    protected function casts(): array
    {
        return [
            'prix_xof' => 'integer',
            'actif' => 'boolean',
            'position' => 'integer',
        ];
    }
}

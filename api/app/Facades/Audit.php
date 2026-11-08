<?php

namespace App\Facades;

use Illuminate\Support\Facades\Facade;

/**
 * @method static \App\Models\JournalAudit|null enregistrer(string $action, \Illuminate\Database\Eloquent\Model|string|null $cible = null, array $details = [], ?\App\Models\User $utilisateur = null, ?\Illuminate\Http\Request $requete = null)
 * @method static array assainir(array $details)
 *
 * @see \App\Services\Audit
 */
class Audit extends Facade
{
    protected static function getFacadeAccessor(): string
    {
        return \App\Services\Audit::class;
    }
}

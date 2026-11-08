<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Erreur métier renvoyée au client sous la forme { message, code } avec un statut HTTP explicite
 * (règle n° 7 : message utile, aucun détail technique). Rendue par bootstrap/app.php.
 */
class ErreurMetier extends RuntimeException
{
    public function __construct(
        public readonly string $codeErreur,
        string $message,
        public readonly int $statutHttp = 422,
    ) {
        parent::__construct($message);
    }
}

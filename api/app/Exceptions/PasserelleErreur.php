<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Erreur renvoyée par la passerelle Lightning ({ erreur: { code, message } }).
 */
class PasserelleErreur extends RuntimeException
{
    public function __construct(
        public readonly string $codeErreur,
        string $message = '',
        public readonly int $statutHttp = 0,
    ) {
        parent::__construct($message !== '' ? $message : $codeErreur);
    }

    public function estDe(string $code): bool
    {
        return $this->codeErreur === $code;
    }

    /** Délai dépassé sur un paiement sortant : le paiement a PEUT-ÊTRE été exécuté (vérifier les transactions). */
    public function paiementIncertain(): bool
    {
        return $this->codeErreur === 'DELAI_DEPASSE';
    }
}

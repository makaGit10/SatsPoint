<?php

namespace App\Exceptions;

/**
 * La passerelle n'a pas répondu (réseau, délai dépassé, réponse illisible).
 */
class PasserelleInjoignable extends PasserelleErreur
{
    public function __construct(string $message = 'Passerelle Lightning injoignable.')
    {
        parent::__construct('PASSERELLE_INJOIGNABLE', $message, 0);
    }
}

<?php

namespace App\Exceptions;

/** Aucun cours BTC de moins de 10 minutes : l'encaissement Lightning est bloqué (CAHIER § 7.1). */
class CoursIndisponible extends ErreurMetier
{
    public function __construct()
    {
        parent::__construct(
            'COURS_INDISPONIBLE',
            'Le cours du bitcoin est momentanément indisponible : le paiement Lightning est bloqué, le mobile money reste possible.',
            503,
        );
    }
}

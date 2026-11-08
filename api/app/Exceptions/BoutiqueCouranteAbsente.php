<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Levée quand une requête sur un modèle cloisonné par boutique est exécutée
 * sans boutique courante (règle n° 4 : cloisonnement des données).
 */
class BoutiqueCouranteAbsente extends RuntimeException
{
    public function __construct(string $modele = '')
    {
        parent::__construct(trim("Aucune boutique courante : requête interdite sur {$modele}. ".
            'Connectez un utilisateur membre d\'une boutique, ou fixez la boutique explicitement '.
            '(BoutiqueCourante::definir / Modele::pourBoutique).'));
    }
}

<?php

/*
|--------------------------------------------------------------------------
| Amorçage des tests — garde-fou base de données
|--------------------------------------------------------------------------
| PHPUnit n'écrase que $_ENV/putenv ; Laravel lit d'abord $_SERVER, qui contient
| l'environnement du conteneur (DB_DATABASE=satspoint). Sans ceci, la suite de
| tests (RefreshDatabase → migrate:fresh) détruirait la base de développement.
| On force donc ici, AVANT tout, les variables critiques dans les trois sources.
*/

$forcees = [
    'APP_ENV' => 'testing',
    'DB_CONNECTION' => 'pgsql',
    'DB_DATABASE' => 'satspoint_test',
    'DB_URL' => '',
    'CACHE_STORE' => 'array',
    'SESSION_DRIVER' => 'array',
    'QUEUE_CONNECTION' => 'sync',
    'BROADCAST_CONNECTION' => 'null',
    'MAIL_MAILER' => 'array',
    'LOG_CHANNEL' => 'null',
    'DEMO_SEED' => 'false',
];

foreach ($forcees as $nom => $valeur) {
    $_SERVER[$nom] = $valeur;
    $_ENV[$nom] = $valeur;
    putenv("{$nom}={$valeur}");
}

if (! str_ends_with((string) $_SERVER['DB_DATABASE'], '_test')) {
    fwrite(STDERR, "Refus : la base de test doit se terminer par _test.\n");
    exit(1);
}

// Laravel charge toujours un fichier .env (ici .env.testing, APP_ENV=testing) : un fichier vide évite
// un avertissement « file_get_contents(.env) » sur chaque test, l'environnement venant du conteneur.
if (! file_exists(__DIR__.'/../.env.testing')) {
    @file_put_contents(__DIR__.'/../.env.testing', "# Généré par tests/bootstrap.php — volontairement vide (variables fournies par l'environnement).\n");
}

require __DIR__.'/../vendor/autoload.php';

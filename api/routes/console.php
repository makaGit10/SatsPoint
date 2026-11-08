<?php

use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Planificateur (conteneur « scheduler » : php artisan schedule:work)
|--------------------------------------------------------------------------
| - cours:rafraichir      chaque minute : médiane BTC/EUR de 3 sources → XOF, cache 60 s (CAHIER § 7.1)
| - paiements:expirer     chaque minute : factures échues → expire, ventes sans tentative 30 min → expiree (§ 7.2)
| - cours:rafraichir --purger  chaque nuit : historique > 30 jours supprimé
*/

Schedule::command('cours:rafraichir')->everyMinute()->withoutOverlapping(2)->runInBackground();
Schedule::command('paiements:expirer')->everyMinute()->withoutOverlapping(2)->runInBackground();
Schedule::command('cours:rafraichir --purger')->dailyAt('03:15')->withoutOverlapping(10);

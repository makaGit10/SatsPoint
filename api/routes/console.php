<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

/*
|--------------------------------------------------------------------------
| Planificateur (conteneur « scheduler » : php artisan schedule:work)
|--------------------------------------------------------------------------
| - cours:rafraichir      chaque minute : médiane BTC/EUR de 3 sources → XOF, cache 60 s (CAHIER § 7.1)
| - paiements:expirer     chaque minute : factures échues → expire, ventes sans tentative 30 min → expiree (§ 7.2)
| - cours:rafraichir --purger  chaque nuit : historique > 30 jours supprimé
| - audio:nettoyer       toutes les 5 min : traitements audio interrompus → erreur « à renvoyer »
*/

// Exécution DANS le processus `schedule:run` (Artisan::call) plutôt qu'un nouveau `php artisan …` par tâche :
// sur l'offre gratuite de Render (0,1 CPU), chaque démarrage de PHP coûte plusieurs secondes de processeur.
Schedule::call(fn () => Artisan::call('cours:rafraichir'))->name('cours:rafraichir')->everyMinute()->withoutOverlapping(2);
Schedule::call(fn () => Artisan::call('paiements:expirer'))->name('paiements:expirer')->everyMinute()->withoutOverlapping(2);
Schedule::command('cours:rafraichir --purger')->dailyAt('03:15')->withoutOverlapping(10);
// Traitements audio interrompus (redémarrage, disque non persistant) → erreur « à renvoyer » ; sources orphelines supprimées.
Schedule::call(fn () => Artisan::call('audio:nettoyer'))->name('audio:nettoyer')->everyFiveMinutes()->withoutOverlapping(5);

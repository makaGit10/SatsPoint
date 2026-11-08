<?php

namespace App\Console\Commands;

use App\Services\CoursChange;
use Illuminate\Console\Command;

class CoursRafraichir extends Command
{
    protected $signature = 'cours:rafraichir {--purger : Supprime aussi l\'historique de plus de 30 jours}';

    protected $description = 'Récupère le cours BTC/EUR (Kraken, Bitstamp, CoinGecko), calcule la médiane et le convertit en XOF';

    public function handle(CoursChange $cours): int
    {
        $resultat = $cours->rafraichir();

        if ($this->option('purger')) {
            $cours->purger();
        }

        if ($resultat === null) {
            $this->warn('Aucun cours fiable obtenu ; le dernier cours connu reste en place.');

            return self::FAILURE;
        }

        $this->info(sprintf('Cours : 1 BTC = %s XOF (%s EUR) — %d source(s).', number_format($resultat['btc_xof'], 0, ',', ' '), number_format($resultat['btc_eur'], 2, ',', ' '), $resultat['sources']));

        return self::SUCCESS;
    }
}

<?php

namespace App\Jobs;

use App\Models\Boutique;
use App\Models\Import;
use App\Services\BoutiqueCourante;
use App\Services\Import\ImportArticles;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Exécute un import d'articles en arrière-plan, avec la boutique courante fixée explicitement
 * (le scope de cloisonnement s'applique comme en HTTP). Progression diffusée via « imports ».
 */
class ExecuterImport implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    // Inférieur au --timeout=120 du worker (sinon le worker tue le job avant sa fin).
    public int $timeout = 110;

    public function __construct(public readonly int $importId)
    {
        $this->onQueue('imports');
    }

    public function handle(ImportArticles $service, BoutiqueCourante $courante): void
    {
        $import = Import::toutesBoutiques()->find($this->importId);

        if ($import === null) {
            return;
        }

        $boutique = Boutique::query()->find($import->boutique_id);

        if ($boutique === null) {
            return;
        }

        $courante->pour($boutique, fn () => $service->traiter($import, $boutique));
    }

    public function failed(?\Throwable $e): void
    {
        $import = Import::toutesBoutiques()->find($this->importId);

        if ($import !== null && $import->statut === Import::STATUT_EN_COURS) {
            $rapport = $import->rapportComplet();
            $rapport['erreurs'] = [['ligne' => 0, 'message' => 'L\'import a été interrompu.']];
            $import->forceFill(['statut' => Import::STATUT_ECHOUE, 'rapport' => $rapport])->save();
        }
    }
}

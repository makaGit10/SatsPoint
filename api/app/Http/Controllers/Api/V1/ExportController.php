<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Caisse\ListerVentesRequest;
use App\Http\Requests\Exports\ExporterArticlesRequest;
use App\Http\Requests\Exports\ExporterPaiementsRequest;
use App\Models\Article;
use App\Models\Boutique;
use App\Models\Paiement;
use App\Models\Vente;
use App\Services\BoutiqueCourante;
use App\Services\ExportTableaux;
use App\Services\ExportVentes;
use App\Services\RequeteVentes;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/** Exports (CONTRAT_API vague 3 § 6) : propriétaire / gérant, 6 par minute. */
class ExportController extends Controller
{
    public function __construct(
        private readonly BoutiqueCourante $courante,
        private readonly ExportVentes $ventes,
        private readonly ExportTableaux $tableaux,
    ) {}

    /** GET /exports/ventes?format=csv|xlsx|pdf (+ filtres de GET /ventes) */
    public function ventes(ListerVentesRequest $request): Response
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('exporter', Vente::class);

        $fuseau = $this->fuseau($boutique);
        $filtres = $request->filtres();
        $format = (string) $request->input('format', 'csv');
        $requete = RequeteVentes::construire($this->courante->membre(), $request->user(), $fuseau, $filtres);
        $nom = sprintf('ventes-%s-%s.%s', Str::slug($boutique->nom) ?: 'boutique', now($fuseau)->format('Ymd-Hi'), $format);

        Audit::enregistrer('export.ventes', $boutique, ['format' => $format, 'filtres' => array_filter($filtres)]);

        return match ($format) {
            'xlsx' => $this->ventes->xlsx($requete, $fuseau, $nom),
            'pdf' => $this->ventes->pdf($requete, $boutique, $fuseau, $nom, $this->periode($filtres, $fuseau)),
            default => $this->ventes->csv($requete, $fuseau, $nom),
        };
    }

    /** GET /exports/articles?format=csv|xlsx&actifs=1 */
    public function articles(ExporterArticlesRequest $request): Response
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('exporter', Vente::class);

        $format = (string) $request->input('format', 'csv');
        $requete = Article::query()->when($request->boolean('actifs'), fn ($q) => $q->where('actif', true));
        $nom = sprintf('articles-%s-%s.%s', Str::slug($boutique->nom) ?: 'boutique', now($this->fuseau($boutique))->format('Ymd-Hi'), $format);

        Audit::enregistrer('export.articles', $boutique, ['format' => $format]);

        return $format === 'xlsx' ? $this->tableaux->articlesXlsx($requete, $nom) : $this->tableaux->articlesCsv($requete, $nom);
    }

    /** GET /exports/paiements?format=csv&periode=&du=&au=&statut=&methode= */
    public function paiements(ExporterPaiementsRequest $request): Response
    {
        $boutique = $this->courante->exiger(Boutique::class);
        $this->authorize('exporter', Vente::class);

        $fuseau = $this->fuseau($boutique);
        $bornes = RequeteVentes::bornes($request->input('periode', '30j'), $fuseau, $request->input('du'), $request->input('au'));

        $requete = Paiement::query()
            ->where('paiements.created_at', '>=', $bornes['du'])->where('paiements.created_at', '<', $bornes['au'])
            ->when($request->filled('statut'), fn ($q) => $q->where('paiements.statut', $request->input('statut')))
            ->when($request->filled('methode'), fn ($q) => $q->where('paiements.methode', $request->input('methode')));

        $nom = sprintf('paiements-%s-%s.csv', Str::slug($boutique->nom) ?: 'boutique', now($fuseau)->format('Ymd-Hi'));

        Audit::enregistrer('export.paiements', $boutique, ['periode' => $request->input('periode', '30j')]);

        return $this->tableaux->paiementsCsv($requete, $fuseau, $nom);
    }

    private function fuseau(Boutique $boutique): string
    {
        return $boutique->fuseau ?: config('satspoint.boutique.fuseau');
    }

    /** Libellé lisible de la période pour l'en-tête du PDF. */
    private function periode(array $filtres, string $fuseau): array
    {
        $periode = $filtres['periode'] ?? 'aujourdhui';
        $bornes = RequeteVentes::bornes($periode, $fuseau, $filtres['du'] ?? null, $filtres['au'] ?? null);
        $du = $bornes['du']->setTimezone($fuseau);
        $au = $bornes['au']->setTimezone($fuseau)->subDay();

        $libelle = match ($periode) {
            'hier' => 'hier ('.$du->format('d/m/Y').')',
            '7j' => '7 derniers jours ('.$du->format('d/m/Y').' – '.$au->format('d/m/Y').')',
            '30j' => '30 derniers jours ('.$du->format('d/m/Y').' – '.$au->format('d/m/Y').')',
            'perso' => $du->isSameDay($au) ? $du->format('d/m/Y') : $du->format('d/m/Y').' – '.$au->format('d/m/Y'),
            default => 'aujourd\'hui ('.$du->format('d/m/Y').')',
        };

        return ['code' => $periode, 'du' => $du->toDateString(), 'au' => $au->toDateString(), 'libelle' => $libelle];
    }
}

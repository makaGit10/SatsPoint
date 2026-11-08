<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Imports\AnalyserImportRequest;
use App\Http\Requests\Imports\ExecuterImportRequest;
use App\Http\Resources\ImportResource;
use App\Models\Import;
use App\Services\BoutiqueCourante;
use App\Services\Import\ImportArticles;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Import d'articles (CONTRAT_API vague 3 § 5). Propriétaire / gérant. */
class ImportController extends Controller
{
    public function __construct(
        private readonly BoutiqueCourante $courante,
        private readonly ImportArticles $service,
    ) {}

    /** POST /imports/analyser (multipart { fichier }) → 201 { import, champs } */
    public function analyser(AnalyserImportRequest $request): JsonResponse
    {
        $this->courante->exiger(Import::class);
        $this->authorize('create', Import::class);

        $import = $this->service->analyser($request->file('fichier'), $request->user());

        return response()->json([
            'import' => (new ImportResource($import))->resolve(),
            'champs' => config('satspoint.import.champs'),
        ], 201);
    }

    /** POST /imports/{import}/executer { correspondance, mode } → 202 { import } */
    public function executer(ExecuterImportRequest $request, Import $import): JsonResponse
    {
        $this->authorize('executer', $import);

        $import = $this->service->executer($import, (array) $request->input('correspondance'), $request->input('mode'), $request->user());

        return response()->json(['import' => (new ImportResource($import))->resolve()], 202);
    }

    /** GET /imports/{import} → { import } */
    public function show(Import $import): JsonResponse
    {
        $this->authorize('view', $import);

        return response()->json(['import' => (new ImportResource($import))->resolve()]);
    }

    /** GET /imports/{import}/rapport → CSV des erreurs (UTF-8 BOM, « ; »). */
    public function rapport(Import $import): StreamedResponse
    {
        $this->authorize('view', $import);

        $rapport = $import->rapportComplet();

        return response()->streamDownload(function () use ($rapport) {
            $sortie = fopen('php://output', 'w');
            fwrite($sortie, "\xEF\xBB\xBF");
            fputcsv($sortie, ['Résumé', 'Valeur'], ';', '"', '');
            foreach (['total', 'traitees', 'creees', 'mises_a_jour'] as $cle) {
                fputcsv($sortie, [ucfirst(str_replace('_', ' ', $cle)), $rapport[$cle]], ';', '"', '');
            }
            fputcsv($sortie, [], ';', '"', '');
            fputcsv($sortie, ['Ligne', 'Erreur'], ';', '"', '');
            foreach ($rapport['erreurs'] as $erreur) {
                $message = (string) $erreur['message'];
                fputcsv($sortie, [$erreur['ligne'], str_contains('=+-@', $message[0] ?? '') ? "'".$message : $message], ';', '"', '');
            }
            fclose($sortie);
        }, sprintf('import-%s-rapport.csv', $import->ulid), [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }
}

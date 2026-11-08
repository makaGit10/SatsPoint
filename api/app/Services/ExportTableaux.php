<?php

namespace App\Services;

use App\Models\Article;
use App\Models\Paiement;
use App\Models\Vente;
use Illuminate\Database\Eloquent\Builder;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as EcrivainXlsx;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Exports « articles » (CSV, XLSX) et « paiements » (CSV) — CAHIER § 6.15. Mêmes règles que l'export des ventes :
 * UTF-8 BOM, « ; », flux par paquets, injection de formule neutralisée, aucun secret (ni hash complet, ni jeton PayTech).
 */
class ExportTableaux
{
    private const ENTETES_ARTICLES = ['Nom', 'Prix (FCFA)', 'Catégorie', 'Référence', 'Couleur', 'Actif', 'Position'];

    private const ENTETES_PAIEMENTS = ['Vente', 'Date', 'Heure', 'Moyen', 'Opérateur', 'Statut', 'Montant (FCFA)', 'Montant (sats)', 'Cours (FCFA/BTC)', 'Hash (8 car.)', 'Simulé', 'Réglé le'];

    public function articlesCsv(Builder $requete, string $nomFichier): StreamedResponse
    {
        return $this->csv(self::ENTETES_ARTICLES, $requete->reorder()->orderBy('position')->orderBy('nom'), fn (Article $a) => $this->ligneArticle($a), $nomFichier);
    }

    public function articlesXlsx(Builder $requete, string $nomFichier): BinaryFileResponse
    {
        return $this->xlsx(self::ENTETES_ARTICLES, $requete->reorder()->orderBy('position')->orderBy('nom'), fn (Article $a) => $this->ligneArticle($a), $nomFichier);
    }

    public function paiementsCsv(Builder $requete, string $fuseau, string $nomFichier): StreamedResponse
    {
        $requete = $requete->with(['vente:id,numero'])->reorder()->orderBy('paiements.created_at')->orderBy('paiements.id');

        return $this->csv(self::ENTETES_PAIEMENTS, $requete, fn (Paiement $p) => $this->lignePaiement($p, $fuseau), $nomFichier);
    }

    // ------------------------------------------------------------------

    private function ligneArticle(Article $a): array
    {
        return [
            ExportVentes::assainir($a->nom),
            (int) $a->prix_xof,
            ExportVentes::assainir($a->categorie),
            ExportVentes::assainir($a->sku),
            $a->couleur ?? '',
            $a->actif ? 'Oui' : 'Non',
            (int) $a->position,
        ];
    }

    private function lignePaiement(Paiement $p, string $fuseau): array
    {
        $local = $p->created_at->copy()->setTimezone($fuseau);

        return [
            $p->vente ? Vente::formaterNumero((int) $p->vente->numero) : '',
            $local->format('d/m/Y'),
            $local->format('H:i'),
            ExportVentes::libelleMethode($p->methode),
            $p->operateur ? ExportVentes::libelleOperateur($p->operateur) : '',
            self::libelleStatutPaiement($p->statut),
            (int) $p->montant_xof,
            $p->montant_sats ?? '',
            $p->coursEntier() ?? '',
            $p->hashAbrege() ?? '',
            $p->simule ? 'Oui' : 'Non',
            $p->regle_at?->copy()->setTimezone($fuseau)->format('d/m/Y H:i') ?? '',
        ];
    }

    private function csv(array $entetes, Builder $requete, callable $ligne, string $nomFichier): StreamedResponse
    {
        return response()->streamDownload(function () use ($entetes, $requete, $ligne) {
            $sortie = fopen('php://output', 'w');
            fwrite($sortie, "\xEF\xBB\xBF");
            fputcsv($sortie, $entetes, ';', '"', '');

            $requete->chunk(500, function ($modeles) use ($sortie, $ligne) {
                foreach ($modeles as $modele) {
                    fputcsv($sortie, $ligne($modele), ';', '"', '');
                }
            });

            fclose($sortie);
        }, $nomFichier, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function xlsx(array $entetes, Builder $requete, callable $ligne, string $nomFichier): BinaryFileResponse
    {
        $temporaire = tempnam(sys_get_temp_dir(), 'satspoint-xlsx-');

        $ecrivain = new EcrivainXlsx;
        $ecrivain->openToFile($temporaire);
        $ecrivain->addRow(Row::fromValues($entetes));

        $requete->chunk(500, function ($modeles) use ($ecrivain, $ligne) {
            foreach ($modeles as $modele) {
                $ecrivain->addRow(Row::fromValues(array_map(fn ($v) => is_int($v) ? $v : (string) $v, $ligne($modele))));
            }
        });

        $ecrivain->close();

        return response()->download($temporaire, $nomFichier, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ])->deleteFileAfterSend(true);
    }

    private static function libelleStatutPaiement(string $statut): string
    {
        return match ($statut) {
            Paiement::STATUT_REUSSI => 'Réussi',
            Paiement::STATUT_EXPIRE => 'Expiré',
            Paiement::STATUT_ECHOUE => 'Échoué',
            Paiement::STATUT_ANNULE => 'Annulé',
            default => 'En attente',
        };
    }
}

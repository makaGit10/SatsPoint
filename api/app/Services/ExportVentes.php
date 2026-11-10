<?php

namespace App\Services;

use App\Models\Boutique;
use App\Models\Vente;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Response;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Writer\XLSX\Writer as EcrivainXlsx;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export des ventes (CAHIER § 6.15) : CSV (UTF-8 BOM, « ; », flux par paquets de 500), XLSX (OpenSpout, flux),
 * PDF (rapport journalier : totaux, répartition, liste). Filtres de la liste respectés, injection de formule neutralisée.
 */
class ExportVentes
{
    private const ENTETES = ['Numéro', 'Date', 'Heure', 'Montant (FCFA)', 'Statut', 'Moyen', 'Opérateur', 'Montant (sats)', 'Cours (FCFA/BTC)', 'Caissier', 'Note', 'Alerte', 'Payée le', 'Reçu'];

    /** Nombre maximal de lignes détaillées dans le PDF (au-delà : totaux + mention). */
    private const PDF_LIGNES_MAX = 1000;

    public function csv(Builder $requete, string $fuseau, string $nomFichier): StreamedResponse
    {
        $requete = $this->preparer($requete);
        $front = rtrim((string) config('satspoint.frontend_url'), '/');

        return response()->streamDownload(function () use ($requete, $fuseau, $front) {
            $sortie = fopen('php://output', 'w');
            fwrite($sortie, "\xEF\xBB\xBF");
            fputcsv($sortie, self::ENTETES, ';', '"', '');

            $requete->chunk(500, function ($ventes) use ($sortie, $fuseau, $front) {
                foreach ($ventes as $vente) {
                    fputcsv($sortie, $this->ligne($vente, $fuseau, $front), ';', '"', '');
                }
            });

            fclose($sortie);
        }, $nomFichier, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function xlsx(Builder $requete, string $fuseau, string $nomFichier): BinaryFileResponse
    {
        $requete = $this->preparer($requete);
        $front = rtrim((string) config('satspoint.frontend_url'), '/');
        $temporaire = tempnam(sys_get_temp_dir(), 'satspoint-xlsx-');

        $ecrivain = new EcrivainXlsx;
        $ecrivain->openToFile($temporaire);
        $ecrivain->addRow(Row::fromValues(self::ENTETES));

        $requete->chunk(500, function ($ventes) use ($ecrivain, $fuseau, $front) {
            foreach ($ventes as $vente) {
                $ecrivain->addRow(Row::fromValues(array_map(fn ($v) => is_int($v) ? $v : (string) $v, $this->ligne($vente, $fuseau, $front))));
            }
        });

        $ecrivain->close();

        return response()->download($temporaire, $nomFichier, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ])->deleteFileAfterSend(true);
    }

    /** Rapport journalier simple (PDF A4) : boutique, période, totaux, répartition par moyen, liste. */
    public function pdf(Builder $requete, Boutique $boutique, string $fuseau, string $nomFichier, array $periode): Response
    {
        $requete = $this->preparer($requete);
        $totaux = RequeteVentes::totaux($requete);

        $repartition = (clone $requete)->reorder()
            ->where('ventes.statut', Vente::STATUT_PAYEE)
            ->join('paiements', 'paiements.id', '=', 'ventes.paiement_reussi_id')
            ->groupBy('paiements.methode')
            ->selectRaw('paiements.methode AS methode, COUNT(*) AS nombre, COALESCE(SUM(ventes.montant_xof), 0) AS montant')
            ->get()
            ->map(fn ($l) => ['moyen' => self::libelleMethode($l->methode), 'nombre' => (int) $l->nombre, 'montant' => (int) $l->montant])
            ->all();

        $ventes = (clone $requete)->limit(self::PDF_LIGNES_MAX)->get();
        $tronque = $totaux['nombre'] > $ventes->count();

        $lignes = $ventes->map(function (Vente $v) use ($fuseau) {
            $p = $v->paiementReussi;
            $local = $v->created_at->copy()->setTimezone($fuseau);

            return [
                'numero' => $v->numeroAffiche(),
                'date' => $local->format('d/m/Y'),
                'heure' => $local->format('H:i'),
                'montant' => (int) $v->montant_xof,
                'statut' => self::libelleStatut($v->statut),
                'moyen' => $p ? ($p->nomMoyen() ?? self::libelleMethode($p->methode)) : '',
                'sats' => $p?->montant_sats,
                'caissier' => $v->caissier?->nom ?? '',
                'note' => $v->note,
            ];
        })->all();

        $pdf = Pdf::loadView('exports.ventes-pdf', [
            'boutique' => $boutique,
            'periode' => $periode,
            'genere_le' => now($fuseau)->format('d/m/Y H:i'),
            'totaux' => $totaux,
            'repartition' => $repartition,
            'lignes' => $lignes,
            'tronque' => $tronque,
            'max' => self::PDF_LIGNES_MAX,
        ])->setPaper('a4');

        return $pdf->download($nomFichier)->withHeaders([
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    // ------------------------------------------------------------------

    private function preparer(Builder $requete): Builder
    {
        return $requete->with(['caissier:id,ulid,nom', 'paiementReussi:id,methode,operateur,montant_sats,cours_xof_par_btc,moyen'])
            ->reorder()->orderBy('ventes.created_at')->orderBy('ventes.id');
    }

    private function ligne(Vente $vente, string $fuseau, string $front): array
    {
        $local = $vente->created_at->copy()->setTimezone($fuseau);
        $p = $vente->paiementReussi;

        return [
            $vente->numeroAffiche(),
            $local->format('d/m/Y'),
            $local->format('H:i'),
            (int) $vente->montant_xof,
            self::libelleStatut($vente->statut),
            $p ? self::assainir($p->nomMoyen() ?? self::libelleMethode($p->methode)) : '',
            $p?->operateur ? self::libelleOperateur($p->operateur) : '',
            $p?->montant_sats ?? '',
            $p?->cours_xof_par_btc !== null ? (int) round((float) $p->cours_xof_par_btc) : '',
            $vente->caissier?->nom ?? '',
            self::assainir($vente->note),
            $vente->alerte ? self::libelleAlerte($vente->alerte) : '',
            $vente->payee_at?->copy()->setTimezone($fuseau)->format('d/m/Y H:i') ?? '',
            $vente->recuUrl() ? $front.$vente->recuUrl() : '',
        ];
    }

    /** Neutralise l'injection de formule (= + - @) à l'ouverture dans un tableur. */
    public static function assainir(?string $texte): string
    {
        $texte = (string) $texte;

        return ($texte !== '' && str_contains('=+-@', $texte[0])) ? "'".$texte : $texte;
    }

    public static function libelleStatut(string $statut): string
    {
        return match ($statut) {
            Vente::STATUT_PAYEE => 'Payée',
            Vente::STATUT_ANNULEE => 'Annulée',
            Vente::STATUT_EXPIREE => 'Expirée',
            default => 'En attente',
        };
    }

    public static function libelleMethode(string $methode): string
    {
        return match ($methode) {
            'lightning' => 'Lightning',
            'paytech' => 'Mobile money (PayTech)',
            'wave_manuel' => 'Wave (confirmation manuelle)',
            'moyen_pays' => 'Mobile money du pays (confirmation manuelle)',
            default => $methode,
        };
    }

    public static function libelleOperateur(string $operateur): string
    {
        return match ($operateur) {
            'wave' => 'Wave',
            'orange_money' => 'Orange Money',
            'free_money' => 'Free Money',
            default => $operateur,
        };
    }

    public static function libelleAlerte(string $alerte): string
    {
        return match ($alerte) {
            Vente::ALERTE_TROP_PERCU => 'Trop-perçu (deux paiements reçus)',
            Vente::ALERTE_PAYEE_APRES_ANNULATION => 'Payée après annulation/expiration',
            default => $alerte,
        };
    }
}

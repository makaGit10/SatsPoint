<?php

namespace App\Services;

use App\Models\Vente;
use Illuminate\Database\Eloquent\Builder;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Export CSV des ventes (CAHIER § 6.15) : UTF-8 avec BOM, séparateur « ; » (Excel francophone),
 * flux par paquets de 500 (gros volumes sans saturer la mémoire), filtres de la liste respectés.
 */
class ExportVentes
{
    private const ENTETES = ['Numéro', 'Date', 'Heure', 'Montant (FCFA)', 'Statut', 'Moyen', 'Opérateur', 'Montant (sats)', 'Cours (FCFA/BTC)', 'Caissier', 'Note', 'Alerte', 'Payée le', 'Reçu'];

    public function csv(Builder $requete, string $fuseau, string $nomFichier): StreamedResponse
    {
        $requete = $requete->with(['caissier:id,ulid,nom', 'paiementReussi:id,methode,operateur,montant_sats,cours_xof_par_btc'])
            ->reorder()->orderBy('ventes.created_at')->orderBy('ventes.id');

        $front = rtrim((string) config('satspoint.frontend_url'), '/');

        return response()->streamDownload(function () use ($requete, $fuseau, $front) {
            $sortie = fopen('php://output', 'w');
            fwrite($sortie, "\xEF\xBB\xBF");
            fputcsv($sortie, self::ENTETES, ';', '"', '');

            $requete->chunk(500, function ($ventes) use ($sortie, $fuseau, $front) {
                /** @var Vente $vente */
                foreach ($ventes as $vente) {
                    $local = $vente->created_at->copy()->setTimezone($fuseau);
                    $p = $vente->paiementReussi;

                    fputcsv($sortie, [
                        $vente->numeroAffiche(),
                        $local->format('d/m/Y'),
                        $local->format('H:i'),
                        $vente->montant_xof,
                        self::libelleStatut($vente->statut),
                        $p ? self::libelleMethode($p->methode) : '',
                        $p?->operateur ? self::libelleOperateur($p->operateur) : '',
                        $p?->montant_sats ?? '',
                        $p?->cours_xof_par_btc !== null ? (int) round((float) $p->cours_xof_par_btc) : '',
                        $vente->caissier?->nom ?? '',
                        self::assainir($vente->note),
                        $vente->alerte ? self::libelleAlerte($vente->alerte) : '',
                        $vente->payee_at?->copy()->setTimezone($fuseau)->format('d/m/Y H:i') ?? '',
                        $vente->recuUrl() ? $front.$vente->recuUrl() : '',
                    ], ';', '"', '');
                }
            });

            fclose($sortie);
        }, $nomFichier, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Cache-Control' => 'no-store, private',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    /** Neutralise l'injection de formule (= + - @) à l'ouverture dans un tableur. */
    private static function assainir(?string $texte): string
    {
        $texte = (string) $texte;

        return ($texte !== '' && str_contains('=+-@', $texte[0])) ? "'".$texte : $texte;
    }

    private static function libelleStatut(string $statut): string
    {
        return match ($statut) {
            Vente::STATUT_PAYEE => 'Payée',
            Vente::STATUT_ANNULEE => 'Annulée',
            Vente::STATUT_EXPIREE => 'Expirée',
            default => 'En attente',
        };
    }

    private static function libelleMethode(string $methode): string
    {
        return match ($methode) {
            'lightning' => 'Lightning',
            'paytech' => 'Mobile money (PayTech)',
            'wave_manuel' => 'Wave (confirmation manuelle)',
            default => $methode,
        };
    }

    private static function libelleOperateur(string $operateur): string
    {
        return match ($operateur) {
            'wave' => 'Wave',
            'orange_money' => 'Orange Money',
            'free_money' => 'Free Money',
            default => $operateur,
        };
    }

    private static function libelleAlerte(string $alerte): string
    {
        return match ($alerte) {
            Vente::ALERTE_TROP_PERCU => 'Trop-perçu (deux paiements reçus)',
            Vente::ALERTE_PAYEE_APRES_ANNULATION => 'Payée après annulation/expiration',
            default => $alerte,
        };
    }
}

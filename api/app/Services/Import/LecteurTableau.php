<?php

namespace App\Services\Import;

use App\Exceptions\ErreurMetier;
use OpenSpout\Reader\XLSX\Reader as LecteurXlsx;

/**
 * Lecture d'un fichier tabulaire (CSV ou XLSX) en lignes de chaînes.
 * CSV : détection de l'encodage (BOM UTF-8, UTF-8 valide, sinon Windows-1252) et du séparateur (; , tab |).
 * XLSX : première feuille, via OpenSpout (flux, mémoire bornée).
 */
class LecteurTableau
{
    private const SEPARATEURS = [';', ',', "\t", '|'];

    /**
     * @return array{format: 'csv'|'xlsx', encodage: ?string, separateur: ?string, lignes: list<list<string>>}
     */
    public function lire(string $chemin, string $format, int $maxLignes): array
    {
        return $format === 'xlsx' ? $this->lireXlsx($chemin, $maxLignes) : $this->lireCsv($chemin, $maxLignes);
    }

    /** Format réel déduit de la signature : « PK » = zip (xlsx), sinon texte (csv). */
    public static function formatReel(string $chemin): string
    {
        $flux = @fopen($chemin, 'rb');
        $entete = $flux === false ? '' : (string) fread($flux, 4);
        if ($flux !== false) {
            fclose($flux);
        }

        if (str_starts_with($entete, "PK\x03\x04")) {
            return 'xlsx';
        }

        // Texte : aucun octet nul dans les premiers Ko (un binaire déguisé est refusé).
        $debut = (string) file_get_contents($chemin, false, null, 0, 4096);
        if ($debut === '' || str_contains($debut, "\0")) {
            throw new ErreurMetier('FICHIER_ILLISIBLE', 'Le fichier n\'est ni un CSV ni un classeur Excel (.xlsx).', 422);
        }

        return 'csv';
    }

    private function lireCsv(string $chemin, int $maxLignes): array
    {
        $contenu = (string) file_get_contents($chemin);
        $encodage = 'UTF-8';

        if (str_starts_with($contenu, "\xEF\xBB\xBF")) {
            $contenu = substr($contenu, 3);
            $encodage = 'UTF-8 (BOM)';
        } elseif (! mb_check_encoding($contenu, 'UTF-8')) {
            $contenu = mb_convert_encoding($contenu, 'UTF-8', 'Windows-1252');
            $encodage = 'Windows-1252';
        }

        $contenu = str_replace(["\r\n", "\r"], "\n", $contenu);
        $separateur = $this->detecterSeparateur($contenu);

        $flux = fopen('php://temp', 'r+');
        fwrite($flux, $contenu);
        rewind($flux);

        $lignes = [];
        while (($ligne = fgetcsv($flux, 0, $separateur, '"', '')) !== false) {
            if ($ligne === [null] || $ligne === ['']) {
                continue; // ligne vide
            }
            $lignes[] = array_map(fn ($v) => trim((string) $v), $ligne);
            if (count($lignes) > $maxLignes) {
                fclose($flux);
                throw new ErreurMetier('IMPORT_TROP_GRAND', sprintf('Le fichier dépasse %d lignes.', $maxLignes), 422);
            }
        }
        fclose($flux);

        return ['format' => 'csv', 'encodage' => $encodage, 'separateur' => $separateur === "\t" ? 'tab' : $separateur, 'lignes' => $lignes];
    }

    private function lireXlsx(string $chemin, int $maxLignes): array
    {
        $lecteur = new LecteurXlsx;
        $lignes = [];

        try {
            $lecteur->open($chemin);

            foreach ($lecteur->getSheetIterator() as $feuille) {
                foreach ($feuille->getRowIterator() as $ligne) {
                    $cellules = array_map(function ($cellule) {
                        $valeur = $cellule->getValue();
                        if ($valeur instanceof \DateTimeInterface) {
                            return $valeur->format('Y-m-d');
                        }

                        return trim(is_scalar($valeur) ? (string) $valeur : '');
                    }, $ligne->getCells());

                    if (implode('', $cellules) === '') {
                        continue;
                    }

                    $lignes[] = $cellules;
                    if (count($lignes) > $maxLignes) {
                        throw new ErreurMetier('IMPORT_TROP_GRAND', sprintf('Le fichier dépasse %d lignes.', $maxLignes), 422);
                    }
                }

                break; // première feuille seulement
            }
        } catch (ErreurMetier $e) {
            throw $e;
        } catch (\Throwable) {
            throw new ErreurMetier('FICHIER_ILLISIBLE', 'Le classeur Excel est illisible ou corrompu.', 422);
        } finally {
            $lecteur->close();
        }

        return ['format' => 'xlsx', 'encodage' => null, 'separateur' => null, 'lignes' => $lignes];
    }

    private function detecterSeparateur(string $contenu): string
    {
        $echantillon = implode("\n", array_slice(explode("\n", $contenu, 21), 0, 20));
        $meilleur = ';';
        $max = -1;

        foreach (self::SEPARATEURS as $sep) {
            $n = substr_count($echantillon, $sep);
            if ($n > $max) {
                $max = $n;
                $meilleur = $sep;
            }
        }

        return $meilleur;
    }
}

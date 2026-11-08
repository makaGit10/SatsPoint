<?php

namespace App\Services\Import;

use App\Services\RechercheGlobale;

/**
 * Suggestions de correspondance colonne → champ (CAHIER § 6.15) : dictionnaire de synonymes FR/EN
 * puis similarité (similar_text / Levenshtein) sur l'en-tête normalisé. Une colonne sans correspondance
 * sûre reste à `null` (ignorée) : mieux vaut ne rien suggérer que mal suggérer.
 */
class SuggestionsColonnes
{
    /** @var array<string, list<string>> champ → synonymes (normalisés : minuscules, sans accent) */
    public const DICTIONNAIRE = [
        'nom' => ['nom', 'designation', 'libelle', 'article', 'produit', 'intitule', 'titre', 'name', 'item', 'product', 'description', 'label', 'nom article', 'nom produit', 'product name', 'item name'],
        'prix_xof' => ['prix', 'tarif', 'pu', 'prix unitaire', 'prix xof', 'prix fcfa', 'prix cfa', 'montant', 'price', 'unit price', 'amount', 'cost', 'prix de vente', 'pv', 'xof', 'fcfa', 'cfa'],
        'categorie' => ['categorie', 'cat', 'famille', 'rayon', 'type', 'groupe', 'category', 'group', 'family', 'section'],
        'sku' => ['sku', 'reference', 'ref', 'code', 'code article', 'code produit', 'ean', 'barcode', 'code barre', 'code-barres', 'id', 'identifiant', 'ref article', 'numero', 'no'],
        'couleur' => ['couleur', 'color', 'colour', 'teinte', 'hex', 'code couleur'],
        'actif' => ['actif', 'active', 'activé', 'visible', 'en vente', 'disponible', 'statut', 'status', 'enabled', 'available', 'published', 'publie'],
    ];

    /**
     * @param  list<string>  $colonnes
     * @return array<string, ?string> colonne → champ | null
     */
    public function suggerer(array $colonnes): array
    {
        $suggestions = [];
        $pris = [];

        // 1) Correspondances exactes du dictionnaire (prioritaires).
        foreach ($colonnes as $colonne) {
            $norme = RechercheGlobale::normaliser($colonne);
            $suggestions[$colonne] = null;

            foreach (self::DICTIONNAIRE as $champ => $synonymes) {
                if (in_array($norme, array_map(RechercheGlobale::normaliser(...), $synonymes), true) && ! isset($pris[$champ])) {
                    $suggestions[$colonne] = $champ;
                    $pris[$champ] = true;
                    break;
                }
            }
        }

        // 2) Similarité pour les colonnes restantes (« Désignation produit » → nom, « Tarif TTC » → prix_xof).
        foreach ($colonnes as $colonne) {
            if ($suggestions[$colonne] !== null) {
                continue;
            }

            $norme = RechercheGlobale::normaliser($colonne);
            $meilleur = [null, 0.0];

            foreach (self::DICTIONNAIRE as $champ => $synonymes) {
                if (isset($pris[$champ])) {
                    continue;
                }
                foreach ($synonymes as $synonyme) {
                    $score = RechercheGlobale::similarite(RechercheGlobale::normaliser($synonyme), $norme);
                    if ($score > $meilleur[1]) {
                        $meilleur = [$champ, $score];
                    }
                }
            }

            if ($meilleur[0] !== null && $meilleur[1] >= 0.75) {
                $suggestions[$colonne] = $meilleur[0];
                $pris[$meilleur[0]] = true;
            }
        }

        return $suggestions;
    }
}

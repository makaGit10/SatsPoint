<?php

namespace App\Support;

/**
 * Pictogrammes d'articles (liste FERMÉE, partagée avec le front : web/src/ecrans/articles/pictogrammes.tsx).
 * Pensés pour le commerce local (boutique de quartier, marché, restauration, services) : un commerçant qui
 * ne lit pas reconnaît son article à l'image. Les libellés français servent à la recherche globale, à
 * l'export et aux libellés par défaut ; l'interface traduit elle-même (`pictos.{id}`).
 */
final class Pictogrammes
{
    /** id → libellé français. Ne jamais renommer un id (il est enregistré en base). */
    public const LIBELLES = [
        // Alimentation
        'pain' => 'Pain',
        'riz' => 'Riz',
        'sucre' => 'Sucre',
        'huile' => 'Huile',
        'farine' => 'Farine, céréales',
        'lait' => 'Lait',
        'oeufs' => 'Œufs',
        'viande' => 'Viande',
        'poulet' => 'Poulet',
        'poisson' => 'Poisson',
        'legumes' => 'Légumes',
        'fruits' => 'Fruits',
        'plat' => 'Plat cuisiné',
        'sandwich' => 'Sandwich',
        'gateau' => 'Gâteau, beignet',
        'bonbons' => 'Bonbons',
        'glace' => 'Glace',
        'epicerie' => 'Épicerie',
        // Boissons
        'eau' => 'Eau',
        'the' => 'Thé, ataya',
        'cafe' => 'Café',
        'jus' => 'Jus, bissap',
        'boisson' => 'Boisson',
        // Mode et beauté
        'tissu' => 'Tissu, wax, bazin',
        'vetement' => 'Vêtement',
        'chaussure' => 'Chaussure',
        'sac' => 'Sac',
        'bijou' => 'Bijou',
        'coiffure' => 'Coiffure, couture',
        'beaute' => 'Beauté',
        // Maison
        'savon' => 'Savon, hygiène',
        'menage' => 'Ménage',
        'bebe' => 'Bébé',
        'gaz' => 'Gaz',
        'electricite' => 'Électricité',
        // Téléphone et services
        'credit' => 'Crédit téléphone',
        'telephone' => 'Téléphone',
        'medicament' => 'Médicament',
        'cigarette' => 'Cigarette',
        'fournitures' => 'Cahier, fournitures',
        'reparation' => 'Réparation',
        'service' => 'Service',
        'divers' => 'Divers',
    ];

    /** @return list<string> */
    public static function ids(): array
    {
        return array_keys(self::LIBELLES);
    }

    public static function libelle(?string $id): ?string
    {
        return $id === null ? null : (self::LIBELLES[$id] ?? null);
    }

    /**
     * Pictogrammes dont le libellé contient le terme (sans accent ni casse) : la recherche globale trouve
     * « pain » même pour un article sans nom écrit.
     *
     * @return list<string>
     */
    public static function correspondants(string $terme): array
    {
        $t = self::normaliser($terme);

        if (mb_strlen($t) < 2) {
            return [];
        }

        return array_values(array_filter(self::ids(), fn (string $id) => str_contains(self::normaliser(self::LIBELLES[$id].' '.$id), $t)));
    }

    private static function normaliser(string $texte): string
    {
        $sans = \Normalizer::normalize(mb_strtolower(trim($texte)), \Normalizer::FORM_D) ?: $texte;

        return (string) preg_replace('/\p{Mn}+/u', '', str_replace('œ', 'oe', $sans));
    }
}

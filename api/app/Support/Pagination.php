<?php

namespace App\Support;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * Pagination par numéro de page (CONTRAT_API § Pagination) : `page` ≥ 1, `par_page` borné,
 * réponse `{ <données>, pagination: { page, par_page, total, pages } }`.
 *
 * Page au-delà de la dernière : liste vide et `pagination` exacte (le client revient à la dernière page).
 */
final class Pagination
{
    public const PAR_PAGE_MIN = 10;

    public const PAR_PAGE_MAX = 100;

    /** Au-delà, l'OFFSET deviendrait coûteux : on borne (100 000 lignes à 10 par page). */
    public const PAGE_MAX = 10_000;

    /** Règles de validation communes (Form Requests). */
    public static function regles(): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1', 'max:'.self::PAGE_MAX],
            'par_page' => ['sometimes', 'integer', 'min:'.self::PAR_PAGE_MIN, 'max:'.self::PAR_PAGE_MAX],
        ];
    }

    /**
     * Valeurs effectives, bornées une seconde fois (appels internes hors Form Request).
     *
     * @param  array{page?: mixed, par_page?: mixed}  $entree
     * @return array{page: int, par_page: int}
     */
    public static function lire(array $entree, int $parPageDefaut): array
    {
        return [
            'page' => max(1, min(self::PAGE_MAX, (int) ($entree['page'] ?? 1))),
            'par_page' => max(1, min(self::PAR_PAGE_MAX, (int) ($entree['par_page'] ?? $parPageDefaut))),
        ];
    }

    /** @return array{page: int, par_page: int, total: int, pages: int} */
    public static function forme(LengthAwarePaginator $page): array
    {
        return [
            'page' => $page->currentPage(),
            'par_page' => $page->perPage(),
            'total' => $page->total(),
            // Au moins 1 : une liste vide a une page (vide).
            'pages' => $page->lastPage(),
        ];
    }
}

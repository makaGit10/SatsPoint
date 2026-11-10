<?php

namespace App\Http\Requests\Concerns;

use App\Support\Pagination;

/** `page` et `par_page` validés (bornes communes) et lus avec la valeur par défaut de l'écran. */
trait AvecPagination
{
    /** @return array<string, array<int, string>> */
    protected function reglesPagination(): array
    {
        return Pagination::regles();
    }

    /** @return array{page: int, par_page: int} */
    public function pagination(int $parPageDefaut): array
    {
        return Pagination::lire($this->safe()->only(['page', 'par_page']), $parPageDefaut);
    }
}

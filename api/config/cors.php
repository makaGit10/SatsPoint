<?php

/*
|--------------------------------------------------------------------------
| CORS — liste explicite d'origines (jamais « * »).
|--------------------------------------------------------------------------
| Les origines autorisées sont déduites de FRONTEND_URL et APP_URL (schéma + hôte + port).
| CORS_ORIGINES_SUPPLEMENTAIRES (séparées par des virgules) permet d'en ajouter sans toucher au code.
*/

$origines = array_values(array_unique(array_filter(array_map(
    function (string $url): ?string {
        $url = trim($url);
        if ($url === '') {
            return null;
        }
        $parties = parse_url($url);
        if (! isset($parties['scheme'], $parties['host'])) {
            return null;
        }
        $origine = $parties['scheme'].'://'.$parties['host'];
        if (isset($parties['port'])) {
            $origine .= ':'.$parties['port'];
        }

        return $origine;
    },
    array_merge(
        [(string) env('FRONTEND_URL', ''), (string) env('APP_URL', '')],
        explode(',', (string) env('CORS_ORIGINES_SUPPLEMENTAIRES', ''))
    )
))));

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie', 'broadcasting/auth'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => $origines,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Accept-Language', 'Content-Type', 'X-Requested-With', 'X-XSRF-TOKEN', 'X-Socket-Id', 'Authorization'],

    'exposed_headers' => ['ETag'],

    'max_age' => 600,

    'supports_credentials' => true,

];

<?php

namespace App\Http\Middleware;

use App\Models\Audio;
use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Console plateforme pour le compte « Studio (démo jury) » de l'accès rapide :
 * - le jury REGARDE et ÉCOUTE tout (matrice, enregistrements, statistiques, santé, catalogues) ;
 * - il ENREGISTRE, PUBLIE et SUPPRIME pour de vrai, mais seulement dans les langues d'essai (bambara par défaut,
 *   config satspoint.demo.langues_essai) : les voix publiées des autres langues (le wolof de la propriétaire)
 *   ne peuvent jamais être remplacées ni supprimées ;
 * - jamais : catalogues (langues, pays, moyens), statut des boutiques, liste des boutiques, journal d'audit.
 */
class ConsoleDemoLectureSeule
{
    private const LECTURE = ['admin.audio.matrice', 'admin.audio.show', 'admin.audio.ecouter', 'admin.sante', 'admin.statistiques', 'admin.pays.index', 'admin.langues.index', 'admin.moyens-paiement.index'];

    public function handle(Request $request, Closure $next): Response
    {
        $utilisateur = $request->user();
        if (! $utilisateur instanceof User || ! $utilisateur->estStudioDemo()) {
            return $next($request);
        }

        $route = Str::after((string) $request->route()?->getName(), 'api.v1.');
        $essai = array_values(array_map('strval', (array) config('satspoint.demo.langues_essai', ['bm'])));

        $autorise = match (true) {
            $request->isMethod('GET') && in_array($route, self::LECTURE, true) => true,
            $route === 'admin.audio.store' => in_array((string) $request->input('langue'), $essai, true),
            $route === 'admin.audio.publier' => $this->publicationEssai($request, $essai),
            $route === 'admin.audio.destroy' => in_array((string) $this->audio($request)?->langue, $essai, true),
            default => false,
        };

        if (! $autorise) {
            return response()->json([
                'message' => 'Console de démonstration : écoute libre ; enregistrement et publication seulement dans la langue d\'essai ('.implode(', ', $essai).').',
                'code' => 'DEMO_PROTEGE',
            ], 403);
        }

        return $next($request);
    }

    private function publicationEssai(Request $request, array $essai): bool
    {
        if ($request->filled('cle')) {
            return in_array((string) $request->input('langue'), $essai, true);
        }
        $ids = array_values(array_unique(array_filter((array) $request->input('ids', []), 'is_numeric')));
        if ($ids === []) {
            return false;
        }

        return Audio::query()->whereIn('id', $ids)->count() === count($ids)
            && Audio::query()->whereIn('id', $ids)->whereNotIn('langue', $essai)->doesntExist();
    }

    private function audio(Request $request): ?Audio
    {
        $audio = $request->route('audio');

        return $audio instanceof Audio ? $audio : (is_numeric($audio) ? Audio::query()->find($audio) : null);
    }
}

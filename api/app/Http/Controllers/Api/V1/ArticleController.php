<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Articles\ArticleRequest;
use App\Http\Requests\Articles\OrdreArticlesRequest;
use App\Http\Resources\ArticleResource;
use App\Models\Article;
use App\Services\BoutiqueCourante;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/** Articles (CONTRAT_API § 9) : lecture pour tout membre, gestion propriétaire / gérant. */
class ArticleController extends Controller
{
    /** GET /articles → { articles: Article[] } (actifs et inactifs, ordre de la grille). */
    public function index(): JsonResponse
    {
        app(BoutiqueCourante::class)->exiger(Article::class);
        $this->authorize('viewAny', Article::class);

        $articles = Article::query()->orderBy('position')->orderBy('nom')->get();

        return response()->json(['articles' => ArticleResource::collection($articles)->resolve()]);
    }

    /** POST /articles → 201 { article } */
    public function store(ArticleRequest $request): JsonResponse
    {
        app(BoutiqueCourante::class)->exiger(Article::class);
        $this->authorize('create', Article::class);

        $donnees = $request->validated();
        $donnees['position'] ??= ((int) Article::query()->max('position')) + 1;
        $donnees['actif'] ??= true;

        $article = Article::create($donnees);

        Audit::enregistrer('article.cree', $article, ['nom' => $article->nom, 'prix_xof' => $article->prix_xof]);

        return (new ArticleResource($article))->response()->setStatusCode(201);
    }

    /** PATCH /articles/{article} → { article } */
    public function update(ArticleRequest $request, Article $article): ArticleResource
    {
        $this->authorize('update', $article);

        $article->fill($request->validated())->save();

        Audit::enregistrer('article.modifie', $article, ['champs' => array_keys($request->validated())]);

        return new ArticleResource($article);
    }

    /** DELETE /articles/{article} → 204 (les lignes de vente gardent leur libellé, article_id passe à null). */
    public function destroy(Article $article): Response
    {
        $this->authorize('delete', $article);

        $article->delete();

        Audit::enregistrer('article.supprime', $article, ['nom' => $article->nom]);

        return response()->noContent();
    }

    /** POST /articles/ordre { ulids: string[] } → { articles } : positions dans l'ordre reçu. */
    public function ordre(OrdreArticlesRequest $request): JsonResponse
    {
        app(BoutiqueCourante::class)->exiger(Article::class);
        $this->authorize('ordonner', Article::class);

        $ulids = array_values($request->input('ulids'));

        DB::transaction(function () use ($ulids) {
            $articles = Article::query()->whereIn('ulid', $ulids)->lockForUpdate()->get()->keyBy('ulid');
            $position = 1;

            foreach ($ulids as $ulid) {
                $article = $articles->get($ulid);
                if ($article !== null && (int) $article->position !== $position) {
                    $article->forceFill(['position' => $position])->save();
                }
                $position++;
            }
        });

        return $this->index();
    }
}

<?php

namespace App\Http\Controllers\Api\V1;

use App\Facades\Audit;
use App\Http\Controllers\Controller;
use App\Http\Requests\Articles\ArticleRequest;
use App\Http\Requests\Articles\MediaArticleRequest;
use App\Http\Requests\Articles\OrdreArticlesRequest;
use App\Http\Resources\ArticleResource;
use App\Models\Article;
use App\Models\ArticleFichier;
use App\Services\Articles\MediasArticle;
use App\Services\BoutiqueCourante;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response as ReponseFichier;

/**
 * Articles (CONTRAT_API § 9 et § 15) : lecture pour tout membre, gestion propriétaire / gérant.
 * Un article se crée et se modifie SANS ÉCRIRE : pictogramme, photo prise au téléphone, nom dit à voix haute.
 */
class ArticleController extends Controller
{
    public function __construct(private readonly MediasArticle $medias) {}

    /** GET /articles → { articles: Article[] } (actifs et inactifs, ordre de la grille). */
    public function index(): JsonResponse
    {
        app(BoutiqueCourante::class)->exiger(Article::class);
        $this->authorize('viewAny', Article::class);

        $articles = Article::query()->orderBy('position')->orderBy('nom')->get();

        return response()->json(['articles' => ArticleResource::collection($articles)->resolve()]);
    }

    /** POST /articles (JSON, ou multipart avec `photo` / `voix`) → 201 { article } — tout ou rien. */
    public function store(ArticleRequest $request): JsonResponse
    {
        app(BoutiqueCourante::class)->exiger(Article::class);
        $this->authorize('create', Article::class);

        // Fichiers ré-encodés AVANT toute écriture : un fichier refusé ne crée rien.
        $photo = $request->hasFile('photo') ? $this->medias->preparerPhoto($request->file('photo')) : null;
        $voix = $request->hasFile('voix') ? $this->medias->preparerVoix($request->file('voix')) : null;

        $donnees = $request->champs();
        $donnees['position'] ??= ((int) Article::query()->max('position')) + 1;
        $donnees['actif'] ??= true;

        $article = DB::transaction(function () use ($donnees, $photo, $voix) {
            $article = new Article($donnees);
            // Empreintes provisoires : la contrainte « au moins une identité » est vérifiée dès l'INSERT.
            $article->forceFill([
                'photo_empreinte' => $photo === null ? null : hash('sha256', $photo['contenu']),
                'voix_empreinte' => $voix === null ? null : hash('sha256', $voix['contenu']),
            ])->save();

            if ($photo !== null) {
                $this->medias->enregistrer($article, ArticleFichier::TYPE_PHOTO, $photo);
            }
            if ($voix !== null) {
                $this->medias->enregistrer($article, ArticleFichier::TYPE_VOIX, $voix);
            }

            return $article;
        });

        Audit::enregistrer('article.cree', $article, [
            'nom' => $article->nom,
            'prix_xof' => $article->prix_xof,
            'pictogramme' => $article->pictogramme,
            'photo' => $photo !== null,
            'voix' => $voix !== null,
        ]);

        return (new ArticleResource($article))->response()->setStatusCode(201);
    }

    /** PATCH /articles/{article} → { article } */
    public function update(ArticleRequest $request, Article $article): ArticleResource
    {
        $this->authorize('update', $article);

        $article->fill($request->champs())->save();

        Audit::enregistrer('article.modifie', $article, ['champs' => array_keys($request->champs())]);

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

    /** POST /articles/{article}/photo (multipart `fichier`) → { article } : photo ré-encodée en WebP 512 px, EXIF retirées. */
    public function envoyerPhoto(MediaArticleRequest $request, Article $article): ArticleResource
    {
        $prepare = $this->medias->preparerPhoto($request->file('fichier'));
        $remplace = $article->photo_empreinte !== null;

        DB::transaction(fn () => $this->medias->enregistrer($article, ArticleFichier::TYPE_PHOTO, $prepare));

        Audit::enregistrer('article.photo_ajoutee', $article, ['octets' => strlen($prepare['contenu']), 'largeur' => $prepare['largeur'], 'hauteur' => $prepare['hauteur'], 'remplace' => $remplace]);

        return new ArticleResource($article);
    }

    /** POST /articles/{article}/voix (multipart `fichier`) → { article } : nom dit à voix haute, MP3 ré-encodé (≤ 7 s). */
    public function envoyerVoix(MediaArticleRequest $request, Article $article): ArticleResource
    {
        $prepare = $this->medias->preparerVoix($request->file('fichier'));
        $remplace = $article->voix_empreinte !== null;

        DB::transaction(fn () => $this->medias->enregistrer($article, ArticleFichier::TYPE_VOIX, $prepare));

        Audit::enregistrer('article.voix_ajoutee', $article, ['duree_ms' => $prepare['duree_ms'], 'remplace' => $remplace]);

        return new ArticleResource($article);
    }

    /** DELETE /articles/{article}/photo → { article } (idempotent ; 422 ARTICLE_SANS_IDENTITE si c'était sa seule identité). */
    public function supprimerPhoto(Article $article): ArticleResource
    {
        $this->authorize('update', $article);

        if ($this->medias->supprimer($article, ArticleFichier::TYPE_PHOTO)) {
            Audit::enregistrer('article.photo_supprimee', $article);
        }

        return new ArticleResource($article);
    }

    /** DELETE /articles/{article}/voix → { article } (idempotent ; 422 ARTICLE_SANS_IDENTITE si c'était sa seule identité). */
    public function supprimerVoix(Article $article): ArticleResource
    {
        $this->authorize('update', $article);

        if ($this->medias->supprimer($article, ArticleFichier::TYPE_VOIX)) {
            Audit::enregistrer('article.voix_supprimee', $article);
        }

        return new ArticleResource($article);
    }

    /** GET /articles/{article}/photo → image/webp (tout membre de la boutique ; cache privé, ETag). */
    public function photo(Request $request, Article $article): ReponseFichier
    {
        $this->authorize('view', $article);

        return $this->medias->reponse($request, $article, ArticleFichier::TYPE_PHOTO);
    }

    /** GET /articles/{article}/voix → audio/mpeg (tout membre de la boutique ; cache privé, ETag, plages d'octets). */
    public function voix(Request $request, Article $article): ReponseFichier
    {
        $this->authorize('view', $article);

        return $this->medias->reponse($request, $article, ArticleFichier::TYPE_VOIX);
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

<?php

namespace App\Services\Articles;

use App\Exceptions\ErreurMetier;
use App\Models\Article;
use App\Models\ArticleFichier;
use App\Services\Audio\InspecteurAudio;
use App\Services\Audio\TraitementAudio;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/**
 * Photo et nom dit à voix haute des articles (11 novembre).
 *
 * - Préparation (hors transaction) : type réel vérifié, fichier ré-encodé par le serveur (photo → WebP via GD,
 *   voix → MP3 via le traitement ffmpeg du studio, paramètres figés, délai borné). Aucun octet d'origine conservé.
 * - Enregistrement : contenu EN BASE (`article_fichiers`, bytea, requête préparée, paramètre LOB), empreinte et
 *   durée reportées sur l'article (les listes ne lisent jamais le contenu). Le disque de Render est éphémère.
 * - Lecture : une ligne à la fois, cloisonnée par boutique (BoutiqueScope sur Article ET sur ArticleFichier).
 */
class MediasArticle
{
    public function __construct(
        private readonly TraitementImage $images,
        private readonly InspecteurAudio $inspecteur,
        private readonly TraitementAudio $traitementAudio,
    ) {}

    /**
     * Ré-encode une photo reçue.
     *
     * @return array{contenu: string, mime: string, largeur: int, hauteur: int, duree_ms: null}
     */
    public function preparerPhoto(UploadedFile $fichier): array
    {
        return $this->images->convertir($this->cheminLisible($fichier)) + ['duree_ms' => null];
    }

    /**
     * Ré-encode un nom vocal reçu (MP3 mono 48 kb/s, silences de début et de fin coupés, volume normalisé).
     *
     * @return array{contenu: string, mime: string, largeur: null, hauteur: null, duree_ms: int}
     */
    public function preparerVoix(UploadedFile $fichier): array
    {
        $source = $this->cheminLisible($fichier);
        $inspection = $this->inspecteur->inspecter($source, (int) config('satspoint.articles_medias.voix_duree_max_ms', 7000));

        $sortie = tempnam(sys_get_temp_dir(), 'sp-voix-');
        if ($sortie === false) {
            throw new \RuntimeException('temporaire_impossible');
        }

        try {
            try {
                $this->traitementAudio->convertirEnMp3($source, $sortie);
            } catch (\RuntimeException $e) {
                Log::info('articles: voix non convertie', ['motif' => $e->getMessage()]);

                throw new ErreurMetier('AUDIO_ILLISIBLE', 'Aucune voix n\'a été entendue : recommencez en parlant près du téléphone.', 422);
            }

            $contenu = (string) file_get_contents($sortie);
            $duree = $this->inspecteur->duree($sortie) ?? $inspection['duree_ms'];
        } finally {
            @unlink($sortie);
        }

        return ['contenu' => $contenu, 'mime' => 'audio/mpeg', 'largeur' => null, 'hauteur' => null, 'duree_ms' => (int) $duree];
    }

    /**
     * Enregistre (ou remplace) le fichier d'un article et reporte son empreinte sur l'article.
     * À appeler dans une transaction quand l'article vient d'être créé.
     *
     * @param  array{contenu: string, mime: string, largeur: ?int, hauteur: ?int, duree_ms: ?int}  $prepare
     */
    public function enregistrer(Article $article, string $type, array $prepare): void
    {
        $empreinte = hash('sha256', $prepare['contenu']);
        $flux = fopen('php://temp', 'r+b');
        fwrite($flux, $prepare['contenu']);
        rewind($flux);

        try {
            $instruction = DB::connection()->getPdo()->prepare(
                'INSERT INTO article_fichiers (boutique_id, article_id, type, contenu, mime, octets, empreinte, largeur, hauteur, duree_ms, created_at, updated_at) '
                .'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) '
                .'ON CONFLICT (article_id, type) DO UPDATE SET contenu = EXCLUDED.contenu, mime = EXCLUDED.mime, octets = EXCLUDED.octets, '
                .'empreinte = EXCLUDED.empreinte, largeur = EXCLUDED.largeur, hauteur = EXCLUDED.hauteur, duree_ms = EXCLUDED.duree_ms, updated_at = EXCLUDED.updated_at'
            );
            $maintenant = now()->format('Y-m-d H:i:s');
            $instruction->bindValue(1, (int) $article->boutique_id, \PDO::PARAM_INT);
            $instruction->bindValue(2, (int) $article->id, \PDO::PARAM_INT);
            $instruction->bindValue(3, $type);
            $lob = $flux; // bindParam lie par référence : le pilote peut remplacer la variable liée
            $instruction->bindParam(4, $lob, \PDO::PARAM_LOB);
            $instruction->bindValue(5, $prepare['mime']);
            $instruction->bindValue(6, strlen($prepare['contenu']), \PDO::PARAM_INT);
            $instruction->bindValue(7, $empreinte);
            $instruction->bindValue(8, $prepare['largeur'], $prepare['largeur'] === null ? \PDO::PARAM_NULL : \PDO::PARAM_INT);
            $instruction->bindValue(9, $prepare['hauteur'], $prepare['hauteur'] === null ? \PDO::PARAM_NULL : \PDO::PARAM_INT);
            $instruction->bindValue(10, $prepare['duree_ms'], $prepare['duree_ms'] === null ? \PDO::PARAM_NULL : \PDO::PARAM_INT);
            $instruction->bindValue(11, $maintenant);
            $instruction->bindValue(12, $maintenant);
            $instruction->execute();
        } finally {
            fclose($flux);
        }

        // Requête PDO directe : le middleware temps réel ne la voit pas ; la mise à jour de l'article (ci-dessous) émet « articles ».
        if ($type === ArticleFichier::TYPE_PHOTO) {
            $article->forceFill(['photo_empreinte' => $empreinte])->save();
        } else {
            $article->forceFill(['voix_empreinte' => $empreinte, 'voix_duree_ms' => $prepare['duree_ms']])->save();
        }
    }

    /** Retire la photo ou la voix ; refuse si l'article n'aurait plus aucune identité. */
    public function supprimer(Article $article, string $type): bool
    {
        $present = $type === ArticleFichier::TYPE_PHOTO ? $article->photo_empreinte !== null : $article->voix_empreinte !== null;

        if (! $present) {
            return false;
        }

        $apres = clone $article;
        $type === ArticleFichier::TYPE_PHOTO ? $apres->photo_empreinte = null : $apres->voix_empreinte = null;

        if (! $apres->aUneIdentite()) {
            throw new ErreurMetier('ARTICLE_SANS_IDENTITE', 'Un article garde au moins un nom, une image, une photo ou un nom dit à voix haute.', 422);
        }

        DB::transaction(function () use ($article, $type) {
            ArticleFichier::query()->where('article_id', $article->id)->where('type', $type)->delete();
            $article->forceFill($type === ArticleFichier::TYPE_PHOTO ? ['photo_empreinte' => null] : ['voix_empreinte' => null, 'voix_duree_ms' => null])->save();
        });

        return true;
    }

    /**
     * Réponse HTTP du fichier : ETag = empreinte, 304 si le navigateur l'a déjà ; cache PRIVÉ (navigateur seulement)
     * et long seulement si l'URL porte la bonne version (`v`). La voix est servie avec les plages d'octets (Safari).
     */
    public function reponse(Request $request, Article $article, string $type): Response
    {
        $empreinte = $type === ArticleFichier::TYPE_PHOTO ? $article->photo_empreinte : $article->voix_empreinte;

        if ($empreinte === null) {
            throw new NotFoundHttpException;
        }

        $version = (string) $request->query('v', '');
        $entetes = [
            'Cache-Control' => $version !== '' && hash_equals(substr($empreinte, 0, 12), $version) ? 'private, max-age=31536000, immutable' : 'private, no-cache',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Disposition' => 'inline',
            'Vary' => 'Cookie',
        ];

        // 304 sans lire le contenu.
        $vide = new Response('', 200, $entetes);
        $vide->setEtag($empreinte);
        if ($vide->isNotModified($request)) {
            return $vide;
        }

        $ligne = DB::selectOne(
            'SELECT contenu, mime FROM article_fichiers WHERE article_id = ? AND boutique_id = ? AND type = ?',
            [$article->id, $article->boutique_id, $type]
        );

        if ($ligne === null) {
            throw new NotFoundHttpException;
        }

        $contenu = is_resource($ligne->contenu) ? (string) stream_get_contents($ligne->contenu) : (string) $ligne->contenu;
        $mime = in_array($ligne->mime, ['image/webp', 'audio/mpeg'], true) ? $ligne->mime : 'application/octet-stream';

        if ($type === ArticleFichier::TYPE_VOIX) {
            $temporaire = tempnam(sys_get_temp_dir(), 'sp-lecture-');
            if ($temporaire !== false && file_put_contents($temporaire, $contenu) !== false) {
                $reponse = new BinaryFileResponse($temporaire, 200, $entetes + ['Content-Type' => $mime, 'Accept-Ranges' => 'bytes'], false, null, false, false);
                $reponse->deleteFileAfterSend(true);
                $reponse->setEtag($empreinte);

                return $reponse; // plages d'octets (206) traitées par prepare(), appelé par Laravel avant l'envoi
            }
        }

        $reponse = new Response($contenu, 200, $entetes + ['Content-Type' => $mime, 'Content-Length' => (string) strlen($contenu)]);
        $reponse->setEtag($empreinte);

        return $reponse;
    }

    private function cheminLisible(UploadedFile $fichier): string
    {
        $chemin = $fichier->getRealPath();

        if ($chemin === false || ! is_file($chemin)) {
            throw new ErreurMetier('FICHIER_ILLISIBLE', 'Le fichier n\'a pas pu être lu : renvoyez-le.', 422);
        }

        return $chemin;
    }
}

<?php

namespace App\Services;

use App\Models\Article;
use App\Models\Membre;
use App\Models\RechercheRecente;
use App\Models\User;
use App\Models\Vente;
use App\Support\Pictogrammes;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Recherche globale (CAHIER § 6.14, DIRECTIVES § 1.4) : résultats groupés par rubrique, 5 par rubrique,
 * tolérance aux fautes et aux accents (pg_trgm + unaccent, index GIN), droits du rôle respectés
 * (un caissier ne trouve ni l'équipe ni les réglages, et seulement SES ventes).
 */
class RechercheGlobale
{
    public const RUBRIQUES = ['ventes', 'articles', 'equipe', 'pages'];

    /** Seuil de similarité de mot (0..1) : « bazim » trouve « bazin ». */
    private const SEUIL = 0.45;

    public function __construct(private readonly BoutiqueCourante $courante) {}

    /**
     * @return array{groupes: list<array{rubrique: string, resultats: list<array{titre: string, sous_titre: ?string, url: string, score: float}>}>}
     */
    public function chercher(string $q, Membre $acteur, User $utilisateur, string $locale = 'fr'): array
    {
        $q = Str::squish($q);
        $limite = (int) config('satspoint.recherche.par_rubrique', 5);
        $groupes = [];

        $ventes = $this->ventes($q, $acteur, $utilisateur, $limite);
        if ($ventes !== []) {
            $groupes[] = ['rubrique' => 'ventes', 'resultats' => $ventes];
        }

        $articles = $this->articles($q, $limite);
        if ($articles !== []) {
            $groupes[] = ['rubrique' => 'articles', 'resultats' => $articles];
        }

        if ($acteur->peutAdministrer()) {
            $equipe = $this->equipe($q, $limite);
            if ($equipe !== []) {
                $groupes[] = ['rubrique' => 'equipe', 'resultats' => $equipe];
            }
        }

        $pages = $this->pages($q, $acteur, $locale, $limite);
        if ($pages !== []) {
            $groupes[] = ['rubrique' => 'pages', 'resultats' => $pages];
        }

        return ['groupes' => $groupes];
    }

    // ------------------------------------------------------------ rubriques

    /** Ventes : numéro (« V-000012 », « 12 »), montant exact, note (trigramme, sans accent). */
    private function ventes(string $q, Membre $acteur, User $utilisateur, int $limite): array
    {
        $requete = Vente::query()->with(['caissier:id,ulid,nom']);

        if ($acteur->estCaissier()) {
            $requete->where('caissier_id', $utilisateur->id);
        }

        $estNumero = preg_match('/^v?-?\s*0*(\d{1,12})$/i', $q, $m) === 1;
        $estTexte = mb_strlen($q) >= 2 && preg_match('/^[\d\s.,-]+$/', $q) !== 1;

        if (! $estNumero && ! $estTexte) {
            return []; // « 1 000 », « 12,5 » : ni numéro ni texte → aucune ligne plutôt que toutes
        }

        $requete->where(function ($r) use ($q, $estNumero, $estTexte, $m) {
            if ($estNumero) {
                $nombre = (int) $m[1];
                $r->where('numero', $nombre);
                if (! str_starts_with(mb_strtolower($q), 'v')) {
                    $r->orWhere('montant_xof', $nombre);
                }
            }

            if ($estTexte) {
                $r->orWhereRaw('f_unaccent(note) ILIKE f_unaccent(?)', ['%'.self::echapperLike($q).'%'])
                    ->orWhereRaw('word_similarity(f_unaccent(?), f_unaccent(note)) >= ?', [$q, self::SEUIL]);
            }
        });

        $ventes = $requete
            ->selectRaw('ventes.*, COALESCE(word_similarity(f_unaccent(?), f_unaccent(note)), 0) AS score_note', [$q])
            ->orderByDesc('score_note')->orderByDesc('created_at')
            ->limit($limite)
            ->get();

        return $ventes->map(fn (Vente $v) => [
            'titre' => $v->numeroAffiche().' · '.number_format((int) $v->montant_xof, 0, ',', ' ').' FCFA',
            'sous_titre' => trim(implode(' · ', array_filter([$v->note, self::libelleStatut($v->statut), $v->created_at?->setTimezone($this->fuseau())->format('d/m/Y H:i')]))) ?: null,
            'url' => '/ventes?vente='.$v->ulid,
            'score' => round($v->note !== null && (float) $v->score_note > 0 ? (float) $v->score_note : 1.0, 2),
        ])->all();
    }

    /** Articles : nom (trigramme, sans accent), référence (SKU), catégorie, ou prix exact (« 1500 », « 1 500 »). */
    private function articles(string $q, int $limite): array
    {
        $motif = '%'.self::echapperLike($q).'%';
        $prix = preg_match('/^\d{1,3}(?:[\s.]?\d{3})*$/', $q) === 1 ? (int) preg_replace('/\D+/', '', $q) : null;
        $pictos = Pictogrammes::correspondants($q);

        $articles = Article::query()
            ->where(function ($r) use ($q, $motif, $prix, $pictos) {
                $r->whereRaw('f_unaccent(nom) ILIKE f_unaccent(?)', [$motif])
                    ->orWhereRaw('word_similarity(f_unaccent(?), f_unaccent(nom)) >= ?', [$q, self::SEUIL])
                    ->orWhereRaw('sku ILIKE ?', [$motif])
                    ->orWhereRaw('f_unaccent(COALESCE(categorie, \'\')) ILIKE f_unaccent(?)', [$motif]);
                if ($prix !== null && $prix <= 50_000_000) {
                    $r->orWhere('prix_xof', $prix);
                }
                // Article sans nom écrit : retrouvé par le libellé de son pictogramme (« pain », « riz »…).
                if ($pictos !== []) {
                    $r->orWhereIn('pictogramme', $pictos);
                }
            })
            ->selectRaw('articles.*, GREATEST(word_similarity(f_unaccent(?), f_unaccent(COALESCE(nom, \'\'))), CASE WHEN sku ILIKE ? THEN 0.9 ELSE 0 END, CASE WHEN prix_xof = ? THEN 0.8 ELSE 0 END, CASE WHEN pictogramme = ANY(?::text[]) THEN 0.7 ELSE 0 END) AS score', [$q, $motif, $prix ?? -1, '{'.implode(',', $pictos).'}'])
            ->orderByDesc('score')->orderBy('nom')
            ->limit($limite)
            ->get();

        return $articles->map(fn (Article $a) => [
            'titre' => $a->libelle(),
            'sous_titre' => trim(implode(' · ', array_filter([number_format((int) $a->prix_xof, 0, ',', ' ').' FCFA', $a->categorie, $a->sku ? 'Réf. '.$a->sku : null, $a->actif ? null : 'inactif']))),
            'url' => '/articles?article='.$a->ulid,
            'score' => round((float) $a->score, 2),
        ])->all();
    }

    /** Équipe (propriétaire / gérant) : nom ou contact. */
    private function equipe(string $q, int $limite): array
    {
        $motif = '%'.self::echapperLike($q).'%';
        $chiffres = preg_replace('/\D+/', '', $q) ?? '';

        $membres = Membre::query()
            ->join('users', 'users.id', '=', 'membres.user_id')
            ->where(function ($r) use ($q, $motif, $chiffres) {
                $r->whereRaw('f_unaccent(users.nom) ILIKE f_unaccent(?)', [$motif])
                    ->orWhereRaw('word_similarity(f_unaccent(?), f_unaccent(users.nom)) >= ?', [$q, self::SEUIL])
                    ->orWhereRaw('users.email ILIKE ?', [$motif]);
                // Téléphone : seulement si le terme contient au moins 3 chiffres (sinon « %% » trouverait tout le monde).
                if (strlen($chiffres) >= 3) {
                    $r->orWhere('users.telephone', 'like', '%'.$chiffres.'%');
                }
            })
            ->selectRaw('membres.ulid, membres.role, membres.actif, users.nom, users.email, users.telephone, word_similarity(f_unaccent(?), f_unaccent(users.nom)) AS score', [$q])
            ->orderByDesc('score')->orderBy('users.nom')
            ->limit($limite)
            ->get();

        return $membres->map(fn ($m) => [
            'titre' => $m->nom,
            'sous_titre' => trim(implode(' · ', array_filter([self::libelleRole($m->role), $m->email ?? $m->telephone, $m->actif ? null : 'désactivé']))),
            'url' => '/equipe',
            'score' => round((float) $m->score, 2),
        ])->all();
    }

    /** Pages statiques (caisse, portefeuille, réglages, PayTech, thème…) selon le rôle, FR/EN, tolérance aux fautes. */
    private function pages(string $q, Membre $acteur, string $locale, int $limite): array
    {
        $terme = self::normaliser($q);
        if (mb_strlen($terme) < 2) {
            return [];
        }

        $resultats = [];

        foreach ((array) config('satspoint.recherche.pages', []) as $page) {
            if (! in_array($acteur->role, $page['roles'], true)) {
                continue;
            }

            $candidats = array_merge([$page['fr'], $page['en']], $page['mots']);
            $score = 0.0;

            foreach ($candidats as $candidat) {
                $score = max($score, self::similarite($terme, self::normaliser($candidat)));
            }

            if ($score >= 0.6) {
                $resultats[] = [
                    'titre' => $locale === 'en' ? $page['en'] : $page['fr'],
                    'sous_titre' => $locale === 'en' ? $page['fr'] : $page['en'],
                    'url' => $page['url'],
                    'score' => round($score, 2),
                ];
            }
        }

        usort($resultats, fn ($a, $b) => $b['score'] <=> $a['score']);

        return array_slice($resultats, 0, $limite);
    }

    // ------------------------------------------------------------ récentes

    /** Mémorise un terme sélectionné (4 derniers par utilisateur, sans doublon). */
    public function memoriser(User $utilisateur, string $terme): void
    {
        $terme = mb_substr(Str::squish($terme), 0, 120);
        $max = (int) config('satspoint.recherche.recentes_max', 4);

        DB::transaction(function () use ($utilisateur, $terme, $max) {
            RechercheRecente::query()->where('user_id', $utilisateur->id)->whereRaw('LOWER(terme) = ?', [mb_strtolower($terme)])->delete();
            RechercheRecente::create(['user_id' => $utilisateur->id, 'terme' => $terme]);

            $aSupprimer = RechercheRecente::query()->where('user_id', $utilisateur->id)
                ->orderByDesc('created_at')->orderByDesc('id')->skip($max)->take(50)->pluck('id');
            if ($aSupprimer->isNotEmpty()) {
                RechercheRecente::query()->whereIn('id', $aSupprimer)->delete();
            }
        });
    }

    /** @return list<string> */
    public function recentes(User $utilisateur): array
    {
        return RechercheRecente::query()->where('user_id', $utilisateur->id)
            ->orderByDesc('created_at')->orderByDesc('id')
            ->limit((int) config('satspoint.recherche.recentes_max', 4))
            ->pluck('terme')->all();
    }

    public function effacerRecentes(User $utilisateur): void
    {
        RechercheRecente::query()->where('user_id', $utilisateur->id)->delete();
    }

    // ------------------------------------------------------------ outils

    /** Similarité 0..1 entre deux chaînes normalisées : sous-chaîne, préfixe, similar_text, Levenshtein. */
    public static function similarite(string $terme, string $candidat): float
    {
        if ($terme === '' || $candidat === '') {
            return 0.0;
        }
        if ($terme === $candidat) {
            return 1.0;
        }
        if (str_contains($candidat, $terme)) {
            return 0.85 + 0.15 * min(1, mb_strlen($terme) / mb_strlen($candidat));
        }

        // Chaque mot du candidat est comparé au terme (« portfeuille » ≈ « portefeuille »).
        $meilleur = 0.0;
        foreach (array_merge([$candidat], explode(' ', $candidat)) as $mot) {
            if ($mot === '') {
                continue;
            }
            similar_text($terme, $mot, $pct);
            $distance = levenshtein($terme, $mot);
            $tolerance = mb_strlen($terme) >= 7 ? 2 : 1;
            $score = max($pct / 100, $distance <= $tolerance ? 0.8 : 0.0);
            if (str_starts_with($mot, $terme)) {
                $score = max($score, 0.8);
            }
            $meilleur = max($meilleur, $score);
        }

        return $meilleur;
    }

    public static function normaliser(string $texte): string
    {
        $texte = Str::ascii(mb_strtolower($texte));

        return Str::squish(preg_replace('/[^a-z0-9]+/', ' ', $texte) ?? '');
    }

    private static function echapperLike(string $q): string
    {
        return addcslashes($q, '%_\\');
    }

    private function fuseau(): string
    {
        return $this->courante->obtenir()?->fuseau ?: config('satspoint.boutique.fuseau');
    }

    private static function libelleStatut(string $statut): string
    {
        return match ($statut) {
            Vente::STATUT_PAYEE => 'payée',
            Vente::STATUT_ANNULEE => 'annulée',
            Vente::STATUT_EXPIREE => 'expirée',
            default => 'en attente',
        };
    }

    private static function libelleRole(string $role): string
    {
        return match ($role) {
            Membre::ROLE_PROPRIETAIRE => 'propriétaire',
            Membre::ROLE_GERANT => 'gérant',
            default => 'caissier',
        };
    }
}

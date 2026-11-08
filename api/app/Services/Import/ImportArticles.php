<?php

namespace App\Services\Import;

use App\Exceptions\ErreurMetier;
use App\Facades\Audit;
use App\Jobs\ExecuterImport;
use App\Models\Article;
use App\Models\Boutique;
use App\Models\Import;
use App\Models\User;
use App\Services\Diffuseur;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Import d'articles (CAHIER § 6.15) : analyse (colonnes, aperçu, suggestions), exécution en file
 * (progression temps réel « imports »), rapport (≤ 100 erreurs), correspondance mémorisée par boutique.
 */
class ImportArticles
{
    private const APERCU = 10;

    public function __construct(
        private readonly LecteurTableau $lecteur,
        private readonly SuggestionsColonnes $suggestions,
        private readonly Diffuseur $diffuseur,
    ) {}

    /** Dépose + analyse le fichier : l'enregistrement Import est créé en statut « analyse ». */
    public function analyser(UploadedFile $fichier, User $auteur): Import
    {
        $format = LecteurTableau::formatReel($fichier->getRealPath());
        $lecture = $this->lecteur->lire($fichier->getRealPath(), $format, (int) config('satspoint.import.lignes_max'));

        if (count($lecture['lignes']) < 2) {
            throw new ErreurMetier('IMPORT_VIDE', 'Le fichier doit contenir une ligne d\'en-tête et au moins une ligne de données.', 422);
        }

        $colonnes = $this->entetes($lecture['lignes'][0]);
        $apercu = array_map(fn (array $l) => $this->ajusterLargeur($l, count($colonnes)), array_slice($lecture['lignes'], 1, self::APERCU));

        $import = DB::transaction(function () use ($fichier, $auteur, $format, $lecture, $colonnes, $apercu) {
            $import = Import::create([
                'user_id' => $auteur->id,
                'type' => Import::TYPE_ARTICLES,
                'fichier' => '',
                'nom_fichier' => mb_substr((string) $fichier->getClientOriginalName(), 0, 120),
                'statut' => Import::STATUT_ANALYSE,
                'analyse' => [
                    'format' => $format,
                    'encodage' => $lecture['encodage'],
                    'separateur' => $lecture['separateur'],
                    'colonnes' => $colonnes,
                    'apercu' => $apercu,
                    'suggestions' => $this->suggestions->suggerer($colonnes),
                    'total' => count($lecture['lignes']) - 1,
                ],
            ]);

            $chemin = sprintf('%s/%s.%s', config('satspoint.import.dossier'), $import->ulid, $format);
            Storage::disk('local')->putFileAs(dirname($chemin), $fichier, basename($chemin));
            $import->forceFill(['fichier' => $chemin])->save();

            return $import;
        });

        // Correspondance mémorisée : celle du dernier import exécuté de la boutique, pour les colonnes identiques.
        $precedente = Import::query()->whereKeyNot($import->id)->whereNotNull('correspondance')
            ->whereIn('statut', [Import::STATUT_TERMINE, Import::STATUT_ECHOUE, Import::STATUT_EN_COURS])
            ->orderByDesc('id')->value('correspondance');

        if (is_array($precedente)) {
            $memorisee = [];
            foreach ($colonnes as $colonne) {
                if (array_key_exists($colonne, $precedente)) {
                    $memorisee[$colonne] = $precedente[$colonne];
                }
            }

            if ($memorisee !== []) {
                // La correspondance choisie la dernière fois l'emporte sur les suggestions automatiques
                // (un champ déjà pris par une colonne mémorisée est retiré des autres suggestions).
                $analyse = $import->analyse;
                $suggestions = (array) $analyse['suggestions'];
                foreach ($suggestions as $colonne => $champ) {
                    if (! array_key_exists($colonne, $memorisee) && $champ !== null && in_array($champ, $memorisee, true)) {
                        $suggestions[$colonne] = null;
                    }
                }
                $analyse['suggestions'] = array_replace($suggestions, $memorisee);
                $analyse['memorisee'] = $memorisee;
                $import->forceFill(['analyse' => $analyse])->save();
            }
        }

        return $import;
    }

    /**
     * Valide la correspondance et lance l'exécution en file.
     *
     * @param  array<string, string>  $correspondance  colonne → champ
     */
    public function executer(Import $import, array $correspondance, string $mode, User $auteur): Import
    {
        if ($import->statut !== Import::STATUT_ANALYSE) {
            throw new ErreurMetier('IMPORT_DEJA_EXECUTE', 'Cet import a déjà été lancé.', 409);
        }

        $colonnes = (array) ($import->analyse['colonnes'] ?? []);
        $champs = (array) config('satspoint.import.champs');
        $propre = [];

        foreach ($correspondance as $colonne => $champ) {
            if (blank($champ)) {
                continue;
            }
            if (! in_array($colonne, $colonnes, true)) {
                throw new ErreurMetier('CORRESPONDANCE_INVALIDE', "La colonne « {$colonne} » n'existe pas dans le fichier.", 422);
            }
            if (! in_array($champ, $champs, true)) {
                throw new ErreurMetier('CORRESPONDANCE_INVALIDE', "Le champ « {$champ} » est inconnu.", 422);
            }
            if (in_array($champ, $propre, true)) {
                throw new ErreurMetier('CORRESPONDANCE_INVALIDE', "Le champ « {$champ} » est associé à deux colonnes.", 422);
            }
            $propre[$colonne] = $champ;
        }

        foreach (['nom', 'prix_xof'] as $obligatoire) {
            if (! in_array($obligatoire, $propre, true)) {
                throw new ErreurMetier('CORRESPONDANCE_INVALIDE', 'Les champs « nom » et « prix_xof » doivent être associés à une colonne.', 422);
            }
        }

        $import->fill([
            'correspondance' => $propre,
            'mode' => $mode,
            'statut' => Import::STATUT_EN_COURS,
            'rapport' => ['total' => (int) ($import->analyse['total'] ?? 0), 'traitees' => 0, 'creees' => 0, 'mises_a_jour' => 0, 'erreurs' => []],
        ])->save();

        ExecuterImport::dispatch($import->id);

        Audit::enregistrer('import.execute', $import, ['mode' => $mode, 'total' => $import->rapport['total'], 'champs' => array_values($propre)], $auteur);

        return $import->refresh();
    }

    /**
     * Traitement réel (appelé par le job, boutique courante fixée). Transactionnel sauf en mode « ignorer_erreurs ».
     */
    public function traiter(Import $import, Boutique $boutique): void
    {
        $import = Import::query()->whereKey($import->id)->firstOrFail();

        if ($import->statut !== Import::STATUT_EN_COURS) {
            return;
        }

        $chemin = Storage::disk('local')->path($import->fichier);
        $rapport = $import->rapportComplet();
        $rapport['lignes_en_erreur'] = 0;
        $maxErreurs = (int) config('satspoint.import.erreurs_max');
        $tolerant = $import->mode === Import::MODE_IGNORER_ERREURS;

        try {
            $lecture = $this->lecteur->lire($chemin, (string) ($import->analyse['format'] ?? 'csv'), (int) config('satspoint.import.lignes_max'));
            $colonnes = $this->entetes($lecture['lignes'][0] ?? []);
            $index = array_flip($colonnes);
            $correspondance = (array) $import->correspondance;
            $lignes = array_slice($lecture['lignes'], 1);
            $rapport['total'] = count($lignes);

            $executer = function () use ($lignes, $index, $correspondance, $import, $boutique, $tolerant, $maxErreurs, &$rapport) {
                $position = (int) Article::query()->max('position');

                foreach ($lignes as $i => $ligne) {
                    $numero = $i + 2; // ligne 1 = en-têtes
                    $valeurs = [];
                    foreach ($correspondance as $colonne => $champ) {
                        $valeurs[$champ] = $ligne[$index[$colonne] ?? -1] ?? '';
                    }

                    try {
                        $donnees = $this->normaliserLigne($valeurs);
                        $resultat = $this->appliquer($donnees, $import->mode, $position);
                        $rapport[$resultat]++;
                    } catch (ErreurMetier $e) {
                        $rapport['lignes_en_erreur']++;
                        if (count($rapport['erreurs']) < $maxErreurs) {
                            $rapport['erreurs'][] = ['ligne' => $numero, 'message' => $e->getMessage()];
                        }
                    }

                    $rapport['traitees']++;

                    // Progression : en mode tolérant seulement (en mode strict, l'écriture est dans la transaction
                    // et ne serait pas visible avant la fin ; le front affiche alors une progression indéterminée).
                    if ($tolerant && $rapport['traitees'] % 50 === 0) {
                        $import->forceFill(['rapport' => $rapport])->save();
                        $this->diffuseur->rubrique($boutique, 'imports');
                    }
                }

                // Mode strict : au moins une ligne fautive → tout est annulé, le rapport liste toutes les erreurs (≤ 100).
                if (! $tolerant && $rapport['lignes_en_erreur'] > 0) {
                    throw new ErreurMetier('IMPORT_ANNULE', 'Des lignes sont en erreur : rien n\'a été importé.', 422);
                }
            };

            if ($tolerant) {
                $executer();
            } else {
                DB::transaction($executer);
            }

            $import->forceFill(['statut' => Import::STATUT_TERMINE, 'rapport' => $rapport])->save();
        } catch (ErreurMetier $e) {
            // Mode strict : rien n'a été écrit (transaction annulée), les compteurs reflètent la ligne fautive.
            $rapport['creees'] = 0;
            $rapport['mises_a_jour'] = 0;
            if ($rapport['erreurs'] === []) {
                $rapport['erreurs'][] = ['ligne' => 0, 'message' => $e->getMessage()];
            }
            $import->forceFill(['statut' => Import::STATUT_ECHOUE, 'rapport' => $rapport])->save();
        } catch (\Throwable $e) {
            $rapport['erreurs'] = [['ligne' => 0, 'message' => 'Le fichier n\'a pas pu être traité.']];
            $import->forceFill(['statut' => Import::STATUT_ECHOUE, 'rapport' => $rapport])->save();
            Log::warning('import: échec', ['import_id' => $import->id, 'erreur' => $e::class]);
        } finally {
            Storage::disk('local')->delete($import->fichier);
        }

        $this->diffuseur->rubrique($boutique, 'imports');
        $this->diffuseur->rubrique($boutique, 'articles');
    }

    // ------------------------------------------------------------------

    /**
     * @return array{nom: string, prix_xof: int, categorie: ?string, sku: ?string, couleur: ?string, actif: ?bool}
     */
    public function normaliserLigne(array $v): array
    {
        $nom = trim((string) ($v['nom'] ?? ''));
        if ($nom === '' || mb_strlen($nom) > 120) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Nom manquant ou trop long (120 caractères maximum).', 422);
        }

        $prixBrut = preg_replace('/[^\d,.\-]/u', '', str_replace(["\u{202F}", "\u{00A0}", ' '], '', (string) ($v['prix_xof'] ?? '')));
        $prixBrut = str_replace(',', '.', (string) $prixBrut);
        if ($prixBrut === '' || ! is_numeric($prixBrut)) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Prix manquant ou non numérique.', 422);
        }
        $prix = (int) round((float) $prixBrut);
        if ($prix < 0 || $prix > 50_000_000) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Prix hors bornes (0 à 50 000 000 FCFA).', 422);
        }

        $categorie = trim((string) ($v['categorie'] ?? ''));
        if (mb_strlen($categorie) > 60) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Catégorie trop longue (60 caractères maximum).', 422);
        }

        $sku = trim((string) ($v['sku'] ?? ''));
        if ($sku !== '' && (strlen($sku) > 40 || preg_match('/^[A-Za-z0-9._-]+$/', $sku) !== 1)) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Référence invalide (lettres, chiffres, . _ - ; 40 caractères maximum).', 422);
        }

        $couleur = strtoupper(trim((string) ($v['couleur'] ?? '')));
        if ($couleur !== '' && preg_match('/^#?[0-9A-F]{6}$/', $couleur) !== 1) {
            throw new ErreurMetier('LIGNE_INVALIDE', 'Couleur invalide (format #RRGGBB).', 422);
        }
        if ($couleur !== '' && $couleur[0] !== '#') {
            $couleur = '#'.$couleur;
        }

        $actif = null;
        if (array_key_exists('actif', $v) && trim((string) $v['actif']) !== '') {
            $actif = self::booleen((string) $v['actif']);
            if ($actif === null) {
                throw new ErreurMetier('LIGNE_INVALIDE', 'Valeur « actif » non reconnue (oui/non, 1/0, true/false).', 422);
            }
        }

        return ['nom' => $nom, 'prix_xof' => $prix, 'categorie' => $categorie ?: null, 'sku' => $sku ?: null, 'couleur' => $couleur ?: null, 'actif' => $actif];
    }

    /** Crée ou met à jour selon le mode ; renvoie « creees » ou « mises_a_jour ». */
    private function appliquer(array $donnees, string $mode, int &$position): string
    {
        $existant = null;
        if ($donnees['sku'] !== null) {
            $existant = Article::query()->where('sku', $donnees['sku'])->first();
        }
        $existant ??= Article::query()->whereRaw('LOWER(nom) = ?', [mb_strtolower($donnees['nom'])])->first();

        if ($existant !== null) {
            if ($mode === Import::MODE_CREER) {
                throw new ErreurMetier('LIGNE_EXISTANTE', sprintf('« %s » existe déjà (même nom ou même référence).', $donnees['nom']), 422);
            }

            $existant->fill(array_filter([
                'nom' => $donnees['nom'],
                'prix_xof' => $donnees['prix_xof'],
                'categorie' => $donnees['categorie'],
                'sku' => $donnees['sku'] ?? $existant->sku,
                'couleur' => $donnees['couleur'] ?? $existant->couleur,
                'actif' => $donnees['actif'] ?? $existant->actif,
            ], fn ($valeur) => $valeur !== null))->save();

            return 'mises_a_jour';
        }

        $position++;
        Article::create([
            'nom' => $donnees['nom'],
            'prix_xof' => $donnees['prix_xof'],
            'categorie' => $donnees['categorie'],
            'sku' => $donnees['sku'],
            'couleur' => $donnees['couleur'],
            'actif' => $donnees['actif'] ?? true,
            'position' => $position,
        ]);

        return 'creees';
    }

    public static function booleen(string $valeur): ?bool
    {
        $v = mb_strtolower(trim($valeur));

        return match (true) {
            in_array($v, ['1', 'oui', 'o', 'yes', 'y', 'true', 'vrai', 'actif', 'active', 'x', 'ok', 'disponible'], true) => true,
            in_array($v, ['0', 'non', 'n', 'no', 'false', 'faux', 'inactif', 'inactive', 'indisponible', ''], true) => false,
            default => null,
        };
    }

    /** En-têtes nettoyés, dédoublonnés, jamais vides. */
    private function entetes(array $ligne): array
    {
        $colonnes = [];
        foreach (array_values($ligne) as $i => $brut) {
            $nom = mb_substr(trim((string) $brut), 0, 60) ?: 'Colonne '.($i + 1);
            $base = $nom;
            $n = 2;
            while (in_array($nom, $colonnes, true)) {
                $nom = $base.' ('.$n++.')';
            }
            $colonnes[] = $nom;
        }

        return $colonnes;
    }

    private function ajusterLargeur(array $ligne, int $largeur): array
    {
        $ligne = array_slice(array_values($ligne), 0, $largeur);

        return array_pad(array_map(fn ($v) => mb_substr((string) $v, 0, 200), $ligne), $largeur, '');
    }
}

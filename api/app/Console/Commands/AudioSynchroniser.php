<?php

namespace App\Console\Commands;

use App\Models\CleAudio;
use App\Models\Langue;
use App\Services\Diffuseur;
use Database\Seeders\CleAudioSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * audio:synchroniser {chemin?} — registre des clés vocales (CAHIER § 6.12 « source unique des clés »).
 *
 * Lit le fichier produit par le front (`[{ cle, ecran, contexte, texte_fr, texte_en, essentielle }]`),
 * met à jour `cles_audio` (ordre = position dans le fichier, presente_dans_code = true) et marque
 * `presente_dans_code = false` les clés disparues du code, sans jamais les supprimer (leurs audios restent).
 * Les ~30 clés essentielles du parcours d'encaissement restent marquées essentielles quoi qu'il arrive.
 */
class AudioSynchroniser extends Command
{
    protected $signature = 'audio:synchroniser {chemin? : Fichier JSON des clés (défaut : config satspoint.audio.fichier_cles)} {--sans-signal : N\'émet pas le signal temps réel « audio » (canal admin)}';

    protected $description = 'Synchronise le registre des clés vocales depuis le fichier produit par le front';

    public function handle(Diffuseur $diffuseur): int
    {
        $chemin = (string) ($this->argument('chemin') ?: config('satspoint.audio.fichier_cles'));

        if (! is_file($chemin) || ! is_readable($chemin)) {
            $this->warn("[audio] fichier introuvable : {$chemin} — registre inchangé (jeu essentiel seedé si besoin).");
            $this->call('db:seed', ['--class' => CleAudioSeeder::class, '--force' => true]);

            return self::SUCCESS;
        }

        $contenu = json_decode((string) file_get_contents($chemin), true);

        if (! is_array($contenu) || ! array_is_list($contenu)) {
            $this->error('[audio] fichier JSON invalide : rien n\'a été modifié.');

            return self::FAILURE;
        }

        // Garde-fou : un fichier vide (build cassé) ne doit pas marquer tout le registre « retiré du code ».
        if ($contenu === []) {
            $this->error('[audio] fichier vide : rien n\'a été modifié.');

            return self::FAILURE;
        }

        $resultat = $this->synchroniser($contenu);

        $this->info(sprintf(
            '[audio] %d clés dans le fichier : %d créées, %d mises à jour, %d retirées du code, %d ignorées (forme invalide).',
            $resultat['lues'], $resultat['creees'], $resultat['modifiees'], $resultat['retirees'], $resultat['ignorees'],
        ));

        if (! $this->option('sans-signal') && ($resultat['creees'] + $resultat['modifiees'] + $resultat['retirees']) > 0) {
            $diffuseur->admin('audio');
        }

        return self::SUCCESS;
    }

    /**
     * @param  list<array<string, mixed>>  $entrees
     * @return array{lues: int, creees: int, modifiees: int, retirees: int, ignorees: int}
     */
    public function synchroniser(array $entrees): array
    {
        $essentielles = array_column(CleAudioSeeder::essentielles(), 'cle');
        $stats = ['lues' => count($entrees), 'creees' => 0, 'modifiees' => 0, 'retirees' => 0, 'ignorees' => 0];

        DB::transaction(function () use ($entrees, $essentielles, &$stats) {
            $existantes = CleAudio::query()->get()->keyBy('cle');
            $vues = [];
            $ordre = 0;

            foreach ($entrees as $entree) {
                $cle = is_array($entree) ? trim((string) ($entree['cle'] ?? '')) : '';

                if ($cle === '' || ! CleAudio::estValide($cle) || isset($vues[$cle])) {
                    $stats['ignorees']++;

                    continue;
                }

                $ordre++;
                $vues[$cle] = true;

                $donnees = [
                    'ecran' => mb_substr(trim((string) ($entree['ecran'] ?? strtok($cle, '.'))), 0, 60) ?: 'commun',
                    'contexte' => filled($entree['contexte'] ?? null) ? mb_substr(trim((string) $entree['contexte']), 0, 200) : null,
                    'texte_fr' => mb_substr(trim((string) ($entree['texte_fr'] ?? $cle)), 0, 300) ?: $cle,
                    'texte_en' => mb_substr(trim((string) ($entree['texte_en'] ?? $entree['texte_fr'] ?? $cle)), 0, 300) ?: $cle,
                    'essentielle' => (bool) ($entree['essentielle'] ?? false) || in_array($cle, $essentielles, true),
                    'ordre' => $ordre,
                    'presente_dans_code' => true,
                ];

                /** @var CleAudio|null $existante */
                $existante = $existantes->get($cle);

                if ($existante === null) {
                    CleAudio::create(['cle' => $cle] + $donnees);
                    $stats['creees']++;

                    continue;
                }

                $existante->fill($donnees);

                if ($existante->isDirty()) {
                    $existante->save();
                    $stats['modifiees']++;
                }
            }

            // Noms des langues du catalogue (`langue.{code}`) : ajoutés par la console, absents du code du front
            // pour les langues créées après coup — jamais retirés tant que la langue existe (CONTRAT_API § 14.5).
            $clesLangues = array_map(fn (string $code) => 'langue.'.$code, Langue::query()->pluck('code')->all());

            // Clés disparues du code : conservées (avec leurs audios) mais signalées.
            foreach ($existantes as $cle => $existante) {
                if (! isset($vues[$cle]) && $existante->presente_dans_code && ! in_array($cle, $clesLangues, true)) {
                    $existante->forceFill(['presente_dans_code' => false])->save();
                    $stats['retirees']++;
                }
            }
        });

        return $stats;
    }
}

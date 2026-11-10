<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\V1\ManifesteAudioController;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Tests de bout en bout (Playwright) — environnement LOCAL uniquement.
 *
 * Supprime toutes les données créées par les tests (préfixe `TEST-E2E-`) : boutiques et tout ce qui en dépend
 * (cascade : membres, invitations, ventes, paiements, articles, imports, portefeuille, PayTech…), comptes de test,
 * sessions, recherches, audios déposés par un super-admin de test, entrées du journal qui les concernent.
 * Affiche ce qui reste (doit être zéro).
 */
class E2eNettoyer extends Command
{
    protected $signature = 'e2e:nettoyer {prefixe=TEST-E2E- : préfixe des données à supprimer}';

    protected $description = '[local] Supprime les données des tests e2e (TEST-E2E-…) et vérifie qu\'il n\'en reste aucune.';

    public function handle(): int
    {
        if (! app()->environment('local', 'testing')) {
            $this->error('Commande réservée à APP_ENV=local.');

            return self::FAILURE;
        }

        $prefixe = (string) $this->argument('prefixe');
        if (! str_starts_with($prefixe, 'TEST-E2E-')) {
            $this->error('Le préfixe doit commencer par TEST-E2E-.');

            return self::FAILURE;
        }
        $motif = str_replace(['%', '_'], ['\%', '\_'], $prefixe).'%';
        $motifEmail = str_replace(['%', '_'], ['\%', '\_'], strtolower($prefixe)).'%';

        $bilan = DB::transaction(function () use ($motif, $motifEmail) {
            $boutiques = DB::table('boutiques')->where('nom', 'like', $motif)->pluck('id');
            $users = DB::table('users')
                ->where(fn ($q) => $q->where('nom', 'like', $motif)->orWhere('email', 'like', $motifEmail))
                // Jamais le super-admin réel (et `NOT IN` exclurait à tort les comptes sans e-mail).
                ->where(fn ($q) => $q->whereNull('email')->orWhereNotIn('email', array_filter([strtolower((string) config('satspoint.superadmin.email'))])))
                ->pluck('id');

            $audios = DB::table('audios')->whereIn('enregistre_par', $users)->count();
            DB::table('audios')->whereIn('enregistre_par', $users)->delete();
            DB::table('journal_audit')->where(fn ($q) => $q->whereIn('boutique_id', $boutiques)->orWhereIn('user_id', $users))->delete();
            DB::table('sessions')->whereIn('user_id', $users)->delete();
            DB::table('recherches_recentes')->whereIn('user_id', $users)->delete();
            // Ventes de test faites dans une boutique réelle (ex. facture Lightning réelle annulée sur la démo) : note préfixée.
            $ventes = DB::table('ventes')->where('note', 'like', $motif)->whereNotIn('boutique_id', $boutiques)->delete();
            $nbBoutiques = DB::table('boutiques')->whereIn('id', $boutiques)->delete();
            $nbUsers = DB::table('users')->whereIn('id', $users)->delete();
            // Moyens de paiement de test créés à la console (CONTRAT_API § 14.2) : leurs activations d'abord.
            $moyens = DB::table('moyens_paiement')->where('nom', 'like', $motif)->pluck('id');
            DB::table('moyens_paiement_boutique')->whereIn('moyen_paiement_id', $moyens)->delete();
            $nbMoyens = DB::table('moyens_paiement')->whereIn('id', $moyens)->delete();

            return ['boutiques' => $nbBoutiques, 'comptes' => $nbUsers, 'audios' => $audios, 'ventes' => $ventes, 'moyens' => $nbMoyens];
        });

        if ($bilan['moyens'] > 0) {
            \App\Services\Catalogue::invalider();
        }

        if ($bilan['audios'] > 0) {
            ManifesteAudioController::invaliderCache();
        }

        $restant = DB::table('boutiques')->where('nom', 'like', $motif)->count()
            + DB::table('users')->where('nom', 'like', $motif)->count()
            + DB::table('ventes')->where('note', 'like', $motif)->count()
            + DB::table('articles')->where('nom', 'like', $motif)->count();

        $this->line(json_encode($bilan + ['restant' => $restant]));

        return $restant === 0 ? self::SUCCESS : self::FAILURE;
    }
}

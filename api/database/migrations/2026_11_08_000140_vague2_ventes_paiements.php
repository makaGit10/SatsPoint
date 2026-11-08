<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Vague 2 — caisse, paiements, cours.
 *
 * - `sequences_vente` : numérotation par boutique dans une table dédiée (l'incrément n'émet plus « parametres »).
 * - `paiements.simule` / `paiements.paytech_redirect_url` : mode démo et lien de paiement PayTech.
 * - `ventes.recu_jeton` en varchar (32 caractères aléatoires, jamais complété par des espaces comme un char).
 * - `cours_change.nb_sources` : nombre de sources retenues pour la médiane.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sequences_vente', function (Blueprint $table) {
            $table->foreignId('boutique_id')->primary()->constrained('boutiques')->cascadeOnDelete();
            $table->unsignedBigInteger('dernier_numero')->default(0);
            $table->timestamp('updated_at')->nullable();
        });

        // Reprise des séquences existantes puis suppression de la colonne sur boutiques.
        if (Schema::hasColumn('boutiques', 'sequence_vente')) {
            DB::statement('INSERT INTO sequences_vente (boutique_id, dernier_numero, updated_at) SELECT id, sequence_vente, now() FROM boutiques WHERE sequence_vente > 0');
            Schema::table('boutiques', fn (Blueprint $table) => $table->dropColumn('sequence_vente'));
        }

        Schema::table('paiements', function (Blueprint $table) {
            $table->boolean('simule')->default(false)->after('operateur');
            $table->string('paytech_redirect_url', 500)->nullable()->after('paytech_ref');
        });

        Schema::table('ventes', function (Blueprint $table) {
            $table->string('recu_jeton', 64)->nullable()->change();
        });

        Schema::table('cours_change', function (Blueprint $table) {
            $table->unsignedSmallInteger('nb_sources')->default(0)->after('btc_xof');
            $table->index(['source', 'recupere_at']);
        });
    }

    public function down(): void
    {
        Schema::table('cours_change', function (Blueprint $table) {
            $table->dropIndex(['source', 'recupere_at']);
            $table->dropColumn('nb_sources');
        });
        Schema::table('ventes', fn (Blueprint $table) => $table->char('recu_jeton', 64)->nullable()->change());
        Schema::table('paiements', fn (Blueprint $table) => $table->dropColumn(['simule', 'paytech_redirect_url']));
        Schema::table('boutiques', fn (Blueprint $table) => $table->unsignedBigInteger('sequence_vente')->default(0));
        DB::statement('UPDATE boutiques b SET sequence_vente = s.dernier_numero FROM sequences_vente s WHERE s.boutique_id = b.id');
        Schema::dropIfExists('sequences_vente');
    }
};

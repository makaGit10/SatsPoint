<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('paiements', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('vente_id')->constrained('ventes')->cascadeOnDelete();
            $table->string('methode', 20);
            $table->string('statut', 20)->default('en_attente');
            $table->unsignedBigInteger('montant_xof');
            $table->unsignedBigInteger('montant_sats')->nullable();
            $table->decimal('cours_xof_par_btc', 18, 2)->nullable();
            $table->text('bolt11')->nullable();
            $table->char('payment_hash', 64)->nullable()->unique();
            $table->char('preimage', 64)->nullable();
            $table->timestamp('expire_at')->nullable();
            $table->string('paytech_token', 190)->nullable();
            $table->string('paytech_ref', 120)->nullable()->unique();
            $table->string('operateur', 20)->nullable();
            $table->foreignId('confirme_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirme_at')->nullable();
            $table->timestamp('regle_at')->nullable();
            $table->timestamps();

            $table->index(['vente_id', 'statut']);
            $table->index(['statut', 'expire_at']);
            $table->index(['boutique_id', 'created_at']);
        });

        Schema::table('ventes', function (Blueprint $table) {
            $table->foreign('paiement_reussi_id')->references('id')->on('paiements')->nullOnDelete();
        });

        Schema::create('evenements_paiement', function (Blueprint $table) {
            $table->id();
            $table->foreignId('paiement_id')->constrained('paiements')->cascadeOnDelete();
            $table->string('source', 20);
            $table->string('type', 40);
            $table->char('empreinte_payload', 64);
            $table->timestamp('recu_at');
            $table->timestamp('created_at')->nullable();

            $table->unique(['source', 'empreinte_payload']);
            $table->index('paiement_id');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE paiements ADD CONSTRAINT paiements_methode_check CHECK (methode IN ('lightning', 'paytech', 'wave_manuel'))");
            DB::statement("ALTER TABLE paiements ADD CONSTRAINT paiements_statut_check CHECK (statut IN ('en_attente', 'reussi', 'expire', 'echoue', 'annule'))");
            DB::statement("ALTER TABLE paiements ADD CONSTRAINT paiements_operateur_check CHECK (operateur IS NULL OR operateur IN ('wave', 'orange_money', 'free_money'))");
            DB::statement("ALTER TABLE evenements_paiement ADD CONSTRAINT evenements_paiement_source_check CHECK (source IN ('nwc', 'paytech_ipn', 'verification', 'manuel'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('evenements_paiement');
        Schema::table('ventes', function (Blueprint $table) {
            $table->dropForeign(['paiement_reussi_id']);
        });
        Schema::dropIfExists('paiements');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ventes', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->unsignedBigInteger('numero');
            $table->foreignId('caissier_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedBigInteger('montant_xof');
            $table->string('note', 200)->nullable();
            $table->string('statut', 20)->default('en_attente');
            $table->timestamp('payee_at')->nullable();
            $table->unsignedBigInteger('paiement_reussi_id')->nullable(); // FK ajoutée après la table paiements
            $table->char('recu_jeton', 64)->nullable()->unique();
            $table->string('alerte', 30)->nullable();
            $table->timestamps();

            $table->unique(['boutique_id', 'numero']);
            $table->index(['boutique_id', 'created_at']);
            $table->index(['boutique_id', 'statut']);
            $table->index(['boutique_id', 'caissier_id', 'created_at']);
        });

        Schema::create('lignes_vente', function (Blueprint $table) {
            $table->id();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('vente_id')->constrained('ventes')->cascadeOnDelete();
            $table->foreignId('article_id')->nullable()->constrained('articles')->nullOnDelete();
            $table->string('libelle', 120);
            $table->unsignedInteger('quantite')->default(1);
            $table->unsignedBigInteger('prix_unitaire_xof');
            $table->timestamps();

            $table->index('vente_id');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE ventes ADD CONSTRAINT ventes_statut_check CHECK (statut IN ('en_attente', 'payee', 'annulee', 'expiree'))");
            DB::statement("ALTER TABLE ventes ADD CONSTRAINT ventes_alerte_check CHECK (alerte IS NULL OR alerte IN ('trop_percu', 'payee_apres_annulation'))");
            DB::statement('ALTER TABLE ventes ADD CONSTRAINT ventes_montant_check CHECK (montant_xof > 0)');
            DB::statement('ALTER TABLE lignes_vente ADD CONSTRAINT lignes_vente_quantite_check CHECK (quantite > 0)');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('lignes_vente');
        Schema::dropIfExists('ventes');
    }
};

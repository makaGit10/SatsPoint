<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('connexions_wallet', function (Blueprint $table) {
            $table->id();
            $table->foreignId('boutique_id')->unique()->constrained('boutiques')->cascadeOnDelete();
            $table->text('uri_chiffree');                 // AES-256-GCM, clé DATA_ENCRYPTION_KEY
            $table->string('pubkey_wallet', 64)->nullable();
            $table->jsonb('relais')->nullable();
            $table->jsonb('permissions')->nullable();
            $table->unsignedBigInteger('budget_sats')->nullable();
            $table->string('statut', 20)->default('active');
            $table->timestamp('verifiee_at')->nullable();
            $table->string('alias', 120)->nullable();
            $table->string('lud16', 190)->nullable();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE connexions_wallet ADD CONSTRAINT connexions_wallet_statut_check CHECK (statut IN ('active', 'erreur', 'revoquee'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('connexions_wallet');
    }
};

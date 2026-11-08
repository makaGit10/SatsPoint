<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('boutiques', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->string('nom', 120);
            $table->string('telephone', 20)->nullable();
            $table->string('ville', 80);
            $table->string('fuseau', 40)->default('Africa/Dakar');
            $table->char('devise', 3)->default('XOF');
            $table->string('statut', 20)->default('active');
            $table->jsonb('reglages')->default('{"expiration_facture_min":5,"montant_max_xof":2000000,"moyens":{"lightning":true,"paytech":false,"wave_manuel":false},"message_recu":null,"wave_lien":null,"paiement_test":false}');
            $table->unsignedBigInteger('sequence_vente')->default(0);
            $table->foreignId('cree_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('statut');
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE boutiques ADD CONSTRAINT boutiques_statut_check CHECK (statut IN ('active', 'suspendue'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('boutiques');
    }
};

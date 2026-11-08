<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('invitations', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->string('contact', 190);
            $table->string('role', 20);
            $table->char('jeton_hash', 64)->unique();
            $table->timestamp('expire_at');
            $table->timestamp('acceptee_at')->nullable();
            $table->foreignId('invite_par')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('acceptee_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['boutique_id', 'acceptee_at', 'expire_at']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE invitations ADD CONSTRAINT invitations_role_check CHECK (role IN ('proprietaire', 'gerant', 'caissier'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invitations');
    }
};

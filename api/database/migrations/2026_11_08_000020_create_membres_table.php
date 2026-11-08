<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('membres', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->foreignId('boutique_id')->constrained('boutiques')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('role', 20);
            $table->boolean('actif')->default(true);
            $table->string('pin_hash')->nullable();
            $table->foreignId('invite_par')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['boutique_id', 'user_id']);
            $table->index(['user_id', 'actif']);
            $table->index(['boutique_id', 'actif', 'role']);
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE membres ADD CONSTRAINT membres_role_check CHECK (role IN ('proprietaire', 'gerant', 'caissier'))");
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('membres');
    }
};

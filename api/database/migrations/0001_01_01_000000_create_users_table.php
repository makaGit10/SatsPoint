<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm');
            DB::statement('CREATE EXTENSION IF NOT EXISTS unaccent');
        }

        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->char('ulid', 26)->unique();
            $table->string('nom', 80);
            $table->string('email', 190)->nullable()->unique();
            $table->string('telephone', 20)->nullable()->unique();
            $table->string('password');
            $table->string('role_plateforme', 20)->nullable();
            $table->jsonb('preferences')->default('{"locale":"fr","langue_audio":"wo","theme":"auto","aide_vocale":true}');
            $table->text('two_factor_secret')->nullable();
            $table->timestamp('derniere_connexion_at')->nullable();
            $table->timestamp('sessions_revoquees_at', 6)->nullable();
            $table->rememberToken();
            $table->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_role_plateforme_check CHECK (role_plateforme IS NULL OR role_plateforme IN ('super_admin'))");
            DB::statement('ALTER TABLE users ADD CONSTRAINT users_identifiant_check CHECK (email IS NOT NULL OR telephone IS NOT NULL)');
            DB::statement("ALTER TABLE users ADD CONSTRAINT users_telephone_e164_check CHECK (telephone IS NULL OR telephone ~ '^\\+[1-9][0-9]{7,14}$')");
        }

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('users');
    }
};

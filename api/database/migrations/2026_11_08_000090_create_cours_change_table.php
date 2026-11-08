<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cours_change', function (Blueprint $table) {
            $table->id();
            $table->string('source', 40);
            $table->decimal('btc_eur', 18, 2);
            $table->decimal('btc_xof', 18, 2);
            $table->timestamp('recupere_at');
            $table->timestamp('created_at')->nullable();

            $table->index('recupere_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cours_change');
    }
};

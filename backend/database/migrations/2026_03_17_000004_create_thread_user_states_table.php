<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('thread_user_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->boolean('is_read')->default(false);
            $table->boolean('is_starred')->default(false);
            $table->boolean('is_trashed')->default(false);
            $table->boolean('is_spam')->default(false);
            $table->timestamps();

            $table->unique(['thread_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('thread_user_states');
    }
};

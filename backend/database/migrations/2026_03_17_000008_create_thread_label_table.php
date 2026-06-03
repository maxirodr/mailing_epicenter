<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('thread_label', function (Blueprint $table) {
            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();
            $table->foreignId('label_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['thread_id', 'label_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('thread_label');
    }
};

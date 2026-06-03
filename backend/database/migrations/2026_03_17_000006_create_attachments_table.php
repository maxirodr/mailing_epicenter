<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('email_id')->constrained()->cascadeOnDelete();
            $table->string('filename');
            $table->string('content_type');
            $table->unsignedBigInteger('size');
            $table->string('r2_key');
            $table->string('r2_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
    }
};

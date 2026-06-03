<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sender_blacklist', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('from_address');
            $table->timestamps();

            $table->unique(['mailbox_id', 'user_id', 'from_address']);
            $table->index(['mailbox_id', 'from_address']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sender_blacklist');
    }
};

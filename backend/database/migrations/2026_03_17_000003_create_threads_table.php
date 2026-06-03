<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('threads', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('subject');
            $table->string('snippet')->nullable();
            $table->timestamp('last_message_at')->nullable();
            $table->unsignedInteger('message_count')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('threads');
    }
};

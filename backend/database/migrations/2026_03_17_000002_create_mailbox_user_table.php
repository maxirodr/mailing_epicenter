<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mailbox_user', function (Blueprint $table) {
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->enum('role', ['owner', 'member'])->default('member');
            $table->timestamps();

            $table->unique(['mailbox_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mailbox_user');
    }
};

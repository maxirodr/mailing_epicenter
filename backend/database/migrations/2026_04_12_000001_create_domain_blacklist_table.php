<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('domain_blacklist', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('domain');
            $table->unsignedSmallInteger('spam_count')->default(0);
            $table->timestamps();

            $table->unique(['mailbox_id', 'user_id', 'domain']);
            $table->index(['mailbox_id', 'domain']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('domain_blacklist');
    }
};

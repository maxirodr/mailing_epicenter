<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sender_category_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('from_domain');
            $table->string('category', 20);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['mailbox_id', 'from_domain']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sender_category_overrides');
    }
};

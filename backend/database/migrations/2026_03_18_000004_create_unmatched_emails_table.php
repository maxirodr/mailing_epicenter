<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('unmatched_emails', function (Blueprint $table) {
            $table->id();
            $table->string('from_address');
            $table->json('to_addresses');
            $table->string('subject')->nullable();
            $table->json('raw_payload');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('unmatched_emails');
    }
};

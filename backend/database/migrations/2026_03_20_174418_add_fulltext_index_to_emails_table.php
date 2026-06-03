<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            return;
        }
        Schema::table('emails', function (Blueprint $table) {
            $table->fullText(['subject', 'text_body'], 'emails_fulltext_search');
        });
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            return;
        }
        Schema::table('emails', function (Blueprint $table) {
            $table->dropFullText('emails_fulltext_search');
        });
    }
};

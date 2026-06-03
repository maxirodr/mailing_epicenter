<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('threads', function (Blueprint $table) {
            $table->string('category', 20)->default('primary')->after('message_count');
            $table->index(['mailbox_id', 'category']);
        });
    }

    public function down(): void
    {
        Schema::table('threads', function (Blueprint $table) {
            $table->dropIndex(['mailbox_id', 'category']);
            $table->dropColumn('category');
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->string('list_unsubscribe', 500)->nullable()->after('scheduled_at');
            $table->string('list_id', 255)->nullable()->after('list_unsubscribe');
        });
    }

    public function down(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->dropColumn(['list_unsubscribe', 'list_id']);
        });
    }
};

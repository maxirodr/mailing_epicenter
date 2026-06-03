<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->unsignedTinyInteger('spam_score')->default(0)->after('list_id');
            $table->text('auth_results')->nullable()->after('spam_score');
        });
    }

    public function down(): void
    {
        Schema::table('emails', function (Blueprint $table) {
            $table->dropColumn(['spam_score', 'auth_results']);
        });
    }
};

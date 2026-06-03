<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('setup_completed_at')->nullable()->after('two_factor_recovery_codes');
        });

        // Backfill: users who already have 2FA enabled have completed setup
        DB::table('users')
            ->whereNotNull('two_factor_confirmed_at')
            ->update(['setup_completed_at' => DB::raw('two_factor_confirmed_at')]);
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('setup_completed_at');
        });
    }
};

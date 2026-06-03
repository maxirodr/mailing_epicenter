<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->dropForeign(['mailbox_id']);
            $table->dropUnique(['mailbox_id', 'from_domain']);
        });

        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->renameColumn('from_domain', 'from_address');
        });

        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->foreign('mailbox_id')->references('id')->on('mailboxes')->cascadeOnDelete();
            $table->unique(['mailbox_id', 'from_address']);
        });
    }

    public function down(): void
    {
        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->dropForeign(['mailbox_id']);
            $table->dropUnique(['mailbox_id', 'from_address']);
        });

        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->renameColumn('from_address', 'from_domain');
        });

        Schema::table('sender_category_overrides', function (Blueprint $table) {
            $table->foreign('mailbox_id')->references('id')->on('mailboxes')->cascadeOnDelete();
            $table->unique(['mailbox_id', 'from_domain']);
        });
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('emails', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();
            $table->foreignId('mailbox_id')->constrained()->cascadeOnDelete();
            $table->string('message_id')->index();
            $table->string('in_reply_to')->nullable();
            $table->text('references_header')->nullable();
            $table->string('from_address');
            $table->string('from_name')->nullable();
            $table->json('to_addresses');
            $table->json('cc_addresses')->nullable();
            $table->json('bcc_addresses')->nullable();
            $table->string('subject');
            $table->longText('html_body')->nullable();
            $table->longText('text_body')->nullable();
            $table->enum('direction', ['inbound', 'outbound']);
            $table->boolean('is_draft')->default(false);
            $table->string('resend_email_id')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('emails');
    }
};

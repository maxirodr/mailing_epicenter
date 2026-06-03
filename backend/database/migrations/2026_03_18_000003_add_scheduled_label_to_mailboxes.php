<?php

use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        $mailboxes = \App\Models\Mailbox::all();
        foreach ($mailboxes as $mailbox) {
            $exists = $mailbox->labels()->where('name', 'SCHEDULED')->where('type', 'system')->exists();
            if (!$exists) {
                $mailbox->labels()->create([
                    'name' => 'SCHEDULED',
                    'type' => 'system',
                    'sort_order' => 6,
                ]);
            }
        }
    }

    public function down(): void
    {
        \App\Models\Label::where('name', 'SCHEDULED')->where('type', 'system')->delete();
    }
};

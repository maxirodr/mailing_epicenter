<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ImportProductionDumpCommand extends Command
{
    protected $signature = 'mail:import-production-dump
                            {--cleanup : Drop temp tables after import}';

    protected $description = 'Import data from temp tables created by the production SQL dump';

    public function handle(): int
    {
        // Verify temp tables exist
        $tables = ['_import_threads', '_import_emails', '_import_thread_user_states', '_import_thread_labels', '_import_attachments'];
        foreach ($tables as $table) {
            if (! DB::getSchemaBuilder()->hasTable($table)) {
                $this->error("Temp table {$table} not found. Import the SQL dump first.");
                return 1;
            }
        }

        $threadCount = DB::table('_import_threads')->count();
        $emailCount = DB::table('_import_emails')->count();
        $stateCount = DB::table('_import_thread_user_states')->count();
        $labelCount = DB::table('_import_thread_labels')->count();
        $attCount = DB::table('_import_attachments')->count();

        $this->info("Data to import:");
        $this->info("  Threads: {$threadCount}");
        $this->info("  Emails: {$emailCount}");
        $this->info("  Thread states: {$stateCount}");
        $this->info("  Thread-labels: {$labelCount}");
        $this->info("  Attachments: {$attCount}");

        if (! $this->confirm('Proceed with import?')) {
            return 0;
        }

        DB::statement('SET FOREIGN_KEY_CHECKS = 0');

        // Step 1: Import threads (old_id → new_id mapping)
        $this->info('Importing threads...');
        $threadMap = []; // old_id => new_id
        $bar = $this->output->createProgressBar($threadCount);

        DB::table('_import_threads')->orderBy('old_id')->chunk(500, function ($threads) use (&$threadMap, $bar) {
            foreach ($threads as $thread) {
                $newId = DB::table('threads')->insertGetId([
                    'mailbox_id' => $thread->mailbox_id,
                    'subject' => $thread->subject,
                    'snippet' => $thread->snippet,
                    'last_message_at' => $thread->last_message_at,
                    'message_count' => $thread->message_count,
                    'category' => $thread->category,
                    'created_at' => $thread->created_at,
                    'updated_at' => $thread->updated_at,
                ]);
                $threadMap[$thread->old_id] = $newId;
                $bar->advance();
            }
        });
        $bar->finish();
        $this->newLine();

        // Step 2: Import emails (map thread_id)
        $this->info('Importing emails...');
        $emailMap = []; // old_email_id => new_email_id (for attachments)
        $bar = $this->output->createProgressBar($emailCount);
        $skipped = 0;

        DB::table('_import_emails')->orderBy('id')->chunk(500, function ($emails) use (&$threadMap, &$emailMap, &$skipped, $bar) {
            foreach ($emails as $email) {
                $newThreadId = $threadMap[$email->old_thread_id] ?? null;
                if (! $newThreadId) {
                    $skipped++;
                    $bar->advance();
                    continue;
                }

                $newEmailId = DB::table('emails')->insertGetId([
                    'thread_id' => $newThreadId,
                    'mailbox_id' => $email->mailbox_id,
                    'message_id' => $email->message_id,
                    'in_reply_to' => $email->in_reply_to,
                    'references_header' => $email->references_header,
                    'from_address' => $email->from_address,
                    'from_name' => $email->from_name,
                    'to_addresses' => $email->to_addresses,
                    'cc_addresses' => $email->cc_addresses,
                    'bcc_addresses' => $email->bcc_addresses,
                    'subject' => $email->subject,
                    'html_body' => $email->html_body,
                    'text_body' => $email->text_body,
                    'direction' => $email->direction,
                    'is_draft' => $email->is_draft,
                    'resend_email_id' => $email->resend_email_id,
                    'sent_at' => $email->sent_at,
                    'scheduled_at' => $email->scheduled_at,
                    'list_unsubscribe' => $email->list_unsubscribe,
                    'list_id' => $email->list_id,
                    'created_at' => $email->created_at,
                    'updated_at' => $email->updated_at,
                ]);

                // Store mapping for attachments using the temp table's auto-increment id
                $emailMap[$email->id] = $newEmailId;
                // Also store by old_email_id (which is the original email_id from the source)
                if ($email->old_email_id ?? null) {
                    $emailMap['orig_'.$email->old_email_id] = $newEmailId;
                }

                $bar->advance();
            }
        });
        $bar->finish();
        $this->newLine();
        if ($skipped > 0) {
            $this->warn("Skipped {$skipped} emails (missing thread mapping)");
        }

        // Step 3: Import thread_user_states (map thread_id)
        $this->info('Importing thread user states...');
        $bar = $this->output->createProgressBar($stateCount);

        DB::table('_import_thread_user_states')->orderBy('id')->chunk(500, function ($states) use (&$threadMap, $bar) {
            foreach ($states as $state) {
                $newThreadId = $threadMap[$state->old_thread_id] ?? null;
                if (! $newThreadId) {
                    $bar->advance();
                    continue;
                }

                DB::table('thread_user_states')->updateOrInsert(
                    ['thread_id' => $newThreadId, 'user_id' => $state->user_id],
                    [
                        'is_read' => $state->is_read,
                        'is_starred' => $state->is_starred,
                        'is_trashed' => $state->is_trashed,
                        'is_spam' => $state->is_spam,
                        'created_at' => $state->created_at,
                        'updated_at' => $state->updated_at,
                    ]
                );
                $bar->advance();
            }
        });
        $bar->finish();
        $this->newLine();

        // Step 4: Import thread_label (map thread_id, resolve label_id by name)
        $this->info('Importing thread-label associations...');
        $labelCache = []; // "mailbox_id:name" => label_id
        $bar = $this->output->createProgressBar($labelCount);

        DB::table('_import_thread_labels')->orderBy('old_thread_id')->chunk(500, function ($rows) use (&$threadMap, &$labelCache, $bar) {
            foreach ($rows as $row) {
                $newThreadId = $threadMap[$row->old_thread_id] ?? null;
                if (! $newThreadId) {
                    $bar->advance();
                    continue;
                }

                $cacheKey = "{$row->mailbox_id}:{$row->label_name}";
                if (! isset($labelCache[$cacheKey])) {
                    $label = DB::table('labels')
                        ->where('mailbox_id', $row->mailbox_id)
                        ->where('name', $row->label_name)
                        ->first();
                    $labelCache[$cacheKey] = $label?->id;
                }

                $labelId = $labelCache[$cacheKey];
                if ($labelId) {
                    DB::table('thread_label')->insertOrIgnore([
                        'thread_id' => $newThreadId,
                        'label_id' => $labelId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
                $bar->advance();
            }
        });
        $bar->finish();
        $this->newLine();

        // Step 5: Import attachments (map email_id)
        if ($attCount > 0) {
            $this->info('Importing attachment records...');

            // Build email_id mapping from old_email_id in _import_attachments
            // The old_email_id in _import_attachments corresponds to the old_thread_id pattern
            // We need to match by email message_id instead
            $bar = $this->output->createProgressBar($attCount);
            $attSkipped = 0;

            DB::table('_import_attachments')->orderBy('id')->chunk(500, function ($atts) use ($bar, &$attSkipped) {
                foreach ($atts as $att) {
                    // Find the email by looking up the old_email_id → new email
                    // The new email has the same message_id, so find it
                    $newEmail = DB::table('emails')
                        ->where('id', '>', 0)
                        ->whereExists(function ($q) use ($att) {
                            // Match by position: the Nth email imported maps to the Nth attachment's email
                            // Actually, use message_id matching via the import emails temp table
                        });

                    // Simpler: find email by message_id from the temp table
                    $origEmail = DB::table('_import_emails')->where('id', $att->old_email_id)->first();
                    if (! $origEmail || ! $origEmail->message_id) {
                        $attSkipped++;
                        $bar->advance();
                        continue;
                    }

                    $realEmail = DB::table('emails')
                        ->where('message_id', $origEmail->message_id)
                        ->first();

                    if (! $realEmail) {
                        $attSkipped++;
                        $bar->advance();
                        continue;
                    }

                    DB::table('attachments')->insertOrIgnore([
                        'email_id' => $realEmail->id,
                        'filename' => $att->filename,
                        'content_type' => $att->content_type,
                        'size' => $att->size,
                        'r2_key' => $att->r2_key,
                        'r2_url' => $att->r2_url,
                        'created_at' => $att->created_at,
                        'updated_at' => $att->updated_at,
                    ]);
                    $bar->advance();
                }
            });
            $bar->finish();
            $this->newLine();
            if ($attSkipped > 0) {
                $this->warn("Skipped {$attSkipped} attachments (email not found)");
            }
        }

        DB::statement('SET FOREIGN_KEY_CHECKS = 1');

        $this->info('Import complete!');
        $this->info("Threads: ".count($threadMap)." imported");
        $this->info('Next steps:');
        $this->line('  1. php artisan mail:classify-threads --all');
        $this->line('  2. php artisan mail:rethread');
        $this->line('  3. php artisan mail:import-production-dump --cleanup');

        if ($this->option('cleanup')) {
            $this->cleanup();
        }

        return 0;
    }

    private function cleanup(): void
    {
        $this->info('Cleaning up temp tables...');
        DB::statement('DROP TABLE IF EXISTS _import_threads');
        DB::statement('DROP TABLE IF EXISTS _import_emails');
        DB::statement('DROP TABLE IF EXISTS _import_thread_user_states');
        DB::statement('DROP TABLE IF EXISTS _import_thread_labels');
        DB::statement('DROP TABLE IF EXISTS _import_attachments');
        $this->info('Temp tables dropped.');
    }
}

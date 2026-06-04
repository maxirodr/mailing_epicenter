<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ExportForProductionCommand extends Command
{
    protected $signature = 'mail:export-production
                            {output : Path to output SQL file}
                            {--mailbox-map= : Mailbox ID mapping local:prod,local:prod (e.g., 2:3,3:4)}
                            {--user-map=1:1 : User ID mapping local:prod}';

    protected $description = 'Export imported emails as SQL for production import';

    public function handle(): int
    {
        $output = $this->argument('output');
        $mailboxMapStr = $this->option('mailbox-map');
        $userMapStr = $this->option('user-map');

        if (! $mailboxMapStr) {
            $this->error('--mailbox-map is required');
            return 1;
        }

        // Parse mappings
        $mailboxMap = [];
        foreach (explode(',', $mailboxMapStr) as $pair) {
            [$local, $prod] = explode(':', $pair);
            $mailboxMap[(int) $local] = (int) $prod;
        }

        $userMap = [];
        foreach (explode(',', $userMapStr) as $pair) {
            [$local, $prod] = explode(':', $pair);
            $userMap[(int) $local] = (int) $prod;
        }

        $localMailboxIds = array_keys($mailboxMap);
        $this->info('Mailbox mapping: '.json_encode($mailboxMap));
        $this->info('User mapping: '.json_encode($userMap));

        $handle = fopen($output, 'w');
        if (! $handle) {
            $this->error("Cannot open {$output} for writing");
            return 1;
        }

        // Header
        fwrite($handle, "-- Epicenter Mail Production Import\n");
        fwrite($handle, "-- Generated: ".now()->toDateTimeString()."\n");
        fwrite($handle, "-- Mailbox mapping: ".json_encode($mailboxMap)."\n\n");
        fwrite($handle, "SET FOREIGN_KEY_CHECKS = 0;\n");
        fwrite($handle, "SET UNIQUE_CHECKS = 0;\n");
        fwrite($handle, "SET autocommit = 0;\n\n");

        // Create temp tables
        fwrite($handle, "-- Temp tables for import\n");
        fwrite($handle, "DROP TABLE IF EXISTS _import_threads;\n");
        fwrite($handle, "CREATE TABLE _import_threads LIKE threads;\n");
        fwrite($handle, "ALTER TABLE _import_threads ADD COLUMN old_id BIGINT UNSIGNED FIRST;\n\n");

        fwrite($handle, "DROP TABLE IF EXISTS _import_emails;\n");
        fwrite($handle, "CREATE TABLE _import_emails LIKE emails;\n");
        fwrite($handle, "ALTER TABLE _import_emails ADD COLUMN old_thread_id BIGINT UNSIGNED AFTER id;\n\n");

        fwrite($handle, "DROP TABLE IF EXISTS _import_thread_user_states;\n");
        fwrite($handle, "CREATE TABLE _import_thread_user_states LIKE thread_user_states;\n");
        fwrite($handle, "ALTER TABLE _import_thread_user_states ADD COLUMN old_thread_id BIGINT UNSIGNED AFTER id;\n\n");

        fwrite($handle, "DROP TABLE IF EXISTS _import_thread_labels;\n");
        fwrite($handle, "CREATE TABLE _import_thread_labels (old_thread_id BIGINT UNSIGNED, label_name VARCHAR(255), mailbox_id BIGINT UNSIGNED);\n\n");

        fwrite($handle, "DROP TABLE IF EXISTS _import_attachments;\n");
        fwrite($handle, "CREATE TABLE _import_attachments LIKE attachments;\n");
        fwrite($handle, "ALTER TABLE _import_attachments ADD COLUMN old_email_id BIGINT UNSIGNED AFTER id;\n\n");

        // Export threads
        $threadCount = DB::table('threads')->whereIn('mailbox_id', $localMailboxIds)->count();
        $this->info("Exporting {$threadCount} threads...");

        DB::table('threads')->whereIn('mailbox_id', $localMailboxIds)
            ->orderBy('id')
            ->chunk(500, function ($threads) use ($handle, $mailboxMap) {
                foreach ($threads as $thread) {
                    $prodMailboxId = $mailboxMap[$thread->mailbox_id];
                    $subject = $this->esc($thread->subject);
                    $snippet = $this->esc($thread->snippet);
                    $lastMsg = $thread->last_message_at ? "'{$thread->last_message_at}'" : 'NULL';
                    $cat = $this->esc($thread->category);

                    fwrite($handle, "INSERT INTO _import_threads (old_id, mailbox_id, subject, snippet, last_message_at, message_count, category, created_at, updated_at) VALUES ({$thread->id}, {$prodMailboxId}, {$subject}, {$snippet}, {$lastMsg}, {$thread->message_count}, {$cat}, '{$thread->created_at}', '{$thread->updated_at}');\n");
                }
            });

        fwrite($handle, "\n");

        // Export emails
        $emailCount = DB::table('emails')->whereIn('mailbox_id', $localMailboxIds)->count();
        $this->info("Exporting {$emailCount} emails...");

        DB::table('emails')->whereIn('mailbox_id', $localMailboxIds)
            ->orderBy('id')
            ->chunk(500, function ($emails) use ($handle, $mailboxMap) {
                foreach ($emails as $email) {
                    $prodMailboxId = $mailboxMap[$email->mailbox_id];
                    $vals = [
                        $email->thread_id,
                        $prodMailboxId,
                        $this->esc($email->message_id),
                        $this->esc($email->in_reply_to),
                        $this->esc($email->references_header),
                        $this->esc($email->from_address),
                        $this->esc($email->from_name),
                        $this->esc($email->to_addresses),
                        $this->esc($email->cc_addresses),
                        $this->esc($email->bcc_addresses),
                        $this->esc($email->subject),
                        $this->esc($email->html_body),
                        $this->esc($email->text_body),
                        $this->esc($email->direction),
                        $email->is_draft ? 1 : 0,
                        $this->esc($email->resend_email_id),
                        $email->sent_at ? "'{$email->sent_at}'" : 'NULL',
                        $email->scheduled_at ? "'{$email->scheduled_at}'" : 'NULL',
                        $this->esc($email->list_unsubscribe),
                        $this->esc($email->list_id),
                        "'{$email->created_at}'",
                        "'{$email->updated_at}'",
                    ];

                    fwrite($handle, 'INSERT INTO _import_emails (old_thread_id, mailbox_id, message_id, in_reply_to, references_header, from_address, from_name, to_addresses, cc_addresses, bcc_addresses, subject, html_body, text_body, direction, is_draft, resend_email_id, sent_at, scheduled_at, list_unsubscribe, list_id, created_at, updated_at) VALUES ('.implode(',', $vals).");\n");
                }
            });

        fwrite($handle, "\n");

        // Export thread_user_states
        $stateCount = DB::table('thread_user_states as tus')
            ->join('threads as t', 't.id', '=', 'tus.thread_id')
            ->whereIn('t.mailbox_id', $localMailboxIds)
            ->count();
        $this->info("Exporting {$stateCount} thread user states...");

        DB::table('thread_user_states as tus')
            ->join('threads as t', 't.id', '=', 'tus.thread_id')
            ->whereIn('t.mailbox_id', $localMailboxIds)
            ->select('tus.*')
            ->orderBy('tus.id')
            ->chunk(500, function ($states) use ($handle, $userMap) {
                foreach ($states as $state) {
                    $prodUserId = $userMap[$state->user_id] ?? $state->user_id;
                    fwrite($handle, "INSERT INTO _import_thread_user_states (old_thread_id, user_id, is_read, is_starred, is_trashed, is_spam, created_at, updated_at) VALUES ({$state->thread_id}, {$prodUserId}, {$state->is_read}, {$state->is_starred}, {$state->is_trashed}, {$state->is_spam}, '{$state->created_at}', '{$state->updated_at}');\n");
                }
            });

        fwrite($handle, "\n");

        // Export thread_label (by label name, not ID)
        $labelCount = DB::table('thread_label as tl')
            ->join('threads as t', 't.id', '=', 'tl.thread_id')
            ->join('labels as l', 'l.id', '=', 'tl.label_id')
            ->whereIn('t.mailbox_id', $localMailboxIds)
            ->count();
        $this->info("Exporting {$labelCount} thread-label associations...");

        DB::table('thread_label as tl')
            ->join('threads as t', 't.id', '=', 'tl.thread_id')
            ->join('labels as l', 'l.id', '=', 'tl.label_id')
            ->whereIn('t.mailbox_id', $localMailboxIds)
            ->select('tl.thread_id', 'l.name as label_name', 't.mailbox_id')
            ->orderBy('tl.thread_id')
            ->chunk(500, function ($rows) use ($handle, $mailboxMap) {
                foreach ($rows as $row) {
                    $prodMailboxId = $mailboxMap[$row->mailbox_id];
                    $labelName = $this->esc($row->label_name);
                    fwrite($handle, "INSERT INTO _import_thread_labels (old_thread_id, label_name, mailbox_id) VALUES ({$row->thread_id}, {$labelName}, {$prodMailboxId});\n");
                }
            });

        fwrite($handle, "\n");

        // Export attachments
        $attCount = DB::table('attachments as a')
            ->join('emails as e', 'e.id', '=', 'a.email_id')
            ->whereIn('e.mailbox_id', $localMailboxIds)
            ->count();
        $this->info("Exporting {$attCount} attachment records...");

        DB::table('attachments as a')
            ->join('emails as e', 'e.id', '=', 'a.email_id')
            ->whereIn('e.mailbox_id', $localMailboxIds)
            ->select('a.*', 'e.message_id as email_message_id')
            ->orderBy('a.id')
            ->chunk(500, function ($atts) use ($handle) {
                foreach ($atts as $att) {
                    $vals = [
                        $att->email_id,
                        $this->esc($att->filename),
                        $this->esc($att->content_type),
                        $att->size,
                        $this->esc($att->r2_key),
                        $this->esc($att->r2_url),
                        "'{$att->created_at}'",
                        "'{$att->updated_at}'",
                    ];
                    fwrite($handle, 'INSERT INTO _import_attachments (old_email_id, filename, content_type, size, r2_key, r2_url, created_at, updated_at) VALUES ('.implode(',', $vals).");\n");
                }
            });

        fwrite($handle, "\nCOMMIT;\n");
        fwrite($handle, "SET FOREIGN_KEY_CHECKS = 1;\n");
        fwrite($handle, "SET UNIQUE_CHECKS = 1;\n");

        fclose($handle);

        $size = filesize($output);
        $this->info("Export complete: {$output} (".round($size / 1024 / 1024, 1).' MB)');
        $this->info('Next: gzip the file, upload to prod, and run mail:import-production-dump');

        return 0;
    }

    private function esc(mixed $value): string
    {
        if ($value === null) {
            return 'NULL';
        }

        return "'".addslashes((string) $value)."'";
    }
}

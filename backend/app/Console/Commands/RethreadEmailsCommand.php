<?php

namespace App\Console\Commands;

use App\Models\Email;
use App\Models\Thread;
use App\Models\ThreadUserState;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RethreadEmailsCommand extends Command
{
    protected $signature = 'mail:rethread
                            {--mailbox= : Only rethread for a specific mailbox ID}
                            {--dry-run : Show what would be merged without changing anything}';

    protected $description = 'Merge split threads by matching in_reply_to and references headers';

    private int $merged = 0;
    private int $deleted = 0;

    public function handle(): int
    {
        $dryRun = $this->option('dry-run');
        $this->info($dryRun ? 'Mode: DRY RUN' : 'Mode: MERGE');

        $mergeMap = []; // target_thread_id => [source_thread_ids]

        // Step 1: Find emails with in_reply_to pointing to a message_id in a DIFFERENT thread
        $query = Email::select('id', 'thread_id', 'mailbox_id', 'in_reply_to')
            ->whereNotNull('in_reply_to')
            ->where('in_reply_to', '!=', '');

        if ($mailboxId = $this->option('mailbox')) {
            $query->where('mailbox_id', $mailboxId);
        }

        $total = $query->count();
        $this->info("Checking {$total} emails with in_reply_to...");

        $query->chunkById(500, function ($emails) use (&$mergeMap) {
            foreach ($emails as $email) {
                $parent = Email::select('id', 'thread_id')
                    ->where('message_id', $email->in_reply_to)
                    ->where('mailbox_id', $email->mailbox_id)
                    ->first();

                if (! $parent || $parent->thread_id === $email->thread_id) {
                    continue;
                }

                $mergeMap[$parent->thread_id][] = $email->thread_id;
            }
        });

        // Step 2: Also check references header (covers cases where in_reply_to is unknown OR
        // points to a synthetic id like SES's that we never stored). Limiting to NULL in_reply_to
        // missed split threads where Resend/SES rewrote our outbound Message-ID.
        $refQuery = Email::select('id', 'thread_id', 'mailbox_id', 'references_header')
            ->whereNotNull('references_header')
            ->where('references_header', '!=', '');

        if ($mailboxId) {
            $refQuery->where('mailbox_id', $mailboxId);
        }

        $refTotal = $refQuery->count();
        $this->info("Checking {$refTotal} emails with references (no in_reply_to)...");

        $refQuery->chunkById(500, function ($emails) use (&$mergeMap) {
            foreach ($emails as $email) {
                $refIds = $this->parseRefs($email->references_header);

                if (! $refIds) {
                    continue;
                }

                // Match against both bracketed and bare forms — historical storage is inconsistent.
                $candidates = [];
                foreach ($refIds as $r) {
                    $candidates[] = $r;
                    $candidates[] = '<' . $r . '>';
                }

                $parent = Email::select('id', 'thread_id')
                    ->where('mailbox_id', $email->mailbox_id)
                    ->whereIn('message_id', $candidates)
                    ->first();

                if (! $parent || $parent->thread_id === $email->thread_id) {
                    continue;
                }

                $mergeMap[$parent->thread_id][] = $email->thread_id;
            }
        });

        // Deduplicate
        foreach ($mergeMap as $target => $sources) {
            $mergeMap[$target] = array_unique($sources);
        }

        // Resolve chains: if A merges into B and B merges into C, everything goes to C
        $mergeMap = $this->resolveChains($mergeMap);

        $totalMerges = array_sum(array_map('count', $mergeMap));
        $this->info("Found {$totalMerges} thread merges across ".count($mergeMap).' target threads.');

        if ($totalMerges === 0) {
            $this->info('Nothing to merge.');
            return 0;
        }

        if ($dryRun) {
            foreach ($mergeMap as $targetId => $sourceIds) {
                $target = Thread::find($targetId);
                foreach ($sourceIds as $sourceId) {
                    $source = Thread::find($sourceId);
                    if ($target && $source) {
                        $this->line("  MERGE: \"{$source->subject}\" (#{$sourceId}, {$source->message_count} msgs) → \"{$target->subject}\" (#{$targetId})");
                    }
                }
            }
            return 0;
        }

        // Step 3: Execute merges
        DB::beginTransaction();
        try {
            foreach ($mergeMap as $targetThreadId => $sourceThreadIds) {
                foreach ($sourceThreadIds as $sourceThreadId) {
                    $this->mergeThreads($targetThreadId, $sourceThreadId);
                }
            }

            // Step 4: Update thread stats
            $this->updateMergedThreadStats(array_keys($mergeMap));

            DB::commit();
            $this->info("Merged: {$this->merged} threads");
            $this->info("Deleted: {$this->deleted} empty threads");
        } catch (\Exception $e) {
            DB::rollBack();
            $this->error('Error: '.$e->getMessage());
            return 1;
        }

        return 0;
    }

    /**
     * Parse a stored references_header into a flat list of bare (un-bracketed) message-ids.
     * Historically the column has held three shapes: space-separated, comma-separated,
     * and raw JSON arrays. Handle them all.
     */
    private function parseRefs(?string $raw): array
    {
        if ($raw === null) {
            return [];
        }
        $trimmed = trim($raw);
        if ($trimmed === '') {
            return [];
        }

        $items = [];
        if ($trimmed[0] === '[' || $trimmed[0] === '{') {
            $decoded = json_decode($trimmed, true);
            if (is_array($decoded)) {
                $items = $decoded;
            }
        }
        if (! $items) {
            $items = preg_split('/[\s,]+/', $trimmed) ?: [];
        }

        $out = [];
        foreach ($items as $item) {
            if (! is_string($item)) {
                continue;
            }
            $clean = trim($item, "<> \t\r\n\"'");
            if ($clean !== '') {
                $out[] = $clean;
            }
        }
        return array_values(array_unique($out));
    }

    private function mergeThreads(int $targetThreadId, int $sourceThreadId): void
    {
        // Move all emails from source to target
        Email::where('thread_id', $sourceThreadId)
            ->update(['thread_id' => $targetThreadId]);

        // Move thread_label associations
        $targetLabels = DB::table('thread_label')
            ->where('thread_id', $targetThreadId)
            ->pluck('label_id')
            ->toArray();

        DB::table('thread_label')
            ->where('thread_id', $sourceThreadId)
            ->whereNotIn('label_id', $targetLabels)
            ->update(['thread_id' => $targetThreadId]);

        DB::table('thread_label')
            ->where('thread_id', $sourceThreadId)
            ->delete();

        // Merge thread_user_states (keep the "most active" state)
        $sourceStates = ThreadUserState::where('thread_id', $sourceThreadId)->get();
        foreach ($sourceStates as $state) {
            $existing = ThreadUserState::where('thread_id', $targetThreadId)
                ->where('user_id', $state->user_id)
                ->first();

            if ($existing) {
                // Merge: keep starred, keep unread if either is unread
                $existing->update([
                    'is_starred' => $existing->is_starred || $state->is_starred,
                    'is_read' => $existing->is_read && $state->is_read,
                ]);
                $state->delete();
            } else {
                $state->update(['thread_id' => $targetThreadId]);
            }
        }

        // Delete empty source thread
        $source = Thread::find($sourceThreadId);
        if ($source && $source->emails()->count() === 0) {
            $source->delete();
            $this->deleted++;
        }

        $this->merged++;
    }

    private function resolveChains(array $mergeMap): array
    {
        // If thread A is both a source and a target, resolve to final target
        $changed = true;
        while ($changed) {
            $changed = false;
            foreach ($mergeMap as $target => $sources) {
                foreach ($sources as $i => $source) {
                    if (isset($mergeMap[$source])) {
                        // Source is also a target - move its sources to current target
                        $mergeMap[$target] = array_merge($mergeMap[$target], $mergeMap[$source]);
                        unset($mergeMap[$source]);
                        $changed = true;
                        break 2;
                    }
                }
            }
        }

        // Remove self-references
        foreach ($mergeMap as $target => $sources) {
            $mergeMap[$target] = array_values(array_diff(array_unique($sources), [$target]));
            if (empty($mergeMap[$target])) {
                unset($mergeMap[$target]);
            }
        }

        return $mergeMap;
    }

    private function updateMergedThreadStats(array $threadIds): void
    {
        foreach ($threadIds as $threadId) {
            $thread = Thread::find($threadId);
            if (! $thread) {
                continue;
            }

            $latestEmail = $thread->emails()->latest('sent_at')->first();
            $thread->update([
                'message_count' => $thread->emails()->count(),
                'last_message_at' => $latestEmail?->sent_at,
                'snippet' => $latestEmail ? Thread::makeSnippet($latestEmail->html_body, $latestEmail->text_body) : '',
            ]);
        }
    }
}

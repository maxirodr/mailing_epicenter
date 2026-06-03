<?php

namespace App\Console\Commands;

use App\Models\Thread;
use App\Services\EmailClassifier;
use Illuminate\Console\Command;

class ClassifyThreadsCommand extends Command
{
    protected $signature = 'mail:classify-threads
                            {--mailbox= : Classify threads for a specific mailbox ID}
                            {--all : Reclassify ALL threads, not just primary}';

    protected $description = 'Classify existing threads based on their first inbound email';

    public function handle(EmailClassifier $classifier): int
    {
        $query = $this->option('all') ? Thread::query() : Thread::where('category', 'primary');

        if ($mailboxId = $this->option('mailbox')) {
            $query->where('mailbox_id', $mailboxId);
        }

        $total = $query->count();
        $this->info("Classifying {$total} threads...");

        $classified = ['primary' => 0, 'social' => 0, 'promotions' => 0, 'updates' => 0, 'forums' => 0];

        $query->with(['emails' => function ($q) {
            $q->where('direction', 'inbound')->oldest('sent_at')->limit(1);
        }])->chunkById(200, function ($threads) use ($classifier, &$classified) {
            foreach ($threads as $thread) {
                $email = $thread->emails->first();
                if (!$email) {
                    $classified['primary']++;
                    continue;
                }

                $category = $classifier->classify([
                    'from_address' => $email->from_address,
                    'subject' => $email->subject,
                    'list_unsubscribe' => $email->list_unsubscribe,
                    'list_id' => $email->list_id,
                ]);

                if ($category !== $thread->category) {
                    $thread->update(['category' => $category]);
                }

                $classified[$category]++;
            }
        });

        $this->info('Classification complete:');
        foreach ($classified as $cat => $count) {
            $this->line("  {$cat}: {$count}");
        }

        return Command::SUCCESS;
    }
}

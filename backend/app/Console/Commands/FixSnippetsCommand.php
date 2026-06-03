<?php

namespace App\Console\Commands;

use App\Models\Thread;
use Illuminate\Console\Command;

class FixSnippetsCommand extends Command
{
    protected $signature = 'threads:fix-snippets';
    protected $description = 'Regenerate thread snippets stripping HTML/CSS/entities properly';

    public function handle(): void
    {
        $total = Thread::count();
        $this->info("Fixing snippets for {$total} threads...");

        $bar = $this->output->createProgressBar($total);

        Thread::with(['latestEmail'])->chunk(200, function ($threads) use ($bar) {
            foreach ($threads as $thread) {
                $email = $thread->latestEmail;
                if (!$email) {
                    $bar->advance();
                    continue;
                }

                $newSnippet = Thread::makeSnippet($email->html_body, $email->text_body);
                if ($newSnippet !== $thread->snippet) {
                    $thread->update(['snippet' => $newSnippet]);
                }
                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine();
        $this->info('Done.');
    }
}

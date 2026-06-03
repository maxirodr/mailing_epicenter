<?php

namespace App\Console\Commands;

use App\Services\OneSignalService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Redis;

class QueueHealthCheckCommand extends Command
{
    protected $signature = 'queue:health-check {--threshold=10 : Alert if queue size exceeds this}';

    protected $description = 'Check queue health and auto-restart workers if jobs are piling up';

    public function handle(): int
    {
        $threshold = (int) $this->option('threshold');
        $size = Redis::llen('queues:default');

        if ($size >= $threshold) {
            Log::critical('Queue backlog detected, restarting workers', [
                'queue_size' => $size,
                'threshold' => $threshold,
            ]);

            $this->warn("Queue has {$size} pending jobs — restarting workers...");
            $this->call('queue:restart');

            app(OneSignalService::class)->sendToExternalUser(
                1,
                'Queue Auto-Restart',
                "Queue tenía {$size} jobs acumulados. Workers reiniciados.",
                ['type' => 'queue_alert', 'queue_size' => (string) $size]
            );

            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}

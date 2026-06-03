<?php

namespace App\Events;

use App\Models\Thread;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ThreadUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Thread $thread,
        public int $mailboxId,
    ) {}

    public function broadcastAs(): string
    {
        return 'ThreadUpdated';
    }

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("mailbox.{$this->mailboxId}"),
        ];
    }

    public function broadcastWith(): array
    {
        return [
            'thread' => [
                'id' => $this->thread->id,
                'subject' => $this->thread->subject,
                'snippet' => $this->thread->snippet,
                'last_message_at' => $this->thread->last_message_at?->toIso8601String(),
                'message_count' => $this->thread->message_count,
            ],
        ];
    }
}

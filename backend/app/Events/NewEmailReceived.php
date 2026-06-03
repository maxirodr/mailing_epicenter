<?php

namespace App\Events;

use App\Models\Email;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class NewEmailReceived implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Email $email,
        public int $mailboxId,
    ) {}

    public function broadcastAs(): string
    {
        return 'NewEmailReceived';
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
            'email' => [
                'id' => $this->email->id,
                'thread_id' => $this->email->thread_id,
                'from_address' => $this->email->from_address,
                'from_name' => $this->email->from_name,
                'subject' => $this->email->subject,
                'snippet' => $this->email->thread?->snippet,
                'category' => $this->email->thread?->category ?? 'primary',
                'sent_at' => $this->email->sent_at?->toIso8601String(),
            ],
        ];
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Email extends Model
{
    protected $fillable = [
        'thread_id',
        'mailbox_id',
        'message_id',
        'in_reply_to',
        'references_header',
        'from_address',
        'from_name',
        'to_addresses',
        'cc_addresses',
        'bcc_addresses',
        'subject',
        'html_body',
        'text_body',
        'direction',
        'is_draft',
        'resend_email_id',
        'sent_at',
        'scheduled_at',
        'list_unsubscribe',
        'list_id',
        'spam_score',
        'auth_results',
    ];

    protected function casts(): array
    {
        return [
            'to_addresses' => 'array',
            'cc_addresses' => 'array',
            'bcc_addresses' => 'array',
            'is_draft' => 'boolean',
            'sent_at' => 'datetime',
            'scheduled_at' => 'datetime',
        ];
    }

    public function thread(): BelongsTo
    {
        return $this->belongsTo(Thread::class);
    }

    public function mailbox(): BelongsTo
    {
        return $this->belongsTo(Mailbox::class);
    }

    public function attachments(): HasMany
    {
        return $this->hasMany(Attachment::class);
    }
}

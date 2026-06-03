<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AutoReply extends Model
{
    protected $fillable = [
        'mailbox_id',
        'enabled',
        'subject',
        'message',
        'start_date',
        'end_date',
    ];

    protected $casts = [
        'enabled' => 'boolean',
        'start_date' => 'date',
        'end_date' => 'date',
    ];

    public function mailbox(): BelongsTo
    {
        return $this->belongsTo(Mailbox::class);
    }
}

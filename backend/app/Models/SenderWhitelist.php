<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SenderWhitelist extends Model
{
    protected $table = 'sender_whitelist';

    protected $fillable = [
        'mailbox_id',
        'user_id',
        'from_address',
    ];

    public static function isTrusted(int $mailboxId, string $fromAddress): bool
    {
        return self::where('mailbox_id', $mailboxId)
            ->where('from_address', strtolower($fromAddress))
            ->exists();
    }
}

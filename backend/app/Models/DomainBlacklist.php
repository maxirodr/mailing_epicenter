<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class DomainBlacklist extends Model
{
    protected $table = 'domain_blacklist';

    protected $fillable = [
        'mailbox_id',
        'user_id',
        'domain',
        'spam_count',
    ];

    private const PROTECTED_DOMAINS = [
        'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
        'yahoo.com', 'yahoo.com.ar', 'icloud.com', 'me.com', 'mac.com',
        'protonmail.com', 'proton.me', 'aol.com', 'zoho.com',
    ];

    public static function isBlocked(int $mailboxId, string $fromAddress): bool
    {
        $domain = strtolower(explode('@', $fromAddress)[1] ?? '');
        if (!$domain || in_array($domain, self::PROTECTED_DOMAINS, true)) {
            return false;
        }

        return self::where('mailbox_id', $mailboxId)
            ->where('domain', $domain)
            ->where('spam_count', '>=', 3)
            ->exists();
    }

    public static function incrementForSender(int $mailboxId, int $userId, string $fromAddress): void
    {
        $domain = strtolower(explode('@', $fromAddress)[1] ?? '');
        if (!$domain) {
            return;
        }

        $entry = self::firstOrCreate(
            ['mailbox_id' => $mailboxId, 'user_id' => $userId, 'domain' => $domain],
            ['spam_count' => 0]
        );

        $entry->increment('spam_count');
    }

    public static function decrementForSender(int $mailboxId, int $userId, string $fromAddress): void
    {
        $domain = strtolower(explode('@', $fromAddress)[1] ?? '');
        if (!$domain) {
            return;
        }

        $entry = self::where('mailbox_id', $mailboxId)
            ->where('user_id', $userId)
            ->where('domain', $domain)
            ->first();

        if ($entry && $entry->spam_count > 0) {
            $entry->decrement('spam_count');
        }
    }
}

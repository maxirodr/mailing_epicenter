<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('mailbox.{mailboxId}', function ($user, $mailboxId) {
    return $user->mailboxes()->where('mailboxes.id', $mailboxId)->exists();
});

Broadcast::channel('user.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

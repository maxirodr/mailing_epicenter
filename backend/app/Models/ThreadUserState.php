<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ThreadUserState extends Model
{
    protected $table = 'thread_user_states';

    protected $fillable = [
        'thread_id',
        'user_id',
        'is_read',
        'is_starred',
        'is_trashed',
        'is_spam',
    ];

    protected function casts(): array
    {
        return [
            'is_read' => 'boolean',
            'is_starred' => 'boolean',
            'is_trashed' => 'boolean',
            'is_spam' => 'boolean',
        ];
    }

    public function thread(): BelongsTo
    {
        return $this->belongsTo(Thread::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

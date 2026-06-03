<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Mailbox extends Model
{
    protected $fillable = [
        'address',
        'domain',
        'display_name',
        'signature',
        'avatar_url',
    ];

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'mailbox_user')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function threads(): HasMany
    {
        return $this->hasMany(Thread::class);
    }

    public function labels(): HasMany
    {
        return $this->hasMany(Label::class);
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class);
    }

    public function autoReply(): HasOne
    {
        return $this->hasOne(AutoReply::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Passkey extends Model
{
    protected $fillable = [
        'user_id',
        'name',
        'credential_id',
        'public_key',
        'counter',
        'transports',
        'aaguid',
    ];

    protected function casts(): array
    {
        return [
            'transports' => 'array',
            'counter' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

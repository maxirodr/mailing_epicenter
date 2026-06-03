<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Attachment extends Model
{
    protected $fillable = [
        'email_id',
        'filename',
        'content_type',
        'size',
        'r2_key',
        'r2_url',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
        ];
    }

    public function email(): BelongsTo
    {
        return $this->belongsTo(Email::class);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class UnmatchedEmail extends Model
{
    protected $fillable = [
        'from_address',
        'to_addresses',
        'subject',
        'raw_payload',
    ];

    protected function casts(): array
    {
        return [
            'to_addresses' => 'array',
            'raw_payload' => 'array',
        ];
    }
}

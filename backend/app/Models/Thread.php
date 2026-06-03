<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Thread extends Model
{
    /**
     * Generate a clean text snippet from HTML or plain text email content.
     * Strips style/script blocks, HTML tags, decodes entities, collapses whitespace.
     */
    public static function makeSnippet(?string $html, ?string $text = null, int $limit = 200): string
    {
        $source = $html ?? $text ?? '';
        if ($source === '') return '';

        // Remove style and script blocks (strip_tags leaves their text content)
        $clean = preg_replace('/<(style|script)[^>]*>.*?<\/\1>/si', '', $source);
        // Strip remaining HTML tags
        $clean = strip_tags($clean);
        // Decode HTML entities (&nbsp; &lt; etc.)
        $clean = html_entity_decode($clean, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        // Collapse whitespace
        $clean = preg_replace('/\s+/', ' ', $clean);

        return Str::limit(trim($clean), $limit);
    }
    protected $fillable = [
        'mailbox_id',
        'subject',
        'snippet',
        'last_message_at',
        'message_count',
        'category',
    ];

    protected function casts(): array
    {
        return [
            'last_message_at' => 'datetime',
            'message_count' => 'integer',
        ];
    }

    public function mailbox(): BelongsTo
    {
        return $this->belongsTo(Mailbox::class);
    }

    public function emails(): HasMany
    {
        return $this->hasMany(Email::class);
    }

    public function threadUserStates(): HasMany
    {
        return $this->hasMany(ThreadUserState::class);
    }

    public function labels(): BelongsToMany
    {
        return $this->belongsToMany(Label::class, 'thread_label')
            ->withTimestamps();
    }

    public function currentUserState(): HasMany
    {
        return $this->hasMany(ThreadUserState::class)
            ->where('user_id', auth()->id());
    }

    public function latestEmail(): HasOne
    {
        return $this->hasOne(Email::class)->latestOfMany('sent_at');
    }
}

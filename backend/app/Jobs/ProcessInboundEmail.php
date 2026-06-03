<?php

namespace App\Jobs;

use App\Events\NewEmailReceived;
use App\Models\Attachment;
use App\Models\DomainBlacklist;
use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\SenderBlacklist;
use App\Models\SenderWhitelist;
use App\Models\Thread;
use App\Models\ThreadUserState;
use App\Services\EmailClassifier;
use App\Services\SpamDetector;
use App\Services\OneSignalService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\RateLimited;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessInboundEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    public function __construct(
        public array $payload
    ) {}

    public function middleware(): array
    {
        return [new RateLimited('resend-api')];
    }

    public function handle(): void
    {
        $data = $this->payload['data'] ?? $this->payload;

        // Use body from webhook payload first, fallback to API fetch if missing
        $emailContent = [
            'html' => $data['html'] ?? null,
            'text' => $data['text'] ?? null,
            'headers' => $data['headers'] ?? [],
        ];

        // If webhook didn't include body, try fetching via Resend API
        if (empty($emailContent['html']) && empty($emailContent['text'])) {
            $emailContent = $this->fetchEmailContent($data['email_id'] ?? null);
        }

        $toAddresses = $this->extractAddresses($data['to'] ?? []);
        $mailbox = $this->findMailbox($toAddresses);

        if (! $mailbox) {
            $rawFrom = $data['from'] ?? '';
            $unmatchedFrom = 'unknown';
            if (is_array($rawFrom)) {
                $unmatchedFrom = $rawFrom['email'] ?? $rawFrom['address'] ?? 'unknown';
            } elseif (is_string($rawFrom)) {
                if (preg_match('/<(.+?)>/', $rawFrom, $m)) {
                    $unmatchedFrom = $m[1];
                } else {
                    $unmatchedFrom = $rawFrom ?: 'unknown';
                }
            }

            \App\Models\UnmatchedEmail::create([
                'from_address' => $unmatchedFrom,
                'to_addresses' => $toAddresses,
                'subject' => $data['subject'] ?? null,
                'raw_payload' => $data,
            ]);

            Log::info('Inbound email stored as unmatched', ['to' => $toAddresses]);

            return;
        }

        $fromAddress = $data['from'] ?? '';
        $fromName = null;

        if (is_array($fromAddress)) {
            $fromName = $fromAddress['name'] ?? null;
            $fromAddress = $fromAddress['email'] ?? $fromAddress['address'] ?? '';
        } elseif (is_string($fromAddress) && preg_match('/^(.+?)\s*<(.+?)>$/', $fromAddress, $matches)) {
            $fromName = trim($matches[1], '" ');
            $fromAddress = $matches[2];
        }
        // Decode MIME encoded-words in from_name (e.g. =?UTF-8?Q?...?=)
        if ($fromName) {
            $fromName = $this->decodeMimeHeader($fromName);
        }

        $subject = $this->decodeMimeHeader($data['subject'] ?? '(No Subject)');
        $contentHeaders = $emailContent['headers'] ?? [];
        $messageId = $data['message_id'] ?? ($contentHeaders['message-id'] ?? ($data['headers']['message-id'] ?? null));
        $inReplyTo = $data['in_reply_to'] ?? ($contentHeaders['in-reply-to'] ?? ($data['headers']['in-reply-to'] ?? null));
        $references = $data['references'] ?? ($contentHeaders['references'] ?? ($data['headers']['references'] ?? null));
        $listUnsubscribe = $data['headers']['list-unsubscribe'] ?? ($contentHeaders['list-unsubscribe'] ?? null);
        $listId = $data['headers']['list-id'] ?? ($contentHeaders['list-id'] ?? null);
        $authResults = $data['headers']['authentication-results'] ?? ($contentHeaders['authentication-results'] ?? null);

        $messageId = $this->normalizeMessageId($messageId);
        $inReplyTo = $this->normalizeMessageId($inReplyTo);
        $referenceList = $this->normalizeReferences($references);

        $thread = $this->resolveThread($mailbox, $messageId, $inReplyTo, $referenceList, $subject, $fromAddress, $toAddresses);

        // Extract inline data URI images before sanitizing — saves them to R2
        // and replaces src with R2 URLs so sanitizeHtml won't strip them
        $rawHtml = $emailContent['html'] ?? null;
        $inlineAttachments = [];
        $rawHtml = $this->extractInlineDataImages($rawHtml, $inlineAttachments);

        $email = Email::create([
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
            'message_id' => $messageId,
            'in_reply_to' => $inReplyTo,
            'references_header' => $referenceList ? implode(' ', array_map(fn ($r) => '<' . $r . '>', $referenceList)) : null,
            'from_address' => $fromAddress,
            'from_name' => $fromName,
            'to_addresses' => $toAddresses,
            'cc_addresses' => $this->extractAddresses($data['cc'] ?? []),
            'bcc_addresses' => $this->extractAddresses($data['bcc'] ?? []),
            'subject' => $subject,
            'html_body' => $this->sanitizeHtml($rawHtml),
            'text_body' => $emailContent['text'] ?? null,
            'direction' => 'inbound',
            'is_draft' => false,
            'sent_at' => isset($data['created_at']) ? \Carbon\Carbon::parse($data['created_at']) : now(),
            'list_unsubscribe' => $listUnsubscribe,
            'list_id' => $listId,
            'spam_score' => SenderBlacklist::isBlocked($mailbox->id, $fromAddress)
                ? 100
                : (DomainBlacklist::isBlocked($mailbox->id, $fromAddress)
                    ? 100
                    : (SenderWhitelist::isTrusted($mailbox->id, $fromAddress)
                        ? 0
                        : app(SpamDetector::class)->score([
                        'authentication_results' => $authResults,
                        'from_address' => $fromAddress,
                        'message_id' => $messageId,
                        'subject' => $subject,
                        'html_body' => $emailContent['html'] ?? null,
                        'text_body' => $emailContent['text'] ?? null,
                        'list_id' => $listId,
                        'list_unsubscribe' => $listUnsubscribe,
                    ]))),
            'auth_results' => $authResults,
        ]);

        // Save inline image attachment records
        foreach ($inlineAttachments as $inlineAtt) {
            Attachment::create([
                'email_id' => $email->id,
                'filename' => $inlineAtt['filename'],
                'content_type' => $inlineAtt['content_type'],
                'size' => $inlineAtt['size'],
                'r2_key' => $inlineAtt['r2_key'],
                'r2_url' => $inlineAtt['r2_url'],
            ]);
        }

        $this->processAttachments($email, $data['attachments'] ?? [], $data['email_id'] ?? null);

        // Spam gate: auto-flag high-score emails
        if ($email->spam_score >= 50) {
            $spamLabel = Label::where('mailbox_id', $mailbox->id)
                ->where('name', 'SPAM')
                ->where('type', 'system')
                ->first();

            if ($spamLabel) {
                $thread->labels()->syncWithoutDetaching([$spamLabel->id]);
            }

            $thread->update([
                'snippet' => Thread::makeSnippet($emailContent['html'] ?? null, $emailContent['text'] ?? null),
                'last_message_at' => $email->sent_at ?? now(),
                'message_count' => $thread->emails()->count(),
            ]);

            $mailboxUserIds = $mailbox->users()->pluck('users.id');
            foreach ($mailboxUserIds as $userId) {
                ThreadUserState::updateOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_read' => false, 'is_starred' => false, 'is_trashed' => false, 'is_spam' => true]
                );
            }

            NewEmailReceived::dispatch($email, $mailbox->id);

            Log::info('Inbound email flagged as spam', [
                'email_id' => $email->id,
                'thread_id' => $thread->id,
                'spam_score' => $email->spam_score,
            ]);

            return;
        }

        // Classify new thread
        if ($thread->wasRecentlyCreated) {
            $category = app(EmailClassifier::class)->classifyWithOverrides([
                'from_address' => $fromAddress,
                'subject' => $subject,
                'list_unsubscribe' => $listUnsubscribe,
                'list_id' => $listId,
            ], $mailbox->id);
            $thread->update(['category' => $category]);
        }

        $inboxLabel = Label::where('mailbox_id', $mailbox->id)
            ->where('name', 'INBOX')
            ->where('type', 'system')
            ->first();

        if ($inboxLabel) {
            $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
        }

        $thread->update([
            'snippet' => Thread::makeSnippet($emailContent['html'] ?? null, $emailContent['text'] ?? null),
            'last_message_at' => $email->sent_at ?? now(),
            'message_count' => $thread->emails()->count(),
        ]);

        $mailboxUserIds = $mailbox->users()->pluck('users.id');

        foreach ($mailboxUserIds as $userId) {
            $state = ThreadUserState::firstOrCreate(
                ['thread_id' => $thread->id, 'user_id' => $userId],
                ['is_read' => false, 'is_starred' => false, 'is_trashed' => false, 'is_spam' => false]
            );

            if (! $state->wasRecentlyCreated) {
                $state->update(['is_read' => false]);
            }
        }

        // Auto-reply check
        $autoReply = $mailbox->autoReply;
        if ($autoReply && $autoReply->enabled) {
            $now = now()->toDateString();
            $inRange = (! $autoReply->start_date || $now >= $autoReply->start_date->toDateString())
                && (! $autoReply->end_date || $now <= $autoReply->end_date->toDateString());

            if ($inRange) {
                $cacheKey = "auto_reply_{$mailbox->id}_{$fromAddress}_" . now()->toDateString();
                if (! Cache::has($cacheKey)) {
                    Cache::put($cacheKey, true, now()->endOfDay());

                    try {
                        $resend = \Resend::client(config('services.resend.key'));
                        $resend->emails->send([
                            'from' => "{$mailbox->display_name} <{$mailbox->address}@{$mailbox->domain}>",
                            'to' => [$fromAddress],
                            'subject' => $autoReply->subject,
                            'html' => $autoReply->message,
                        ]);
                    } catch (\Exception $e) {
                        Log::warning('Failed to send auto-reply', [
                            'mailbox_id' => $mailbox->id,
                            'to' => $fromAddress,
                            'error' => $e->getMessage(),
                        ]);
                    }
                }
            }
        }

        NewEmailReceived::dispatch($email, $mailbox->id);

        // Send push notifications to users who have this category enabled
        $pushTitle = $email->from_name ?: $email->from_address;
        $pushBody = $email->subject;
        $plainText = Thread::makeSnippet($email->html_body, $email->text_body, 150);
        if ($plainText) {
            $pushBody .= "\n" . $plainText;
        }

        $pushData = [
            'type' => 'new_email',
            'email_id' => $email->id,
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
        ];

        $onesignal = app(OneSignalService::class);
        if ($onesignal->isConfigured()) {
            $mailboxUsers = $mailbox->users()->with('preferences')->get();
            $defaultCategories = ['primary', 'updates'];

            foreach ($mailboxUsers as $mbUser) {
                $userCategories = $mbUser->preferences?->preferences['notification_categories'] ?? $defaultCategories;
                if (in_array($thread->category, $userCategories)) {
                    $onesignal->sendToExternalUser($mbUser->id, $pushTitle, $pushBody, $pushData);
                }
            }
        }

        Log::info('Inbound email processed', [
            'email_id' => $email->id,
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
        ]);
    }

    private function fetchEmailContent(?string $emailId): array
    {
        if (! $emailId) {
            Log::warning('Inbound email missing email_id, cannot fetch content');
            return ['html' => null, 'text' => null];
        }

        try {
            $response = Http::withToken(config('services.resend.key'))
                ->timeout(15)
                ->get("https://api.resend.com/emails/receiving/{$emailId}");

            if ($response->successful()) {
                $content = $response->json();
                return [
                    'html' => $content['html'] ?? null,
                    'text' => $content['text'] ?? null,
                    'headers' => $content['headers'] ?? [],
                ];
            }

            Log::warning('Failed to fetch email content from Resend', [
                'email_id' => $emailId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        } catch (\Exception $e) {
            Log::error('Exception fetching email content from Resend', [
                'email_id' => $emailId,
                'error' => $e->getMessage(),
            ]);
        }

        return ['html' => null, 'text' => null];
    }

    private function fetchAttachmentDownloadUrls(?string $emailId): array
    {
        if (! $emailId) {
            return [];
        }

        try {
            // Resend API: GET /emails/receiving/{emailId}/attachments
            // Returns { data: [{ filename, download_url, expires_at }, ...] }
            $response = Http::withToken(config('services.resend.key'))
                ->timeout(30)
                ->get("https://api.resend.com/emails/receiving/{$emailId}/attachments");

            if ($response->successful()) {
                $data = $response->json();
                $attachments = $data['data'] ?? [];

                Log::info('Fetched attachment download URLs from Resend API', [
                    'resend_email_id' => $emailId,
                    'count' => count($attachments),
                ]);

                return $attachments;
            }

            Log::warning('Failed to fetch attachment URLs from Resend API', [
                'resend_email_id' => $emailId,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);
        } catch (\Exception $e) {
            Log::error('Exception fetching attachment URLs from Resend API', [
                'resend_email_id' => $emailId,
                'error' => $e->getMessage(),
            ]);
        }

        return [];
    }

    private function findMailbox(array $toAddresses): ?Mailbox
    {
        foreach ($toAddresses as $address) {
            $parts = explode('@', $address, 2);

            if (count($parts) !== 2) {
                continue;
            }

            $mailbox = Mailbox::where('address', $parts[0])
                ->where('domain', $parts[1])
                ->first();

            if ($mailbox) {
                return $mailbox;
            }
        }

        return null;
    }

    private function resolveThread(Mailbox $mailbox, ?string $messageId, ?string $inReplyTo, array $referenceList, string $subject, string $fromAddress, array $toAddresses): Thread
    {
        // Strategy A: Check In-Reply-To header (match with and without angle brackets — storage is historically inconsistent)
        if ($inReplyTo) {
            $existingEmail = Email::where('mailbox_id', $mailbox->id)
                ->whereIn('message_id', [$inReplyTo, '<' . $inReplyTo . '>'])
                ->first();

            if ($existingEmail) {
                return $existingEmail->thread;
            }
        }

        // Strategy B: Check References header
        if ($referenceList) {
            $candidates = [];
            foreach ($referenceList as $ref) {
                $candidates[] = $ref;
                $candidates[] = '<' . $ref . '>';
            }

            $existingEmail = Email::where('mailbox_id', $mailbox->id)
                ->whereIn('message_id', $candidates)
                ->latest()
                ->first();

            if ($existingEmail) {
                return $existingEmail->thread;
            }
        }

        // Strategy C: Create new thread (subject matching removed — too aggressive for notifications)
        return Thread::create([
            'mailbox_id' => $mailbox->id,
            'subject' => $subject,
            'snippet' => '',
            'last_message_at' => now(),
            'message_count' => 0,
        ]);
    }

    /**
     * Normalize a Message-ID so it includes the canonical surrounding angle brackets.
     * RFC 5322 message-ids are wrapped in <...>, but webhook payloads sometimes deliver them bare.
     */
    private function normalizeMessageId(?string $id): ?string
    {
        if ($id === null) {
            return null;
        }
        $id = trim($id);
        if ($id === '') {
            return null;
        }
        // Strip optional outer brackets/whitespace, then re-wrap.
        $stripped = trim($id, "<> \t\r\n");
        if ($stripped === '') {
            return null;
        }
        return '<' . $stripped . '>';
    }

    /**
     * Normalize the References header into a flat list of bare message-ids (no angle brackets).
     * Webhooks deliver this field in wildly varying shapes: PHP array, JSON-encoded string,
     * comma-separated string, or whitespace-separated string. Handle all of them.
     */
    private function normalizeReferences(mixed $references): array
    {
        if (empty($references)) {
            return [];
        }

        $items = [];
        if (is_array($references)) {
            $items = $references;
        } elseif (is_string($references)) {
            $trimmed = trim($references);
            if ($trimmed !== '' && ($trimmed[0] === '[' || $trimmed[0] === '{')) {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    $items = $decoded;
                }
            }
            if (! $items) {
                // RFC 5322 references are space-separated, but be lenient with commas too.
                $items = preg_split('/[\s,]+/', $trimmed) ?: [];
            }
        }

        $out = [];
        foreach ($items as $item) {
            if (! is_string($item)) {
                continue;
            }
            $clean = trim($item, "<> \t\r\n\"'");
            if ($clean !== '') {
                $out[] = $clean;
            }
        }
        return array_values(array_unique($out));
    }

    private function extractAddresses(mixed $addresses): array
    {
        if (is_string($addresses)) {
            // Decode MIME encoded-words first (=?UTF-8?Q?...?= or =?UTF-8?B?...?=)
            $addresses = $this->decodeMimeHeader($addresses);
            // Split on commas but respect quoted strings and angle brackets
            $parts = preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $addresses);
            $result = [];
            foreach ($parts as $part) {
                $result[] = $this->extractSingleAddress(trim($part));
            }
            return array_filter($result);
        }

        if (! is_array($addresses)) {
            return [];
        }

        $result = [];
        foreach ($addresses as $addr) {
            if (is_string($addr)) {
                $result[] = $this->extractSingleAddress($addr);
            } elseif (is_array($addr)) {
                $result[] = $addr['email'] ?? $addr['address'] ?? '';
            }
        }

        return array_filter($result);
    }

    private function extractSingleAddress(string $addr): string
    {
        // Decode MIME encoded-words
        $addr = $this->decodeMimeHeader($addr);
        // Extract email from "Name <email>" format
        if (preg_match('/<([^>]+)>/', $addr, $matches)) {
            return strtolower(trim($matches[1]));
        }
        // Extract bare email (might have name prefix)
        if (preg_match('/[\w.+-]+@[\w.-]+\.\w{2,}/', $addr, $matches)) {
            return strtolower(trim($matches[0]));
        }
        return strtolower(trim($addr));
    }

    private function extractInlineDataImages(?string $html, array &$attachments): ?string
    {
        if ($html === null) {
            return null;
        }

        // Match <img src="data:image/TYPE;base64,DATA"> and save to R2
        return preg_replace_callback(
            '/(<img\b[^>]*?)src\s*=\s*["\']?(data:(image\/([^;]+));base64,([^"\'>\s]+))["\']?/i',
            function (array $matches) use (&$attachments) {
                $imgTag = $matches[1];
                $contentType = $matches[3];
                $extension = $matches[4];
                $base64Data = $matches[5];

                $content = base64_decode($base64Data);
                if ($content === false || strlen($content) < 10) {
                    return $matches[0]; // Leave as-is if decode fails
                }

                $filename = 'inline-' . Str::random(8) . '.' . $extension;
                $key = 'attachments/' . Str::uuid() . '/' . $filename;

                try {
                    Storage::disk('r2')->put($key, $content, [
                        'ContentType' => $contentType,
                    ]);

                    $r2Url = Storage::disk('r2')->url($key);

                    $attachments[] = [
                        'filename' => $filename,
                        'content_type' => $contentType,
                        'size' => strlen($content),
                        'r2_key' => $key,
                        'r2_url' => $r2Url,
                    ];

                    return $imgTag . 'src="' . $r2Url . '"';
                } catch (\Exception $e) {
                    Log::warning('Failed to save inline image to R2', [
                        'error' => $e->getMessage(),
                    ]);
                    return $matches[0];
                }
            },
            $html
        );
    }

    private function sanitizeHtml(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        // Remove dangerous tags entirely (with their content)
        $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html);
        $html = preg_replace('/<iframe\b[^>]*>.*?<\/iframe>/is', '', $html);
        $html = preg_replace('/<object\b[^>]*>.*?<\/object>/is', '', $html);
        $html = preg_replace('/<embed\b[^>]*\/?\s*>/is', '', $html);
        $html = preg_replace('/<form\b[^>]*>.*?<\/form>/is', '', $html);

        // Remove event handler attributes (on*)
        $html = preg_replace('/\s+on\w+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);

        // Remove javascript: URLs in href and src
        $html = preg_replace('/href\s*=\s*["\']?\s*javascript:/i', 'href="', $html);
        $html = preg_replace('/src\s*=\s*["\']?\s*javascript:/i', 'src="', $html);

        // Strip data: URIs from img src (potential malware disguised as images)
        $html = preg_replace(
            '/(<img\b[^>]*?)src\s*=\s*["\']?\s*data:[^"\'\s>]+["\']?/i',
            '$1src="about:blank"',
            $html
        );

        return $html;
    }

    private function processAttachments(Email $email, array $webhookAttachments, ?string $resendEmailId = null): void
    {
        if (empty($webhookAttachments) && ! $resendEmailId) {
            return;
        }

        // If we have no resend_email_id and webhook payload has no inline content/url,
        // attachments cannot be fetched. Migration requires r2_key NOT NULL so we cannot
        // persist placeholders — log a detailed warning so operators notice instead of
        // failing silently at the end of the flow.
        if (! $resendEmailId) {
            $hasFetchable = false;
            foreach ($webhookAttachments as $whAtt) {
                if (isset($whAtt['content']) || isset($whAtt['url'])) {
                    $hasFetchable = true;
                    break;
                }
            }
            if (! $hasFetchable && ! empty($webhookAttachments)) {
                Log::warning('Cannot fetch attachments: webhook missing email_id and inline content', [
                    'email_id' => $email->id,
                    'attachment_count' => count($webhookAttachments),
                ]);
                return;
            }
        }

        // Per Resend docs: webhooks only include attachment metadata (id, filename,
        // content_type, content_disposition, content_id) — never the actual content.
        // We must call GET /emails/receiving/attachments?emailId={id} to get download URLs.
        $downloadableAttachments = $this->fetchAttachmentDownloadUrls($resendEmailId);

        // Build a lookup by filename for merging webhook metadata with API download URLs
        $downloadMap = [];
        foreach ($downloadableAttachments as $dlAtt) {
            $downloadMap[$dlAtt['filename'] ?? ''] = $dlAtt;
        }

        // Merge: use webhook metadata for content_type/content_id, API for download_url
        $attachmentsToProcess = [];
        foreach ($webhookAttachments as $whAtt) {
            $filename = $whAtt['filename'] ?? 'unknown';
            $merged = array_merge($whAtt, $downloadMap[$filename] ?? []);
            $attachmentsToProcess[] = $merged;
            unset($downloadMap[$filename]);
        }
        // Add any API-only attachments not in webhook
        foreach ($downloadMap as $dlAtt) {
            $attachmentsToProcess[] = $dlAtt;
        }

        $cidMap = []; // content_id => r2_url for inline image replacement

        foreach ($attachmentsToProcess as $attachmentData) {
            $filename = $attachmentData['filename'] ?? 'unknown';
            $contentType = $attachmentData['content_type'] ?? 'application/octet-stream';
            $contentId = $attachmentData['content_id'] ?? null;
            $content = null;

            // Strategy 1: Download from Resend API download_url (preferred)
            if (isset($attachmentData['download_url'])) {
                $content = $this->downloadWithRetry($attachmentData['download_url'], $filename, $email->id);
            }

            // Strategy 2: Inline content (base64 encoded)
            if (! $content && isset($attachmentData['content'])) {
                $decoded = base64_decode($attachmentData['content'], true);
                if ($decoded === false) {
                    Log::warning('Failed to decode base64 attachment', [
                        'email_id' => $email->id,
                        'filename' => $filename,
                    ]);
                    $content = null;
                } else {
                    $content = $decoded;
                }
            }

            // Strategy 3: Direct URL download
            if (! $content && isset($attachmentData['url'])) {
                $content = $this->downloadWithRetry($attachmentData['url'], $filename, $email->id);
            }

            if (! $content) {
                // Migration requires r2_key NOT NULL so we cannot persist a placeholder
                // record — log at error level so this surfaces in alerting instead of
                // disappearing silently like the previous warning.
                Log::error('Failed to download attachment after all strategies, skipping', [
                    'filename' => $filename,
                    'email_id' => $email->id,
                    'resend_email_id' => $resendEmailId,
                    'has_download_url' => isset($attachmentData['download_url']),
                    'has_inline_content' => isset($attachmentData['content']),
                    'has_url' => isset($attachmentData['url']),
                    'keys' => array_keys($attachmentData),
                ]);
                continue;
            }

            // Validate image attachments: check magic bytes match claimed Content-Type
            if (str_starts_with($contentType, 'image/') && !$this->isValidImage($content)) {
                Log::warning('Attachment claims image type but failed magic byte validation', [
                    'filename' => $filename,
                    'content_type' => $contentType,
                    'email_id' => $email->id,
                ]);

                continue;
            }

            $key = 'attachments/' . Str::uuid() . '/' . $filename;

            try {
                Storage::disk('r2')->put($key, $content, [
                    'ContentType' => $contentType,
                ]);

                $r2Url = Storage::disk('r2')->url($key);

                Attachment::create([
                    'email_id' => $email->id,
                    'filename' => $filename,
                    'content_type' => $contentType,
                    'size' => strlen($content),
                    'r2_key' => $key,
                    'r2_url' => $r2Url,
                ]);

                // Track inline images for CID replacement
                if ($contentId) {
                    $normalizedCid = trim($contentId, '<> ');
                    $cidMap[$normalizedCid] = $r2Url;
                }
            } catch (\Exception $e) {
                Log::error('Failed to persist inbound attachment', [
                    'email_id' => $email->id,
                    'filename' => $filename,
                    'error' => $e->getMessage(),
                ]);
                continue;
            }
        }

        // Replace cid: references in HTML with R2 URLs for inline images
        if (! empty($cidMap) && $email->html_body) {
            $html = $email->html_body;
            foreach ($cidMap as $normalizedCid => $url) {
                $html = preg_replace(
                    '/cid:\s*<?' . preg_quote($normalizedCid, '/') . '>?/i',
                    $url,
                    $html
                );
            }
            if ($html !== $email->html_body) {
                $email->update(['html_body' => $html]);
            }
        }
    }

    private function downloadWithRetry(string $url, string $filename, int $emailId): ?string
    {
        for ($attempt = 1; $attempt <= 3; $attempt++) {
            try {
                $response = Http::timeout(30)->get($url);
                if ($response->successful()) {
                    return $response->body();
                }
                Log::warning('Attachment download failed', [
                    'filename' => $filename,
                    'attempt' => $attempt,
                    'status' => $response->status(),
                    'email_id' => $emailId,
                ]);
            } catch (\Exception $e) {
                Log::warning('Attachment download exception', [
                    'filename' => $filename,
                    'attempt' => $attempt,
                    'error' => $e->getMessage(),
                    'email_id' => $emailId,
                ]);
            }
            if ($attempt < 3) {
                sleep($attempt * 2);
            }
        }
        return null;
    }

    private function decodeMimeHeader(string $header): string
    {
        // Unfold RFC 2822 header folding (CRLF or LF followed by whitespace)
        $header = preg_replace('/\r?\n[\t ]+/', ' ', $header);

        // If no MIME encoded-words, return as-is
        if (! str_contains($header, '=?')) {
            return $header;
        }

        // Try iconv_mime_decode first (handles more charsets reliably)
        if (function_exists('iconv_mime_decode')) {
            $decoded = @iconv_mime_decode($header, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if ($decoded !== false && ! str_contains($decoded, '?')) {
                return $decoded;
            }
        }

        // Manual decode: match =?charset?encoding?text?= patterns
        $decoded = preg_replace_callback(
            '/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/',
            function (array $matches) {
                $charset = $matches[1];
                $encoding = strtoupper($matches[2]);
                $text = $matches[3];

                if ($encoding === 'B') {
                    $text = base64_decode($text);
                } elseif ($encoding === 'Q') {
                    $text = quoted_printable_decode(str_replace('_', ' ', $text));
                }

                if ($text === false) {
                    return $matches[0];
                }

                $normalized = strtoupper(str_replace(['iso_', 'iso-'], ['ISO', 'ISO-'], $charset));
                if ($normalized !== 'UTF-8') {
                    $converted = @mb_convert_encoding($text, 'UTF-8', $charset);
                    if ($converted !== false) {
                        return $converted;
                    }
                }

                return $text;
            },
            $header
        );

        // Remove whitespace between consecutive encoded-words (RFC 2047)
        $decoded = preg_replace('/\?=\s+=\?/', '?==?', $decoded);

        return $decoded;
    }

    private function isValidImage(string $content): bool
    {
        $header = substr($content, 0, 16);

        // JPEG: FF D8 FF
        if (str_starts_with($header, "\xFF\xD8\xFF")) return true;
        // PNG: 89 50 4E 47
        if (str_starts_with($header, "\x89PNG")) return true;
        // GIF87a / GIF89a
        if (str_starts_with($header, 'GIF87a') || str_starts_with($header, 'GIF89a')) return true;
        // WebP: RIFF....WEBP
        if (str_starts_with($header, 'RIFF') && substr($header, 8, 4) === 'WEBP') return true;
        // BMP: BM
        if (str_starts_with($header, 'BM')) return true;
        // ICO: 00 00 01 00
        if (str_starts_with($header, "\x00\x00\x01\x00")) return true;

        return false;
    }
}

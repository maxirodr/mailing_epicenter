<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use App\Models\ThreadUserState;
use App\Services\EmailClassifier;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ImportMboxCommand extends Command
{
    protected $signature = 'mail:import-mbox
                            {file : Path to the .mbox file}
                            {--addresses= : Comma-separated email addresses to import}
                            {--user-id=1 : User ID to assign to mailboxes}
                            {--dry-run : Count matching emails without importing}
                            {--limit=0 : Limit number of emails to import (0 = no limit)}
                            {--skip-duplicates : Skip emails with existing message_id}
                            {--with-attachments : Also extract and upload attachments to R2}
                            {--attachments-only : Only process attachments for already-imported emails}';

    protected $description = 'Import emails from a Google Takeout .mbox file';

    private array $targetAddresses = [];
    private array $mailboxCache = [];
    private array $labelCache = [];
    private int $imported = 0;
    private int $skipped = 0;
    private int $errors = 0;
    private int $attachmentsUploaded = 0;
    private int $attachmentsSkipped = 0;
    private int $userId;
    private bool $withAttachments = false;
    private bool $attachmentsOnly = false;
    private EmailClassifier $classifier;

    public function handle(): int
    {
        $file = $this->argument('file');
        $addresses = $this->option('addresses');
        $dryRun = $this->option('dry-run');
        $limit = (int) $this->option('limit');
        $this->userId = (int) $this->option('user-id');
        $this->withAttachments = (bool) $this->option('with-attachments');
        $this->attachmentsOnly = (bool) $this->option('attachments-only');
        $this->classifier = new EmailClassifier();

        if (! file_exists($file)) {
            $this->error("File not found: {$file}");
            return 1;
        }

        if (! $addresses) {
            $this->error('--addresses is required');
            return 1;
        }

        $this->targetAddresses = array_map('strtolower', array_map('trim', explode(',', $addresses)));

        $this->info('Target addresses: '.implode(', ', $this->targetAddresses));
        $this->info('File: '.$file);
        $this->info('File size: '.$this->formatBytes(filesize($file)));
        $mode = $dryRun ? 'DRY RUN' : ($this->attachmentsOnly ? 'ATTACHMENTS ONLY' : 'IMPORT');
        if ($this->withAttachments && ! $dryRun && ! $this->attachmentsOnly) {
            $mode .= ' + ATTACHMENTS';
        }
        $this->info("Mode: {$mode}");
        $this->newLine();

        if (! $dryRun) {
            $this->setupMailboxes();
        }

        $handle = fopen($file, 'r');
        if (! $handle) {
            $this->error('Cannot open file');
            return 1;
        }

        $rawMessage = '';
        $messageCount = 0;
        $matched = 0;
        $bytesRead = 0;
        $fileSize = filesize($file);
        $lastProgress = -1;

        $this->info('Scanning mbox file...');
        $bar = $this->output->createProgressBar(100);
        $bar->start();

        while (($line = fgets($handle)) !== false) {
            $bytesRead += strlen($line);

            $progress = (int) (($bytesRead / $fileSize) * 100);
            if ($progress > $lastProgress) {
                $bar->setProgress(min($progress, 100));
                $lastProgress = $progress;
            }

            // Mbox message boundary: line starting with "From " after content
            if (str_starts_with($line, 'From ') && $rawMessage !== '') {
                $messageCount++;

                if ($this->processRawMessage($rawMessage, $dryRun)) {
                    $matched++;
                    if ($limit > 0 && $matched >= $limit) {
                        break;
                    }
                }

                $rawMessage = '';

                continue;
            }

            $rawMessage .= $line;
        }

        // Process last message
        if ($rawMessage !== '') {
            $messageCount++;
            if ($this->processRawMessage($rawMessage, $dryRun)) {
                $matched++;
            }
        }

        fclose($handle);
        $bar->finish();
        $this->newLine(2);

        $this->info("Total messages scanned: {$messageCount}");
        $this->info("Matching messages: {$matched}");

        if (! $dryRun) {
            if ($this->attachmentsOnly) {
                $this->info("Attachments uploaded: {$this->attachmentsUploaded}");
                $this->info("Emails without attachments: {$this->attachmentsSkipped}");
            } else {
                $this->info("Imported: {$this->imported}");
                $this->info("Skipped (duplicate): {$this->skipped}");
                if ($this->withAttachments) {
                    $this->info("Attachments uploaded: {$this->attachmentsUploaded}");
                }

                $this->updateThreadStats();
                $this->info('Thread stats updated.');
            }
            $this->info("Errors: {$this->errors}");
        }

        return 0;
    }

    private function processRawMessage(string $raw, bool $dryRun): bool
    {
        // Quick optimization: check if raw contains any target address before full parse
        $rawLower = strtolower($raw);
        $found = false;
        foreach ($this->targetAddresses as $addr) {
            if (str_contains($rawLower, $addr)) {
                $found = true;
                break;
            }
        }

        if (! $found) {
            return false;
        }

        // Parse headers only (up to first blank line)
        $headers = $this->parseHeaders($raw);

        // Check if any target address is in From, To, CC, Delivered-To
        $matchedAddress = $this->findMatchingAddress($headers);
        if (! $matchedAddress) {
            return false;
        }

        if ($dryRun) {
            return true;
        }

        try {
            if ($this->attachmentsOnly) {
                $this->processAttachmentsOnly($raw, $headers);
            } else {
                $this->importEmail($raw, $headers, $matchedAddress);
            }

            return true;
        } catch (\Exception $e) {
            $this->errors++;
            if ($this->errors <= 20) {
                $this->newLine();
                $this->warn('Error: '.Str::limit($e->getMessage(), 200));
            }

            return true;
        }
    }

    private function parseHeaders(string $raw): array
    {
        $headers = [];
        $headerSection = '';

        // Extract header section (everything before first blank line)
        $pos = strpos($raw, "\r\n\r\n");
        if ($pos === false) {
            $pos = strpos($raw, "\n\n");
        }

        $headerSection = $pos !== false ? substr($raw, 0, $pos) : $raw;

        // Unfold continuation lines (lines starting with whitespace)
        $headerSection = preg_replace('/\r?\n[ \t]+/', ' ', $headerSection);

        foreach (explode("\n", $headerSection) as $line) {
            $line = rtrim($line, "\r");
            if (preg_match('/^([A-Za-z0-9-]+):\s*(.*)$/', $line, $m)) {
                $key = strtolower($m[1]);
                $value = $m[2];
                // Some headers can appear multiple times
                if (isset($headers[$key])) {
                    if (! is_array($headers[$key])) {
                        $headers[$key] = [$headers[$key]];
                    }
                    $headers[$key][] = $value;
                } else {
                    $headers[$key] = $value;
                }
            }
        }

        return $headers;
    }

    private function findMatchingAddress(array $headers): ?string
    {
        // Collect all addresses from relevant headers
        $checkFields = ['from', 'to', 'cc', 'bcc', 'delivered-to', 'x-forwarded-to'];
        $allAddresses = [];

        foreach ($checkFields as $field) {
            if (isset($headers[$field])) {
                $val = is_array($headers[$field]) ? implode(', ', $headers[$field]) : $headers[$field];
                $allAddresses[] = strtolower($val);
            }
        }

        $combined = implode(' ', $allAddresses);

        foreach ($this->targetAddresses as $addr) {
            if (str_contains($combined, $addr)) {
                return $addr;
            }
        }

        return null;
    }

    private function importEmail(string $raw, array $headers, string $matchedAddress): void
    {
        $messageId = $this->getHeader($headers, 'message-id');
        if ($messageId) {
            $messageId = trim($messageId, '<> ');
        }

        // Skip duplicates
        if ($this->option('skip-duplicates') && $messageId) {
            if (Email::where('message_id', $messageId)->exists()) {
                $this->skipped++;
                return;
            }
        }

        // Determine which mailbox this belongs to
        $mailbox = $this->resolveMailbox($headers, $matchedAddress);
        if (! $mailbox) {
            $this->errors++;
            return;
        }

        // Parse email metadata
        $fromRaw = $this->getHeader($headers, 'from') ?? '';
        $fromAddress = $this->extractEmailAddress($fromRaw);
        $fromName = $this->extractDisplayName($fromRaw);

        $toRaw = $this->getHeader($headers, 'to') ?? '';
        $toAddresses = $this->extractMultipleAddresses($toRaw);

        $ccRaw = $this->getHeader($headers, 'cc') ?? '';
        $ccAddresses = $this->extractMultipleAddresses($ccRaw);

        $subject = $this->getHeader($headers, 'subject') ?? '(No Subject)';
        $subject = $this->decodeMimeHeader($subject);
        $subject = mb_substr($subject, 0, 255);

        $inReplyTo = $this->getHeader($headers, 'in-reply-to');
        if ($inReplyTo) {
            $inReplyTo = trim($inReplyTo, '<> ');
        }

        $references = $this->getHeader($headers, 'references');
        $listUnsubscribe = $this->getHeader($headers, 'list-unsubscribe');
        $listId = $this->getHeader($headers, 'list-id');

        $dateStr = $this->getHeader($headers, 'date');
        $sentAt = $this->parseDate($dateStr);

        // Determine direction
        $direction = $this->isFromTargetAddress($fromAddress) ? 'outbound' : 'inbound';

        // Gmail labels
        $gmailLabels = $this->getHeader($headers, 'x-gmail-labels') ?? '';

        // Parse body
        $body = $this->parseBody($raw, $headers);

        // Resolve thread
        $thread = $this->resolveThread($mailbox, $messageId, $inReplyTo, $references, $subject, $fromAddress, $toAddresses, $sentAt);

        // Classify new thread
        if ($thread->wasRecentlyCreated) {
            $category = $this->classifier->classify([
                'from_address' => $fromAddress,
                'subject' => $subject,
                'list_unsubscribe' => $listUnsubscribe,
                'list_id' => $listId,
            ]);
            $thread->update(['category' => $category]);
        }

        $email = Email::create([
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
            'message_id' => $messageId,
            'in_reply_to' => $inReplyTo,
            'references_header' => $references,
            'from_address' => $fromAddress,
            'from_name' => $fromName ? $this->decodeMimeHeader($fromName) : null,
            'to_addresses' => $toAddresses,
            'cc_addresses' => $ccAddresses ?: null,
            'bcc_addresses' => null,
            'subject' => $subject,
            'html_body' => $this->sanitizeHtml($body['html'] ? mb_substr($this->sanitizeUtf8($body['html']), 0, 16_000_000) : null),
            'text_body' => $body['text'] ? mb_substr($this->sanitizeUtf8($body['text']), 0, 16_000_000) : null,
            'direction' => $direction,
            'is_draft' => false,
            'sent_at' => $sentAt,
            'list_unsubscribe' => $listUnsubscribe ? mb_substr($listUnsubscribe, 0, 500) : null,
            'list_id' => $listId ? mb_substr($listId, 0, 255) : null,
        ]);

        // Extract and upload attachments
        if ($this->withAttachments) {
            $this->extractAndUploadAttachments($raw, $headers, $email);
        }

        // Assign labels based on Gmail labels
        $this->assignLabels($thread, $mailbox, $gmailLabels, $direction);

        // Create thread user state
        $isRead = str_contains(strtolower($gmailLabels), 'unread') ? false : true;
        $isStarred = str_contains(strtolower($gmailLabels), 'starred');
        $isTrash = str_contains(strtolower($gmailLabels), 'trash');
        $isSpam = str_contains(strtolower($gmailLabels), 'spam');

        ThreadUserState::updateOrCreate(
            ['thread_id' => $thread->id, 'user_id' => $this->userId],
            [
                'is_read' => $isRead,
                'is_starred' => $isStarred,
                'is_trashed' => $isTrash,
                'is_spam' => $isSpam,
            ]
        );

        $this->imported++;
    }

    private function resolveMailbox(array $headers, string $matchedAddress): ?Mailbox
    {
        // Determine the mailbox: use the matched target address
        if (isset($this->mailboxCache[$matchedAddress])) {
            return $this->mailboxCache[$matchedAddress];
        }

        // Also check other target addresses in the headers (e.g., email sent FROM one account TO another)
        $fromAddr = strtolower($this->extractEmailAddress($this->getHeader($headers, 'from') ?? ''));
        $toAddrs = array_map('strtolower', $this->extractMultipleAddresses($this->getHeader($headers, 'to') ?? ''));

        // If FROM is a target address, that's the mailbox (outbound)
        if (in_array($fromAddr, $this->targetAddresses) && isset($this->mailboxCache[$fromAddr])) {
            return $this->mailboxCache[$fromAddr];
        }

        // If TO contains a target address, that's the mailbox (inbound)
        foreach ($toAddrs as $addr) {
            if (in_array($addr, $this->targetAddresses) && isset($this->mailboxCache[$addr])) {
                return $this->mailboxCache[$addr];
            }
        }

        return $this->mailboxCache[$matchedAddress] ?? null;
    }

    private function isFromTargetAddress(string $fromAddress): bool
    {
        return in_array(strtolower($fromAddress), $this->targetAddresses);
    }

    private function resolveThread(
        Mailbox $mailbox,
        ?string $messageId,
        ?string $inReplyTo,
        ?string $references,
        string $subject,
        string $fromAddress,
        array $toAddresses,
        ?Carbon $sentAt
    ): Thread {
        // Strategy A: In-Reply-To
        if ($inReplyTo) {
            $existing = Email::where('mailbox_id', $mailbox->id)
                ->where('message_id', $inReplyTo)
                ->first();
            if ($existing) {
                return $existing->thread;
            }
        }

        // Strategy B: References
        if ($references) {
            $refList = preg_split('/\s+/', $references);
            $refList = array_map(fn ($r) => trim($r, '<> '), $refList);
            $refList = array_filter($refList);

            if ($refList) {
                $existing = Email::where('mailbox_id', $mailbox->id)
                    ->whereIn('message_id', $refList)
                    ->latest()
                    ->first();
                if ($existing) {
                    return $existing->thread;
                }
            }
        }

        // Strategy C: Create new thread (subject matching removed — too aggressive for notifications)
        return Thread::create([
            'mailbox_id' => $mailbox->id,
            'subject' => $subject,
            'snippet' => '',
            'last_message_at' => $sentAt ?? now(),
            'message_count' => 0,
        ]);
    }

    private function parseBody(string $raw, array $headers): array
    {
        $result = ['html' => null, 'text' => null];

        // Split headers from body
        $bodyStart = strpos($raw, "\r\n\r\n");
        if ($bodyStart === false) {
            $bodyStart = strpos($raw, "\n\n");
        }
        if ($bodyStart === false) {
            return $result;
        }

        $body = substr($raw, $bodyStart + (strpos($raw, "\r\n\r\n") !== false ? 4 : 2));

        $contentType = $this->getHeader($headers, 'content-type') ?? 'text/plain';
        $contentTypeL = strtolower($contentType);
        $encoding = strtolower($this->getHeader($headers, 'content-transfer-encoding') ?? '7bit');

        // Multipart message
        if (str_contains($contentTypeL, 'multipart/')) {
            return $this->parseMultipart($body, $contentType);
        }

        // Simple message
        $decoded = $this->decodeContent($body, $encoding);
        $charset = $this->extractCharset($contentType);
        $decoded = $this->convertCharset($decoded, $charset);

        if (str_contains($contentTypeL, 'text/html')) {
            $result['html'] = $decoded;
        } else {
            $result['text'] = $decoded;
        }

        return $result;
    }

    private function parseMultipart(string $body, string $contentType): array
    {
        $result = ['html' => null, 'text' => null];

        $boundary = $this->extractBoundary($contentType);
        if (! $boundary) {
            return $result;
        }

        $parts = explode('--'.$boundary, $body);
        // First element is preamble, last might be epilogue (after --)
        array_shift($parts);

        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '--' || str_starts_with($part, '--')) {
                continue; // Closing boundary
            }

            // Split part headers from part body
            $partHeaderEnd = strpos($part, "\r\n\r\n");
            if ($partHeaderEnd === false) {
                $partHeaderEnd = strpos($part, "\n\n");
            }
            if ($partHeaderEnd === false) {
                continue;
            }

            $partHeaderStr = substr($part, 0, $partHeaderEnd);
            $partBody = substr($part, $partHeaderEnd + (strpos($part, "\r\n\r\n") !== false ? 4 : 2));

            $partHeaders = $this->parseHeaders($partHeaderStr);
            $partContentType = $this->getHeader($partHeaders, 'content-type') ?? 'text/plain';
            $partContentTypeL = strtolower($partContentType);
            $partEncoding = strtolower($this->getHeader($partHeaders, 'content-transfer-encoding') ?? '7bit');

            // Nested multipart
            if (str_contains($partContentTypeL, 'multipart/')) {
                $nested = $this->parseMultipart($partBody, $partContentType);
                if ($nested['html'] && ! $result['html']) {
                    $result['html'] = $nested['html'];
                }
                if ($nested['text'] && ! $result['text']) {
                    $result['text'] = $nested['text'];
                }

                continue;
            }

            // Skip attachments
            $disposition = strtolower($this->getHeader($partHeaders, 'content-disposition') ?? '');
            if (str_contains($disposition, 'attachment')) {
                continue;
            }

            $decoded = $this->decodeContent($partBody, $partEncoding);
            $charset = $this->extractCharset($partContentType);
            $decoded = $this->convertCharset($decoded, $charset);

            if (str_contains($partContentTypeL, 'text/html') && ! $result['html']) {
                $result['html'] = $decoded;
            } elseif (str_contains($partContentTypeL, 'text/plain') && ! $result['text']) {
                $result['text'] = $decoded;
            }
        }

        return $result;
    }

    private function decodeContent(string $content, string $encoding): string
    {
        return match ($encoding) {
            'base64' => base64_decode(preg_replace('/\s+/', '', $content)) ?: '',
            'quoted-printable' => quoted_printable_decode($content),
            default => $content,
        };
    }

    private function convertCharset(string $text, string $charset): string
    {
        if (! $charset || strtolower($charset) === 'utf-8') {
            return $this->sanitizeUtf8($text);
        }

        // Normalize common charset aliases
        $charsetMap = [
            'windows-1258' => 'windows-1252',
            'iso-8859-15' => 'ISO-8859-15',
            'x-mac-roman' => 'macintosh',
            'ks_c_5601-1987' => 'CP949',
        ];
        $normalized = $charsetMap[strtolower($charset)] ?? $charset;

        try {
            $converted = mb_convert_encoding($text, 'UTF-8', $normalized);
            return $converted ?: $this->sanitizeUtf8($text);
        } catch (\ValueError|\Exception) {
            // Fallback: try common encodings
            foreach (['windows-1252', 'ISO-8859-1', 'ASCII'] as $fallback) {
                try {
                    $converted = mb_convert_encoding($text, 'UTF-8', $fallback);
                    if ($converted) {
                        return $converted;
                    }
                } catch (\ValueError|\Exception) {
                    continue;
                }
            }
            return $this->sanitizeUtf8($text);
        }
    }

    private function sanitizeUtf8(string $text): string
    {
        // Remove invalid UTF-8 sequences
        $cleaned = mb_convert_encoding($text, 'UTF-8', 'UTF-8');
        if ($cleaned !== false) {
            return $cleaned;
        }
        // Nuclear option: strip anything non-UTF-8
        return preg_replace('/[\x80-\xFF]/', '', $text);
    }

    private function extractCharset(string $contentType): string
    {
        if (preg_match('/charset\s*=\s*"?([^";,\s]+)/i', $contentType, $m)) {
            return strtolower(trim($m[1], '"'));
        }

        return 'utf-8';
    }

    private function extractBoundary(string $contentType): ?string
    {
        if (preg_match('/boundary\s*=\s*"?([^";,\s]+)/i', $contentType, $m)) {
            return trim($m[1], '"');
        }

        return null;
    }

    private function extractEmailAddress(string $raw): string
    {
        if (preg_match('/<([^>]+)>/', $raw, $m)) {
            return strtolower(trim($m[1]));
        }

        return strtolower(trim($raw));
    }

    private function extractDisplayName(string $raw): ?string
    {
        if (preg_match('/^(.+?)\s*<[^>]+>/', $raw, $m)) {
            $name = trim($m[1], '" ');

            return $name ?: null;
        }

        return null;
    }

    private function extractMultipleAddresses(string $raw): array
    {
        if (! $raw) {
            return [];
        }

        $addresses = [];

        // Split by comma but respect quotes and angle brackets
        $parts = preg_split('/,(?=(?:[^"]*"[^"]*")*[^"]*$)/', $raw);

        foreach ($parts as $part) {
            $addr = $this->extractEmailAddress($part);
            if ($addr && str_contains($addr, '@')) {
                $addresses[] = $addr;
            }
        }

        return $addresses;
    }

    private function decodeMimeHeader(string $header): string
    {
        // Decode =?charset?encoding?text?= patterns
        $decoded = mb_decode_mimeheader($header);
        if ($decoded !== $header) {
            return $decoded;
        }

        // Fallback: manual decode for quoted-printable and base64 encoded words
        return preg_replace_callback(
            '/=\?([^?]+)\?(Q|B)\?([^?]+)\?=/i',
            function ($matches) {
                $charset = $matches[1];
                $encoding = strtoupper($matches[2]);
                $text = $matches[3];

                if ($encoding === 'B') {
                    $decoded = base64_decode($text);
                } else {
                    $decoded = quoted_printable_decode(str_replace('_', ' ', $text));
                }

                return $this->convertCharset($decoded, $charset);
            },
            $header
        );
    }

    private function getHeader(array $headers, string $key): ?string
    {
        $key = strtolower($key);
        if (! isset($headers[$key])) {
            return null;
        }

        return is_array($headers[$key]) ? $headers[$key][0] : $headers[$key];
    }

    private function parseDate(?string $dateStr): ?Carbon
    {
        if (! $dateStr) {
            return null;
        }

        try {
            return Carbon::parse($dateStr);
        } catch (\Exception) {
            // Try cleaning the date string
            $cleaned = preg_replace('/\s*\([^)]*\)\s*/', '', $dateStr);
            try {
                return Carbon::parse($cleaned);
            } catch (\Exception) {
                return null;
            }
        }
    }

    private function setupMailboxes(): void
    {
        $systemLabels = ['INBOX', 'SENT', 'DRAFTS', 'TRASH', 'SPAM', 'SCHEDULED'];

        foreach ($this->targetAddresses as $address) {
            $parts = explode('@', $address, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $mailbox = Mailbox::firstOrCreate(
                ['address' => $parts[0], 'domain' => $parts[1]],
                ['display_name' => $parts[0]]
            );

            // Attach user
            if (! $mailbox->users()->where('users.id', $this->userId)->exists()) {
                $mailbox->users()->attach($this->userId, ['role' => 'owner']);
            }

            // Create system labels
            foreach ($systemLabels as $labelName) {
                Label::firstOrCreate(
                    ['mailbox_id' => $mailbox->id, 'name' => $labelName, 'type' => 'system'],
                    ['sort_order' => array_search($labelName, $systemLabels)]
                );
            }

            $this->mailboxCache[$address] = $mailbox;

            // Cache labels
            $this->labelCache[$mailbox->id] = Label::where('mailbox_id', $mailbox->id)
                ->pluck('id', 'name')
                ->toArray();

            $this->info("Mailbox ready: {$address} (ID: {$mailbox->id})");
        }
    }

    private function assignLabels(Thread $thread, Mailbox $mailbox, string $gmailLabels, string $direction): void
    {
        $labels = array_map('trim', explode(',', $gmailLabels));
        $labelIds = [];

        foreach ($labels as $label) {
            $mapped = match (strtolower($label)) {
                'inbox' => 'INBOX',
                'sent', 'category sent' => 'SENT',
                'draft', 'drafts' => 'DRAFTS',
                'trash' => 'TRASH',
                'spam' => 'SPAM',
                default => null,
            };

            if ($mapped && isset($this->labelCache[$mailbox->id][$mapped])) {
                $labelIds[] = $this->labelCache[$mailbox->id][$mapped];
            }
        }

        // If no Gmail labels matched, assign based on direction
        if (empty($labelIds)) {
            $defaultLabel = $direction === 'outbound' ? 'SENT' : 'INBOX';
            if (isset($this->labelCache[$mailbox->id][$defaultLabel])) {
                $labelIds[] = $this->labelCache[$mailbox->id][$defaultLabel];
            }
        }

        if ($labelIds) {
            $thread->labels()->syncWithoutDetaching($labelIds);
        }
    }

    private function updateThreadStats(): void
    {
        $this->info('Updating thread statistics...');

        DB::statement('
            UPDATE threads t SET
                message_count = (SELECT COUNT(*) FROM emails WHERE thread_id = t.id),
                snippet = (
                    SELECT SUBSTRING(COALESCE(text_body, REGEXP_REPLACE(html_body, "<[^>]+>", ""), ""), 1, 200)
                    FROM emails
                    WHERE thread_id = t.id
                    ORDER BY sent_at DESC
                    LIMIT 1
                ),
                last_message_at = (
                    SELECT MAX(sent_at) FROM emails WHERE thread_id = t.id
                )
        ');
    }

    private function processAttachmentsOnly(string $raw, array $headers): void
    {
        $messageId = $this->getHeader($headers, 'message-id');
        if ($messageId) {
            $messageId = trim($messageId, '<> ');
        }

        if (! $messageId) {
            $this->attachmentsSkipped++;
            return;
        }

        $email = Email::where('message_id', $messageId)->first();
        if (! $email) {
            $this->attachmentsSkipped++;
            return;
        }

        // Skip if already has attachments
        if ($email->attachments()->exists()) {
            $this->attachmentsSkipped++;
            return;
        }

        $this->extractAndUploadAttachments($raw, $headers, $email);
    }

    private function extractAndUploadAttachments(string $raw, array $headers, Email $email): void
    {
        $contentType = $this->getHeader($headers, 'content-type') ?? 'text/plain';
        if (! str_contains(strtolower($contentType), 'multipart/')) {
            return;
        }

        $bodyStart = strpos($raw, "\r\n\r\n");
        if ($bodyStart === false) {
            $bodyStart = strpos($raw, "\n\n");
        }
        if ($bodyStart === false) {
            return;
        }

        $body = substr($raw, $bodyStart + (strpos($raw, "\r\n\r\n") !== false ? 4 : 2));
        $attachments = $this->collectAttachments($body, $contentType);

        foreach ($attachments as $att) {
            $this->uploadAttachment($email, $att);
        }
    }

    private function collectAttachments(string $body, string $contentType): array
    {
        $attachments = [];
        $boundary = $this->extractBoundary($contentType);
        if (! $boundary) {
            return $attachments;
        }

        $parts = explode('--'.$boundary, $body);
        array_shift($parts);

        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '--' || str_starts_with($part, '--')) {
                continue;
            }

            $partHeaderEnd = strpos($part, "\r\n\r\n");
            if ($partHeaderEnd === false) {
                $partHeaderEnd = strpos($part, "\n\n");
            }
            if ($partHeaderEnd === false) {
                continue;
            }

            $partHeaderStr = substr($part, 0, $partHeaderEnd);
            $partBody = substr($part, $partHeaderEnd + (strpos($part, "\r\n\r\n") !== false ? 4 : 2));
            $partHeaders = $this->parseHeaders($partHeaderStr);
            $partContentType = $this->getHeader($partHeaders, 'content-type') ?? 'text/plain';
            $partContentTypeL = strtolower($partContentType);

            // Recurse into nested multipart
            if (str_contains($partContentTypeL, 'multipart/')) {
                $nested = $this->collectAttachments($partBody, $partContentType);
                $attachments = array_merge($attachments, $nested);
                continue;
            }

            // Determine if this is an attachment
            $disposition = strtolower($this->getHeader($partHeaders, 'content-disposition') ?? '');
            $isAttachment = str_contains($disposition, 'attachment');

            // Also treat inline non-text parts as attachments (images, etc.)
            if (! $isAttachment && str_contains($disposition, 'inline') && ! str_contains($partContentTypeL, 'text/')) {
                $isAttachment = true;
            }

            // Skip if not attachment and is text
            if (! $isAttachment) {
                if (str_contains($partContentTypeL, 'text/plain') || str_contains($partContentTypeL, 'text/html')) {
                    continue;
                }
                // Non-text parts without disposition are likely attachments
                $isAttachment = true;
            }

            $filename = $this->extractAttachmentFilename($partHeaders);
            $encoding = strtolower($this->getHeader($partHeaders, 'content-transfer-encoding') ?? '7bit');
            $content = $this->decodeContent($partBody, $encoding);

            if (strlen($content) === 0) {
                continue;
            }

            // Extract MIME type (without parameters)
            $mimeType = $partContentTypeL;
            if (($semi = strpos($mimeType, ';')) !== false) {
                $mimeType = trim(substr($mimeType, 0, $semi));
            }

            $attachments[] = [
                'filename' => $filename,
                'content_type' => $mimeType,
                'content' => $content,
                'size' => strlen($content),
            ];
        }

        return $attachments;
    }

    private function extractAttachmentFilename(array $partHeaders): string
    {
        // Try Content-Disposition filename
        $disposition = $this->getHeader($partHeaders, 'content-disposition') ?? '';
        if (preg_match('/filename\*?=\s*(?:UTF-8\'\'|")?([^";,\r\n]+)/i', $disposition, $m)) {
            $name = trim($m[1], '"');
            $name = urldecode($name);
            return $this->decodeMimeHeader($name);
        }

        // Try Content-Type name
        $contentType = $this->getHeader($partHeaders, 'content-type') ?? '';
        if (preg_match('/name\*?=\s*(?:UTF-8\'\'|")?([^";,\r\n]+)/i', $contentType, $m)) {
            $name = trim($m[1], '"');
            $name = urldecode($name);
            return $this->decodeMimeHeader($name);
        }

        return 'attachment';
    }

    private function uploadAttachment(Email $email, array $att): void
    {
        $key = 'attachments/'.Str::uuid().'/'.$att['filename'];

        try {
            Storage::disk('r2')->put($key, $att['content'], [
                'ContentType' => $att['content_type'],
            ]);

            Attachment::create([
                'email_id' => $email->id,
                'filename' => $att['filename'],
                'content_type' => $att['content_type'],
                'size' => $att['size'],
                'r2_key' => $key,
                'r2_url' => Storage::disk('r2')->url($key),
            ]);

            $this->attachmentsUploaded++;
        } catch (\Exception $e) {
            $this->errors++;
            if ($this->errors <= 20) {
                $this->newLine();
                $this->warn("Attachment upload error ({$att['filename']}): ".Str::limit($e->getMessage(), 150));
            }
        }
    }

    private function sanitizeHtml(?string $html): ?string
    {
        if ($html === null) {
            return null;
        }

        $html = preg_replace('/<script\b[^>]*>.*?<\/script>/is', '', $html);
        $html = preg_replace('/<iframe\b[^>]*>.*?<\/iframe>/is', '', $html);
        $html = preg_replace('/<object\b[^>]*>.*?<\/object>/is', '', $html);
        $html = preg_replace('/<embed\b[^>]*\/?\s*>/is', '', $html);
        $html = preg_replace('/<form\b[^>]*>.*?<\/form>/is', '', $html);
        $html = preg_replace('/\s+on\w+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i', '', $html);
        $html = preg_replace('/href\s*=\s*["\']?\s*javascript:/i', 'href="', $html);

        return $html;
    }

    private function formatBytes(int $bytes): string
    {
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = 0;
        $size = $bytes;
        while ($size >= 1024 && $i < count($units) - 1) {
            $size /= 1024;
            $i++;
        }

        return round($size, 2).' '.$units[$i];
    }
}

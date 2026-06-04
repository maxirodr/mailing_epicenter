<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use App\Models\ThreadUserState;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Webklex\PHPIMAP\ClientManager;

class ImportFromImap extends Command
{
    protected $signature = 'mail:import-imap
        {--host=imap.yandex.com : IMAP server hostname}
        {--port=993 : IMAP server port}
        {--username= : IMAP username (email address)}
        {--password= : IMAP password}
        {--mailbox-id= : Target mailbox ID in Epicenter}
        {--folders=INBOX,Sent,Drafts : Comma-separated IMAP folders to import}
        {--dry-run : Show what would be imported without actually importing}
        {--skip-attachments : Skip downloading attachments}
        {--since= : Only import emails since this date (Y-m-d)}';

    protected $description = 'Import emails from an external IMAP server into Epicenter Mail';

    private int $imported = 0;
    private int $skipped = 0;
    private int $errors = 0;
    private int $threadsCreated = 0;
    private ?Mailbox $targetMailbox = null;
    private array $labelMap = [];

    public function handle(): int
    {
        $host = $this->option('host');
        $port = (int) $this->option('port');
        $username = $this->option('username');
        $password = $this->option('password');
        $mailboxId = $this->option('mailbox-id');
        $folders = array_map('trim', explode(',', $this->option('folders')));
        $dryRun = $this->option('dry-run');
        $skipAttachments = $this->option('skip-attachments');
        $since = $this->option('since');

        if (! $username || ! $password || ! $mailboxId) {
            $this->error('--username, --password, and --mailbox-id are required.');
            return 1;
        }

        $this->targetMailbox = Mailbox::find($mailboxId);
        if (! $this->targetMailbox) {
            $this->error("Mailbox ID {$mailboxId} not found.");
            return 1;
        }

        $this->info("Target mailbox: {$this->targetMailbox->address}@{$this->targetMailbox->domain} (ID: {$mailboxId})");

        // Load label map for this mailbox
        $labels = Label::where('mailbox_id', $mailboxId)->get();
        foreach ($labels as $label) {
            $this->labelMap[strtoupper($label->name)] = $label;
        }

        // Connect to IMAP
        $this->info("Connecting to {$host}:{$port} as {$username}...");

        $cm = new ClientManager();
        $client = $cm->make([
            'host' => $host,
            'port' => $port,
            'encryption' => 'ssl',
            'validate_cert' => true,
            'username' => $username,
            'password' => $password,
            'protocol' => 'imap',
        ]);

        try {
            $client->connect();
        } catch (\Exception $e) {
            $this->error("Failed to connect: {$e->getMessage()}");
            return 1;
        }

        $this->info('Connected successfully!');

        // List available folders
        $availableFolders = $client->getFolders();
        $this->info('Available IMAP folders:');
        foreach ($availableFolders as $folder) {
            $this->line("  - {$folder->path}");
        }

        foreach ($folders as $folderName) {
            $this->importFolder($client, $folderName, $dryRun, $skipAttachments, $since);
        }

        $client->disconnect();

        $this->newLine();
        $this->info('=== Import Summary ===');
        $this->info("Emails imported: {$this->imported}");
        $this->info("Emails skipped (already exist): {$this->skipped}");
        $this->info("Threads created: {$this->threadsCreated}");
        $this->info("Errors: {$this->errors}");

        if ($dryRun) {
            $this->warn('This was a DRY RUN - no data was actually imported.');
        }

        return 0;
    }

    private function importFolder($client, string $folderName, bool $dryRun, bool $skipAttachments, ?string $since): void
    {
        $this->newLine();
        $this->info("=== Importing folder: {$folderName} ===");

        try {
            $folder = $client->getFolder($folderName);
        } catch (\Exception $e) {
            $this->warn("Folder '{$folderName}' not found, skipping. ({$e->getMessage()})");
            return;
        }

        if (! $folder) {
            $this->warn("Folder '{$folderName}' not found, skipping.");
            return;
        }

        // Count messages first
        $total = $folder->query()->all()->count();
        $this->info("Found {$total} messages in {$folderName}");

        if ($total === 0) {
            return;
        }

        $bar = $this->output->createProgressBar($total);
        $bar->setFormat(' %current%/%max% [%bar%] %percent:3s%% %message%');
        $bar->setMessage('Starting...');
        $bar->start();

        // Fetch in batches to avoid empty response on large folders
        $batchSize = 50;
        $page = 1;

        while (true) {
            $query = $folder->query();

            if ($since) {
                $query->since($since);
            }

            try {
                $messages = $query->all()->limit($batchSize, $page)->get();
            } catch (\Exception $e) {
                // Library throws on empty pages after last batch
                break;
            }

            if ($messages->count() === 0) {
                break;
            }

            foreach ($messages as $message) {
                try {
                    $bar->setMessage($this->truncate($message->getSubject()?->toString() ?? '(no subject)', 50));

                    $this->importMessage($message, $folderName, $dryRun, $skipAttachments);
                } catch (\Exception $e) {
                    $this->errors++;
                    Log::error('IMAP import error', [
                        'folder' => $folderName,
                        'subject' => $message->getSubject()?->toString(),
                        'error' => $e->getMessage(),
                    ]);
                }

                $bar->advance();
            }

            $page++;
        }

        $bar->setMessage('Done!');
        $bar->finish();
        $this->newLine();
    }

    private function importMessage($message, string $folderName, bool $dryRun, bool $skipAttachments): void
    {
        $messageId = $message->getMessageId()?->toString();
        $subject = $this->decodeMimeHeader($message->getSubject()?->toString() ?? '(No Subject)');
        // Truncate to fit VARCHAR(255) column
        if (mb_strlen($subject) > 255) {
            $subject = mb_substr($subject, 0, 252) . '...';
        }

        // Skip if already imported (by message_id)
        if ($messageId && Email::where('message_id', $messageId)->where('mailbox_id', $this->targetMailbox->id)->exists()) {
            $this->skipped++;
            return;
        }

        if ($dryRun) {
            $this->imported++;
            return;
        }

        // Parse addresses
        $from = $message->getFrom()?->toArray() ?? [];
        $fromAddress = '';
        $fromName = null;
        if (! empty($from)) {
            $firstFrom = $from[0];
            $fromAddress = $firstFrom->mail ?? '';
            $fromName = isset($firstFrom->personal) ? $this->decodeMimeHeader($firstFrom->personal) : null;
        }

        $toAddresses = $this->parseAddressList($message->getTo()?->toArray() ?? []);
        $ccAddresses = $this->parseAddressList($message->getCc()?->toArray() ?? []);
        $bccAddresses = $this->parseAddressList($message->getBcc()?->toArray() ?? []);

        $inReplyTo = $message->getInReplyTo()?->toString();
        $references = $message->getReferences()?->toString();
        $date = $message->getDate()?->toDate();
        $sentAt = $date ? Carbon::instance($date) : now();

        // Determine direction
        $mailboxEmail = $this->targetMailbox->address . '@' . $this->targetMailbox->domain;
        $direction = strtolower($fromAddress) === strtolower($mailboxEmail) ? 'outbound' : 'inbound';

        // Get body
        $htmlBody = $message->getHTMLBody();
        $textBody = $message->getTextBody();

        // Resolve or create thread
        $thread = $this->resolveThread($messageId, $inReplyTo, $references, $subject, $fromAddress, $toAddresses, $sentAt);

        DB::beginTransaction();
        try {
            $email = Email::create([
                'thread_id' => $thread->id,
                'mailbox_id' => $this->targetMailbox->id,
                'message_id' => $messageId,
                'in_reply_to' => $inReplyTo,
                'references_header' => $references,
                'from_address' => $fromAddress,
                'from_name' => $fromName,
                'to_addresses' => $toAddresses,
                'cc_addresses' => $ccAddresses,
                'bcc_addresses' => $bccAddresses,
                'subject' => $subject,
                'html_body' => $this->sanitizeHtml($htmlBody),
                'text_body' => $textBody,
                'direction' => $direction,
                'is_draft' => false,
                'sent_at' => $sentAt,
            ]);

            // Assign labels based on folder and direction
            $this->assignLabels($thread, $folderName, $direction);

            // Update thread metadata
            $snippet = Str::limit(strip_tags($htmlBody ?? $textBody ?? ''), 200);
            $thread->update([
                'snippet' => $snippet,
                'last_message_at' => max($thread->last_message_at ?? $sentAt, $sentAt),
                'message_count' => $thread->emails()->count(),
            ]);

            // Create ThreadUserState for all mailbox users (mark as read since these are historical)
            $mailboxUserIds = $this->targetMailbox->users()->pluck('users.id');
            foreach ($mailboxUserIds as $userId) {
                ThreadUserState::firstOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_read' => true, 'is_starred' => false, 'is_trashed' => false, 'is_spam' => false]
                );
            }

            // Process attachments
            if (! $skipAttachments) {
                $this->processAttachments($email, $message);
            }

            DB::commit();
            $this->imported++;
        } catch (\Exception $e) {
            DB::rollBack();
            throw $e;
        }
    }

    private function resolveThread(?string $messageId, ?string $inReplyTo, ?string $references, string $subject, string $fromAddress, array $toAddresses, Carbon $sentAt): Thread
    {
        $mailboxId = $this->targetMailbox->id;

        // Strategy A: In-Reply-To
        if ($inReplyTo) {
            $existing = Email::where('mailbox_id', $mailboxId)
                ->where('message_id', $inReplyTo)
                ->first();
            if ($existing) {
                return $existing->thread;
            }
        }

        // Strategy B: References header
        if ($references) {
            $refList = preg_split('/\s+/', $references);
            $existing = Email::where('mailbox_id', $mailboxId)
                ->whereIn('message_id', $refList)
                ->latest()
                ->first();
            if ($existing) {
                return $existing->thread;
            }
        }

        // Strategy C: Create new thread (subject matching removed — too aggressive for notifications)
        $this->threadsCreated++;
        return Thread::create([
            'mailbox_id' => $mailboxId,
            'subject' => $subject,
            'snippet' => '',
            'last_message_at' => $sentAt,
            'message_count' => 0,
        ]);
    }

    private function assignLabels(Thread $thread, string $folderName, string $direction): void
    {
        $labelNames = [];

        // Map IMAP folder to our labels
        $folderUpper = strtoupper($folderName);

        if (in_array($folderUpper, ['INBOX', 'INBOX'])) {
            $labelNames[] = 'INBOX';
        } elseif (in_array($folderUpper, ['SENT', 'SENT ITEMS', 'SENT MESSAGES', '&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-'])) {
            $labelNames[] = 'SENT';
        } elseif (in_array($folderUpper, ['DRAFTS', 'DRAFT', '&BB4EQgQ,BEAEMAQyBDsENQQ9BD0ESwQ1-'])) {
            $labelNames[] = 'DRAFTS';
        } elseif (in_array($folderUpper, ['SPAM', 'JUNK', 'JUNK E-MAIL'])) {
            $labelNames[] = 'SPAM';
        } elseif (in_array($folderUpper, ['TRASH', 'DELETED', 'DELETED ITEMS'])) {
            $labelNames[] = 'TRASH';
        } else {
            // For outbound in non-sent folders, also tag as SENT
            if ($direction === 'outbound') {
                $labelNames[] = 'SENT';
            } else {
                $labelNames[] = 'INBOX';
            }
        }

        $labelIds = [];
        foreach ($labelNames as $name) {
            if (isset($this->labelMap[$name])) {
                $labelIds[] = $this->labelMap[$name]->id;
            }
        }

        if (! empty($labelIds)) {
            $thread->labels()->syncWithoutDetaching($labelIds);
        }
    }

    private function processAttachments(Email $email, $message): void
    {
        $attachments = $message->getAttachments();

        foreach ($attachments as $attachment) {
            try {
                $filename = $attachment->getName() ?? 'unknown';
                $contentType = $attachment->getMimeType() ?? 'application/octet-stream';
                $content = $attachment->getContent();

                if (empty($content)) {
                    continue;
                }

                $key = 'attachments/' . Str::uuid() . '/' . $filename;

                Storage::disk('r2')->put($key, $content, [
                    'ContentType' => $contentType,
                ]);

                Attachment::create([
                    'email_id' => $email->id,
                    'filename' => $filename,
                    'content_type' => $contentType,
                    'size' => strlen($content),
                    'r2_key' => $key,
                    'r2_url' => Storage::disk('r2')->url($key),
                ]);
            } catch (\Exception $e) {
                Log::warning('Failed to import attachment', [
                    'email_id' => $email->id,
                    'filename' => $attachment->getName(),
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function parseAddressList(array $addresses): array
    {
        $result = [];
        foreach ($addresses as $addr) {
            if (isset($addr->mail) && $addr->mail) {
                $result[] = $addr->mail;
            }
        }
        return $result;
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

    private function decodeMimeHeader(string $header): string
    {
        $header = preg_replace('/\r?\n[\t ]+/', ' ', $header);

        if (! str_contains($header, '=?')) {
            return $header;
        }

        if (function_exists('iconv_mime_decode')) {
            $decoded = @iconv_mime_decode($header, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if ($decoded !== false && ! str_contains($decoded, '?')) {
                return $decoded;
            }
        }

        return preg_replace_callback(
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
    }

    private function truncate(string $str, int $length): string
    {
        return strlen($str) > $length ? substr($str, 0, $length) . '...' : $str;
    }
}

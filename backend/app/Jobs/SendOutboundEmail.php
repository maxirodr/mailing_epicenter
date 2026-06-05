<?php

namespace App\Jobs;

use App\Events\NewEmailReceived;
use App\Events\ThreadUpdated;
use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use App\Models\ThreadUserState;
use App\Services\EmailClassifier;
use App\Services\OneSignalService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\Middleware\RateLimited;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Resend;

class SendOutboundEmail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;

    public int $backoff = 30;

    public function __construct(
        public Email $email
    ) {}

    /**
     * Rate limit: max 2 Resend API calls per second across all workers.
     */
    public function middleware(): array
    {
        return [new RateLimited('resend-api')];
    }

    public function handle(): void
    {
        if (Cache::pull("cancel_send_{$this->email->id}") === 'cancelled') {
            Log::info('Outbound email cancelled', ['email_id' => $this->email->id]);
            return;
        }

        $email = $this->email->load(['attachments', 'mailbox']);
        $mailbox = $email->mailbox;

        $from = $mailbox->display_name
            ? "{$mailbox->display_name} <{$mailbox->address}@{$mailbox->domain}>"
            : "{$mailbox->address}@{$mailbox->domain}";

        $fromAddress = "{$mailbox->address}@{$mailbox->domain}";

        $payload = [
            'from' => $from,
            'to' => $email->to_addresses,
            'reply_to' => [$fromAddress],
            'subject' => $email->subject,
        ];

        if (! empty($email->cc_addresses)) {
            $payload['cc'] = $email->cc_addresses;
        }

        if (! empty($email->bcc_addresses)) {
            $payload['bcc'] = $email->bcc_addresses;
        }

        if ($email->html_body) {
            $payload['html'] = $this->wrapHtmlEmail($email->html_body);
        }

        // Always include plain text version — Gmail penalizes HTML-only emails
        $payload['text'] = $email->text_body ?: $this->htmlToPlainText($email->html_body ?? '');

        $headers = [];
        if ($email->message_id) {
            $headers['Message-ID'] = $email->message_id;
        }
        if ($email->in_reply_to) {
            $headers['In-Reply-To'] = $email->in_reply_to;
        }
        if ($email->references_header) {
            $headers['References'] = $email->references_header;
        }
        // X-Mailer omitted intentionally — custom mailer headers can signal automation to spam filters

        $payload['headers'] = $headers;

        if ($email->attachments->isNotEmpty()) {
            $attachments = [];

            foreach ($email->attachments as $attachment) {
                $content = Storage::disk('r2')->get($attachment->r2_key);

                $attachments[] = [
                    'filename' => $attachment->filename,
                    'content' => base64_encode($content),
                ];
            }

            $payload['attachments'] = $attachments;
        }

        $resend = Resend::client(config('services.resend.key'));
        $result = $resend->emails->send($payload);

        // The Resend PHP SDK does NOT throw on API errors (e.g. unverified
        // sending domain → 403). Instead it returns a Resend\Email whose
        // attributes are the error body (statusCode + message). If there is no
        // id, the send was rejected: fail loudly so the job lands in
        // failed_jobs and the error is logged, rather than silently marking the
        // email as "sent".
        if (empty($result->id)) {
            $error = method_exists($result, 'toArray') ? $result->toArray() : [];
            $message = $error['message'] ?? 'Unknown error';
            $statusCode = $error['statusCode'] ?? null;

            Log::error('Resend rejected outbound email', [
                'email_id' => $email->id,
                'from' => $fromAddress,
                'status_code' => $statusCode,
                'message' => $message,
            ]);

            throw new \RuntimeException(
                "Resend rejected email {$email->id} (status {$statusCode}): {$message}"
            );
        }

        $email->update([
            'resend_email_id' => $result->id,
            'sent_at' => now(),
        ]);

        $thread = $email->thread;
        $thread->update([
            'snippet' => Thread::makeSnippet($email->html_body, $email->text_body),
            'last_message_at' => now(),
        ]);

        $sentLabel = Label::where('mailbox_id', $mailbox->id)
            ->where('name', 'SENT')
            ->where('type', 'system')
            ->first();

        if ($sentLabel) {
            $thread->labels()->syncWithoutDetaching([$sentLabel->id]);
        }

        // Remove SCHEDULED label after successful send
        if ($email->scheduled_at) {
            $scheduledLabel = Label::where('mailbox_id', $mailbox->id)
                ->where('name', 'SCHEDULED')
                ->where('type', 'system')
                ->first();

            if ($scheduledLabel) {
                $thread->labels()->detach($scheduledLabel->id);
            }

            $email->update(['scheduled_at' => null]);
        }

        ThreadUpdated::dispatch($thread, $mailbox->id);

        // Internal delivery: if any recipients are internal mailboxes, deliver directly
        $this->deliverToInternalMailboxes($email, $mailbox);

        // Only send push to users who opted in for sent-email notifications
        $onesignal = app(OneSignalService::class);
        if ($onesignal->isConfigured()) {
            $toLabel = is_array($email->to_addresses) ? implode(', ', $email->to_addresses) : $email->to_addresses;
            $pushTitle = "Email sent to {$toLabel}";
            $pushMessage = Str::limit($email->subject, 100);
            $pushData = [
                'type' => 'email_sent',
                'email_id' => $email->id,
                'thread_id' => $thread->id,
                'mailbox_id' => $mailbox->id,
            ];

            $mailboxUsers = $mailbox->users()->with('preferences')->get();
            foreach ($mailboxUsers as $mbUser) {
                $notifySent = $mbUser->preferences?->preferences['notify_sent'] ?? false;
                if ($notifySent) {
                    $onesignal->sendToExternalUser($mbUser->id, $pushTitle, $pushMessage, $pushData);
                }
            }
        }

        Log::info('Outbound email sent', [
            'email_id' => $email->id,
            'resend_id' => $result->id ?? null,
        ]);
    }

    /**
     * Wrap raw HTML content in a minimal structure like Gmail does.
     * Heavy wrappers with CSS/DOCTYPE look like marketing emails to spam filters.
     */
    private function wrapHtmlEmail(string $body): string
    {
        // Strip any existing full HTML document wrapper (e.g. from forwards)
        if (preg_match('/<body[^>]*>(.*)<\/body>/is', $body, $m)) {
            $body = $m[1];
        }

        return '<div dir="ltr">' . $body . '</div>';
    }

    private function htmlToPlainText(string $html): string
    {
        // Convert common HTML elements to text equivalents
        $text = $html;

        // Line breaks
        $text = preg_replace('/<br\s*\/?>/i', "\n", $text);
        $text = preg_replace('/<\/(p|div|h[1-6]|li|tr)>/i', "\n", $text);
        $text = preg_replace('/<\/(blockquote)>/i', "\n\n", $text);

        // Links: show URL
        $text = preg_replace('/<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is', '$2 ($1)', $text);

        // Lists
        $text = preg_replace('/<li[^>]*>/i', '- ', $text);

        // Horizontal rules
        $text = preg_replace('/<hr\s*\/?>/i', "\n---\n", $text);

        // Strip remaining tags
        $text = strip_tags($text);

        // Decode HTML entities
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');

        // Clean up whitespace
        $text = preg_replace('/[ \t]+/', ' ', $text);
        $text = preg_replace('/\n{3,}/', "\n\n", $text);

        return trim($text);
    }

    /**
     * Deliver the email directly to any internal mailboxes that are recipients.
     * This avoids relying on Resend's inbound webhook for internal-to-internal delivery.
     */
    private function deliverToInternalMailboxes(Email $email, Mailbox $senderMailbox): void
    {
        $allRecipients = array_merge(
            $email->to_addresses ?? [],
            $email->cc_addresses ?? [],
            $email->bcc_addresses ?? [],
        );

        $senderAddress = "{$senderMailbox->address}@{$senderMailbox->domain}";

        foreach ($allRecipients as $address) {
            $address = strtolower(trim($address));
            if ($address === strtolower($senderAddress)) {
                continue; // Don't deliver to self
            }

            $parts = explode('@', $address, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $recipientMailbox = Mailbox::where('address', $parts[0])
                ->where('domain', $parts[1])
                ->first();

            if (! $recipientMailbox) {
                continue;
            }

            // Check if this email was already delivered to this mailbox (avoid duplicates from webhook)
            $exists = Email::where('mailbox_id', $recipientMailbox->id)
                ->where('message_id', $email->message_id)
                ->exists();

            if ($exists) {
                continue;
            }

            try {
                $this->createInternalDelivery($email, $recipientMailbox);
            } catch (\Exception $e) {
                Log::warning('Failed internal delivery', [
                    'email_id' => $email->id,
                    'recipient_mailbox' => $recipientMailbox->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    private function createInternalDelivery(Email $sourceEmail, Mailbox $recipientMailbox): void
    {
        // Find or create a thread in the recipient's mailbox
        $thread = null;

        // Try to match by Message-ID references (In-Reply-To, References)
        if ($sourceEmail->in_reply_to) {
            $existingEmail = Email::where('mailbox_id', $recipientMailbox->id)
                ->where('message_id', $sourceEmail->in_reply_to)
                ->first();
            if ($existingEmail) {
                $thread = $existingEmail->thread;
            }
        }

        if (! $thread && $sourceEmail->references_header) {
            $refs = explode(' ', $sourceEmail->references_header);
            $existingEmail = Email::where('mailbox_id', $recipientMailbox->id)
                ->whereIn('message_id', $refs)
                ->latest()
                ->first();
            if ($existingEmail) {
                $thread = $existingEmail->thread;
            }
        }

        $isNewThread = ! $thread;

        if (! $thread) {
            $thread = Thread::create([
                'mailbox_id' => $recipientMailbox->id,
                'subject' => $sourceEmail->subject,
                'snippet' => '',
                'last_message_at' => now(),
                'message_count' => 0,
            ]);
        }

        $inboundEmail = Email::create([
            'thread_id' => $thread->id,
            'mailbox_id' => $recipientMailbox->id,
            'message_id' => $sourceEmail->message_id,
            'in_reply_to' => $sourceEmail->in_reply_to,
            'references_header' => $sourceEmail->references_header,
            'from_address' => $sourceEmail->from_address,
            'from_name' => $sourceEmail->from_name,
            'to_addresses' => $sourceEmail->to_addresses,
            'cc_addresses' => $sourceEmail->cc_addresses,
            'bcc_addresses' => [],
            'subject' => $sourceEmail->subject,
            'html_body' => $sourceEmail->html_body,
            'text_body' => $sourceEmail->text_body,
            'direction' => 'inbound',
            'is_draft' => false,
            'sent_at' => $sourceEmail->sent_at ?? now(),
            'spam_score' => 0,
        ]);

        // Copy attachments
        foreach ($sourceEmail->attachments as $att) {
            \App\Models\Attachment::create([
                'email_id' => $inboundEmail->id,
                'filename' => $att->filename,
                'content_type' => $att->content_type,
                'size' => $att->size,
                'r2_key' => $att->r2_key,
                'r2_url' => $att->r2_url,
            ]);
        }

        // Add INBOX label
        $inboxLabel = Label::where('mailbox_id', $recipientMailbox->id)
            ->where('name', 'INBOX')
            ->where('type', 'system')
            ->first();

        if ($inboxLabel) {
            $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
        }

        $thread->update([
            'snippet' => Thread::makeSnippet($sourceEmail->html_body, $sourceEmail->text_body),
            'last_message_at' => $inboundEmail->sent_at ?? now(),
            'message_count' => $thread->emails()->count(),
        ]);

        // Classify new thread
        if ($isNewThread) {
            $category = app(EmailClassifier::class)->classifyWithOverrides([
                'from_address' => $sourceEmail->from_address,
                'subject' => $sourceEmail->subject,
                'list_unsubscribe' => null,
                'list_id' => null,
            ], $recipientMailbox->id);
            $thread->update(['category' => $category]);
        }

        // Mark unread for all users of recipient mailbox
        $mailboxUserIds = $recipientMailbox->users()->pluck('users.id');
        foreach ($mailboxUserIds as $userId) {
            $state = ThreadUserState::firstOrCreate(
                ['thread_id' => $thread->id, 'user_id' => $userId],
                ['is_read' => false, 'is_starred' => false, 'is_trashed' => false, 'is_spam' => false]
            );
            if (! $state->wasRecentlyCreated) {
                $state->update(['is_read' => false]);
            }
        }

        NewEmailReceived::dispatch($inboundEmail, $recipientMailbox->id);

        Log::info('Internal delivery completed', [
            'source_email_id' => $sourceEmail->id,
            'delivered_email_id' => $inboundEmail->id,
            'recipient_mailbox' => $recipientMailbox->id,
        ]);
    }
}

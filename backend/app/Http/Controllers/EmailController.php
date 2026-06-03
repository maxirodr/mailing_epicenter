<?php

namespace App\Http\Controllers;

use App\Http\Resources\EmailResource;
use App\Jobs\SendOutboundEmail;
use App\Models\Attachment;
use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class EmailController extends Controller
{
    public function store(Mailbox $mailbox, Request $request): JsonResponse
    {
        $isDraft = $request->boolean('is_draft');

        $validated = $request->validate([
            'to_addresses' => ['sometimes', 'array'],
            'to_addresses.*' => ['email'],
            'cc_addresses' => ['sometimes', 'nullable', 'array'],
            'cc_addresses.*' => ['email'],
            'bcc_addresses' => ['sometimes', 'nullable', 'array'],
            'bcc_addresses.*' => ['email'],
            'subject' => [$isDraft ? 'sometimes' : 'required', 'string', 'max:998'],
            'html_body' => ['sometimes', 'nullable', 'string'],
            'text_body' => ['sometimes', 'nullable', 'string'],
            'is_draft' => ['sometimes', 'boolean'],
            'scheduled_at' => ['sometimes', 'nullable', 'date', 'after:now'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:attachments,id'],
            'reply_to_email_id' => ['sometimes', 'nullable', 'integer', 'exists:emails,id'],
        ]);

        // Require at least one recipient (to, cc, or bcc) when not a draft
        if (!$isDraft) {
            $totalRecipients = count($validated['to_addresses'] ?? [])
                + count($validated['cc_addresses'] ?? [])
                + count($validated['bcc_addresses'] ?? []);
            if ($totalRecipients === 0) {
                return response()->json(['message' => 'At least one recipient is required.'], 422);
            }
        }

        $messageId = '<' . Str::uuid() . '@' . $mailbox->domain . '>';

        // If replying to an existing email, use its thread and set threading headers
        $inReplyTo = null;
        $referencesHeader = null;
        $replyToEmail = null;

        if (! empty($validated['reply_to_email_id'])) {
            $replyToEmail = Email::where('id', $validated['reply_to_email_id'])
                ->where('mailbox_id', $mailbox->id)
                ->first();
        }

        if ($replyToEmail) {
            $thread = $replyToEmail->thread;
            $inReplyTo = $replyToEmail->message_id;
            $referencesHeader = $replyToEmail->references_header
                ? $replyToEmail->references_header . ' ' . $replyToEmail->message_id
                : $replyToEmail->message_id;
        } else {
            $thread = Thread::create([
                'mailbox_id' => $mailbox->id,
                'subject' => $validated['subject'],
                'snippet' => Thread::makeSnippet($validated['html_body'] ?? null, $validated['text_body'] ?? null),
                'last_message_at' => now(),
                'message_count' => 1,
            ]);
        }

        $email = Email::create([
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
            'message_id' => $messageId,
            'in_reply_to' => $inReplyTo,
            'references_header' => $referencesHeader,
            'from_address' => $mailbox->address . '@' . $mailbox->domain,
            'from_name' => $mailbox->display_name,
            'to_addresses' => $validated['to_addresses'],
            'cc_addresses' => $validated['cc_addresses'] ?? [],
            'bcc_addresses' => $validated['bcc_addresses'] ?? [],
            'subject' => $validated['subject'],
            'html_body' => $validated['html_body'] ?? null,
            'text_body' => $validated['text_body'] ?? null,
            'direction' => 'outbound',
            'is_draft' => $validated['is_draft'] ?? false,
            'sent_at' => ($validated['is_draft'] ?? false) || !empty($validated['scheduled_at']) ? null : now(),
            'scheduled_at' => $validated['scheduled_at'] ?? null,
        ]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])
                ->whereNull('email_id')
                ->update(['email_id' => $email->id]);
        }

        if ($validated['is_draft'] ?? false) {
            $draftsLabel = Label::where('mailbox_id', $mailbox->id)
                ->where('name', 'DRAFTS')
                ->where('type', 'system')
                ->first();

            if ($draftsLabel) {
                $thread->labels()->syncWithoutDetaching([$draftsLabel->id]);
            }
        } elseif (!empty($validated['scheduled_at'])) {
            $scheduledLabel = Label::where('mailbox_id', $mailbox->id)
                ->where('name', 'SCHEDULED')
                ->where('type', 'system')
                ->first();

            if ($scheduledLabel) {
                $thread->labels()->syncWithoutDetaching([$scheduledLabel->id]);
            }

            SendOutboundEmail::dispatch($email)->delay(Carbon::parse($validated['scheduled_at']));
        } else {
            $sentLabel = Label::where('mailbox_id', $mailbox->id)
                ->where('name', 'SENT')
                ->where('type', 'system')
                ->first();

            if ($sentLabel) {
                $thread->labels()->syncWithoutDetaching([$sentLabel->id]);
            }

            SendOutboundEmail::dispatch($email)->delay(now()->addSeconds(10));
            Cache::put("cancel_send_{$email->id}", true, 15);
        }

        $email->load('attachments');

        return response()->json(new EmailResource($email), 201);
    }

    public function cancelSend(Mailbox $mailbox, Email $email): JsonResponse
    {
        if ($email->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Email does not belong to this mailbox.'], 404);
        }
        if ($email->sent_at !== null) {
            return response()->json(['message' => 'Email already sent.'], 422);
        }

        // Mark as draft again
        $email->update(['is_draft' => true, 'sent_at' => null, 'scheduled_at' => null]);

        // Swap labels: SENT/SCHEDULED -> DRAFTS
        $thread = $email->thread;
        $sentLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SENT')->where('type', 'system')->first();
        $scheduledLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SCHEDULED')->where('type', 'system')->first();
        $draftsLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'DRAFTS')->where('type', 'system')->first();
        if ($sentLabel) $thread->labels()->detach($sentLabel->id);
        if ($scheduledLabel) $thread->labels()->detach($scheduledLabel->id);
        if ($draftsLabel) $thread->labels()->syncWithoutDetaching([$draftsLabel->id]);

        // Remove from queue by setting a cancel flag
        Cache::put("cancel_send_{$email->id}", 'cancelled', 60);

        return response()->json(['message' => 'Send cancelled. Email moved to drafts.']);
    }

    public function sendScheduledNow(Mailbox $mailbox, Email $email): JsonResponse
    {
        if ($email->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Email does not belong to this mailbox.'], 404);
        }
        if ($email->sent_at !== null) {
            return response()->json(['message' => 'Email already sent.'], 422);
        }
        if (!$email->scheduled_at) {
            return response()->json(['message' => 'Email is not scheduled.'], 422);
        }

        // Cancel the delayed job
        Cache::put("cancel_send_{$email->id}", 'cancelled', 60);

        // Clear scheduled_at and dispatch immediately
        $email->update(['scheduled_at' => null]);

        // Swap labels: SCHEDULED -> SENT
        $thread = $email->thread;
        $scheduledLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SCHEDULED')->where('type', 'system')->first();
        $sentLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SENT')->where('type', 'system')->first();
        if ($scheduledLabel) $thread->labels()->detach($scheduledLabel->id);
        if ($sentLabel) $thread->labels()->syncWithoutDetaching([$sentLabel->id]);

        // Dispatch immediately (small delay for undo window)
        SendOutboundEmail::dispatch($email)->delay(now()->addSeconds(5));

        return response()->json(['message' => 'Email will be sent now.']);
    }

    public function reply(Mailbox $mailbox, Email $email, Request $request): JsonResponse
    {
        if ($email->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Email does not belong to this mailbox.'], 404);
        }

        $validated = $request->validate([
            'to_addresses' => ['required', 'array', 'min:1'],
            'to_addresses.*' => ['email'],
            'cc_addresses' => ['sometimes', 'nullable', 'array'],
            'cc_addresses.*' => ['email'],
            'bcc_addresses' => ['sometimes', 'nullable', 'array'],
            'bcc_addresses.*' => ['email'],
            'subject' => ['sometimes', 'string', 'max:998'],
            'html_body' => ['sometimes', 'nullable', 'string'],
            'text_body' => ['sometimes', 'nullable', 'string'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:attachments,id'],
        ]);

        $messageId = '<' . Str::uuid() . '@' . $mailbox->domain . '>';

        $references = $email->references_header
            ? $email->references_header . ' ' . $email->message_id
            : $email->message_id;

        $replyEmail = Email::create([
            'thread_id' => $email->thread_id,
            'mailbox_id' => $mailbox->id,
            'message_id' => $messageId,
            'in_reply_to' => $email->message_id,
            'references_header' => $references,
            'from_address' => $mailbox->address . '@' . $mailbox->domain,
            'from_name' => $mailbox->display_name,
            'to_addresses' => $validated['to_addresses'],
            'cc_addresses' => $validated['cc_addresses'] ?? [],
            'bcc_addresses' => $validated['bcc_addresses'] ?? [],
            'subject' => $validated['subject'] ?? (preg_match('/^(Re|Fwd):/i', $email->subject) ? $email->subject : 'Re: ' . $email->subject),
            'html_body' => $validated['html_body'] ?? null,
            'text_body' => $validated['text_body'] ?? null,
            'direction' => 'outbound',
            'is_draft' => false,
            'sent_at' => now(),
        ]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])
                ->whereNull('email_id')
                ->update(['email_id' => $replyEmail->id]);
        }

        $thread = $email->thread;
        $thread->update([
            'snippet' => Thread::makeSnippet($validated['html_body'] ?? null, $validated['text_body'] ?? null),
            'last_message_at' => now(),
            'message_count' => $thread->message_count + 1,
        ]);

        $sentLabel = Label::where('mailbox_id', $mailbox->id)
            ->where('name', 'SENT')
            ->where('type', 'system')
            ->first();

        if ($sentLabel) {
            $thread->labels()->syncWithoutDetaching([$sentLabel->id]);
        }

        SendOutboundEmail::dispatch($replyEmail);

        $replyEmail->load('attachments');

        return response()->json(new EmailResource($replyEmail), 201);
    }

    public function forward(Mailbox $mailbox, Email $email, Request $request): JsonResponse
    {
        if ($email->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Email does not belong to this mailbox.'], 404);
        }

        $validated = $request->validate([
            'to_addresses' => ['required', 'array', 'min:1'],
            'to_addresses.*' => ['email'],
            'cc_addresses' => ['sometimes', 'nullable', 'array'],
            'cc_addresses.*' => ['email'],
            'bcc_addresses' => ['sometimes', 'nullable', 'array'],
            'bcc_addresses.*' => ['email'],
            'subject' => ['sometimes', 'string', 'max:998'],
            'html_body' => ['sometimes', 'nullable', 'string'],
            'text_body' => ['sometimes', 'nullable', 'string'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:attachments,id'],
        ]);

        $messageId = '<' . Str::uuid() . '@' . $mailbox->domain . '>';
        $forwardSubject = $validated['subject'] ?? (preg_match('/^Fwd:/i', $email->subject) ? $email->subject : 'Fwd: ' . $email->subject);

        $forwardedHtml = ($validated['html_body'] ?? '') .
            '<br><br><blockquote style="border-left:2px solid #ccc;padding-left:10px;margin-left:0;">' .
            '<p><strong>From:</strong> ' . e($email->from_name ?? $email->from_address) . '</p>' .
            '<p><strong>Date:</strong> ' . ($email->sent_at?->toRfc2822String() ?? '') . '</p>' .
            '<p><strong>Subject:</strong> ' . e($email->subject) . '</p>' .
            '<hr>' .
            ($email->html_body ?? nl2br(e($email->text_body ?? ''))) .
            '</blockquote>';

        $thread = Thread::create([
            'mailbox_id' => $mailbox->id,
            'subject' => $forwardSubject,
            'snippet' => Thread::makeSnippet($forwardedHtml),
            'last_message_at' => now(),
            'message_count' => 1,
        ]);

        $forwardEmail = Email::create([
            'thread_id' => $thread->id,
            'mailbox_id' => $mailbox->id,
            'message_id' => $messageId,
            'from_address' => $mailbox->address . '@' . $mailbox->domain,
            'from_name' => $mailbox->display_name,
            'to_addresses' => $validated['to_addresses'],
            'cc_addresses' => $validated['cc_addresses'] ?? [],
            'bcc_addresses' => $validated['bcc_addresses'] ?? [],
            'subject' => $forwardSubject,
            'html_body' => $forwardedHtml,
            'text_body' => $validated['text_body'] ?? null,
            'direction' => 'outbound',
            'is_draft' => false,
            'sent_at' => now(),
        ]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::whereIn('id', $validated['attachment_ids'])
                ->whereNull('email_id')
                ->update(['email_id' => $forwardEmail->id]);
        }

        $sentLabel = Label::where('mailbox_id', $mailbox->id)
            ->where('name', 'SENT')
            ->where('type', 'system')
            ->first();

        if ($sentLabel) {
            $thread->labels()->syncWithoutDetaching([$sentLabel->id]);
        }

        SendOutboundEmail::dispatch($forwardEmail);

        $forwardEmail->load('attachments');

        return response()->json(new EmailResource($forwardEmail), 201);
    }

    public function updateDraft(Mailbox $mailbox, Email $draft, Request $request): JsonResponse
    {
        if ($draft->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Draft does not belong to this mailbox.'], 404);
        }

        if (! $draft->is_draft) {
            return response()->json(['message' => 'Only drafts can be updated.'], 422);
        }

        $validated = $request->validate([
            'to_addresses' => ['sometimes', 'array'],
            'to_addresses.*' => ['email'],
            'cc_addresses' => ['sometimes', 'nullable', 'array'],
            'cc_addresses.*' => ['email'],
            'bcc_addresses' => ['sometimes', 'nullable', 'array'],
            'bcc_addresses.*' => ['email'],
            'subject' => ['sometimes', 'string', 'max:998'],
            'html_body' => ['sometimes', 'nullable', 'string'],
            'text_body' => ['sometimes', 'nullable', 'string'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:attachments,id'],
        ]);

        $draft->update(array_intersect_key($validated, array_flip([
            'to_addresses', 'cc_addresses', 'bcc_addresses',
            'subject', 'html_body', 'text_body',
        ])));

        if (isset($validated['attachment_ids'])) {
            Attachment::where('email_id', $draft->id)->update(['email_id' => null]);
            Attachment::whereIn('id', $validated['attachment_ids'])
                ->whereNull('email_id')
                ->update(['email_id' => $draft->id]);
        }

        if (isset($validated['subject'])) {
            $draft->thread->update(['subject' => $validated['subject']]);
        }

        $draft->load('attachments');

        return response()->json(new EmailResource($draft));
    }

    public function sendDraft(Mailbox $mailbox, Email $draft, Request $request): JsonResponse
    {
        if ($draft->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Draft does not belong to this mailbox.'], 404);
        }

        if (! $draft->is_draft) {
            return response()->json(['message' => 'Email is not a draft.'], 422);
        }

        $validated = $request->validate([
            'to_addresses' => ['sometimes', 'array', 'min:1'],
            'to_addresses.*' => ['email'],
            'cc_addresses' => ['sometimes', 'nullable', 'array'],
            'cc_addresses.*' => ['email'],
            'bcc_addresses' => ['sometimes', 'nullable', 'array'],
            'bcc_addresses.*' => ['email'],
            'subject' => ['sometimes', 'string', 'max:998'],
            'html_body' => ['sometimes', 'nullable', 'string'],
            'text_body' => ['sometimes', 'nullable', 'string'],
            'attachment_ids' => ['sometimes', 'array'],
            'attachment_ids.*' => ['integer', 'exists:attachments,id'],
        ]);

        if (! empty($validated['attachment_ids'])) {
            Attachment::where('email_id', $draft->id)->update(['email_id' => null]);
            Attachment::whereIn('id', $validated['attachment_ids'])
                ->whereNull('email_id')
                ->update(['email_id' => $draft->id]);
        }

        $draft->update(array_merge(
            array_intersect_key($validated, array_flip([
                'to_addresses', 'cc_addresses', 'bcc_addresses',
                'subject', 'html_body', 'text_body',
            ])),
            ['is_draft' => false, 'sent_at' => now()]
        ));

        $thread = $draft->thread;
        $draftsLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'DRAFTS')->where('type', 'system')->first();
        $sentLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SENT')->where('type', 'system')->first();

        if ($draftsLabel) {
            $thread->labels()->detach($draftsLabel->id);
        }
        if ($sentLabel) {
            $thread->labels()->syncWithoutDetaching([$sentLabel->id]);
        }

        $thread->update([
            'snippet' => Thread::makeSnippet($draft->html_body, $draft->text_body),
            'last_message_at' => now(),
            'message_count' => $thread->emails()->where('is_draft', false)->count(),
        ]);

        SendOutboundEmail::dispatch($draft);

        $draft->load('attachments');

        return response()->json(new EmailResource($draft));
    }

    public function destroyDraft(Mailbox $mailbox, Email $draft): JsonResponse
    {
        if ($draft->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Draft does not belong to this mailbox.'], 404);
        }

        if (! $draft->is_draft) {
            return response()->json(['message' => 'Only drafts can be deleted via this endpoint.'], 422);
        }

        $thread = $draft->thread;

        $draft->attachments()->update(['email_id' => null]);
        $draft->delete();

        if ($thread->emails()->count() === 0) {
            $thread->labels()->detach();
            $thread->threadUserStates()->delete();
            $thread->delete();
        }

        return response()->json(null, 204);
    }
}

<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ThreadResource extends JsonResource
{
    /**
     * Derive a human-readable name from an email address when from_name is missing.
     * e.g. "noreply@business-updates.facebook.com" → "Facebook"
     *      "john.doe@company.com" → "John Doe"
     */
    private static function nameFromAddress(?string $address): ?string
    {
        if (!$address) return null;

        $parts = explode('@', $address);
        $local = $parts[0] ?? '';
        $domain = $parts[1] ?? '';

        // Known no-reply patterns: derive from domain
        $noReplyPatterns = ['noreply', 'no-reply', 'no_reply', 'donotreply', 'mailer-daemon', 'postmaster', 'notifications', 'notify', 'info', 'support', 'hello', 'contact', 'news', 'newsletter', 'updates', 'alert', 'alerts', 'billing', 'receipts', 'team'];
        $isGenericLocal = in_array(strtolower(str_replace(['.', '+'], ['', ''], $local)), $noReplyPatterns, true)
            || str_starts_with(strtolower($local), 'noreply')
            || str_starts_with(strtolower($local), 'no-reply');

        if ($isGenericLocal && $domain) {
            // Extract main domain name: "business-updates.facebook.com" → "facebook"
            $domainParts = explode('.', $domain);
            // Take the second-to-last part (the main brand name)
            $brand = count($domainParts) >= 2 ? $domainParts[count($domainParts) - 2] : $domainParts[0];
            return ucfirst($brand);
        }

        // Regular email: "john.doe" → "John Doe"
        $name = str_replace(['.', '_', '-', '+'], ' ', $local);
        return ucwords(strtolower(trim($name)));
    }

    public function toArray(Request $request): array
    {
        $latest = $this->relationLoaded('latestEmail') ? $this->latestEmail : null;

        // For outbound-only threads (sent/scheduled/drafts), show recipient instead of sender
        $isOutbound = $latest && $latest->direction === 'outbound';
        $toAddress = $isOutbound ? ($latest->to_addresses[0] ?? null) : null;

        return [
            'id' => $this->id,
            'mailbox_id' => $this->mailbox_id,
            'subject' => $this->subject,
            'snippet' => $this->snippet,
            'from_name' => $latest?->from_name ?: self::nameFromAddress($latest?->from_address),
            'from_address' => $latest?->from_address,
            'from_avatar_url' => $latest?->from_address
                ? 'https://www.gravatar.com/avatar/' . md5(strtolower(trim($latest->from_address))) . '?s=64&d=404'
                : null,
            'is_outbound' => $isOutbound,
            'to_name' => $toAddress ? self::nameFromAddress($toAddress) : null,
            'to_address' => $toAddress,
            'has_attachments' => $latest ? ($latest->attachments_count ?? 0) > 0 : false,
            'last_message_at' => $this->last_message_at,
            'message_count' => $this->message_count,
            'category' => $this->category,
            'user_state' => $this->whenLoaded('currentUserState', function () {
                $state = $this->currentUserState->first();

                return $state ? [
                    'is_read' => $state->is_read,
                    'is_starred' => $state->is_starred,
                    'is_trashed' => $state->is_trashed,
                    'is_spam' => $state->is_spam,
                ] : null;
            }),
            'labels' => LabelResource::collection($this->whenLoaded('labels')),
            'emails' => EmailResource::collection($this->whenLoaded('emails')),
        ];
    }
}

<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class EmailResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'thread_id' => $this->thread_id,
            'mailbox_id' => $this->mailbox_id,
            'message_id' => $this->message_id,
            'in_reply_to' => $this->in_reply_to,
            'references_header' => $this->references_header,
            'from_address' => $this->from_address,
            'from_name' => $this->from_name,
            'to_addresses' => $this->to_addresses,
            'cc_addresses' => $this->cc_addresses,
            'bcc_addresses' => $this->bcc_addresses,
            'subject' => $this->subject,
            'html_body' => $this->html_body,
            'text_body' => $this->text_body,
            'direction' => $this->direction,
            'is_draft' => $this->is_draft,
            'sent_at' => $this->sent_at,
            'scheduled_at' => $this->scheduled_at,
            'spam_score' => $this->spam_score,
            'auth_results' => $this->auth_results,
            'list_unsubscribe' => $this->list_unsubscribe,
            'list_id' => $this->list_id,
            'attachments' => AttachmentResource::collection($this->whenLoaded('attachments')),
        ];
    }
}

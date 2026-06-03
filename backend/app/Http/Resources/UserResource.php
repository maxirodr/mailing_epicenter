<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'display_name' => $this->display_name,
            'email' => $this->email,
            'is_admin' => $this->is_admin,
            'two_factor_confirmed_at' => $this->two_factor_confirmed_at,
            'onesignal_player_id' => $this->onesignal_player_id,
            'avatar_url' => $this->avatar_url,
            'timezone' => $this->timezone,
            'language' => $this->language,
            'setup_completed_at' => $this->setup_completed_at,
            'has_passkeys' => $this->resource->relationLoaded('passkeys')
                ? $this->passkeys->isNotEmpty()
                : $this->resource->hasPasskeys(),
            'created_at' => $this->created_at,
            'mailboxes' => $this->whenLoaded('mailboxes', fn () =>
                MailboxResource::collection($this->mailboxes)
            ),
        ];
    }
}

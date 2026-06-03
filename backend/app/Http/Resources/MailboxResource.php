<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MailboxResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'address' => $this->address,
            'domain' => $this->domain,
            'display_name' => $this->display_name,
            'avatar_url' => $this->avatar_url,
            'full_address' => $this->address . '@' . $this->domain,
            'signature' => $this->signature,
            'users' => $this->whenLoaded('users', fn () =>
                UserResource::collection($this->users)
            ),
            'labels' => LabelResource::collection($this->whenLoaded('labels')),
            'role' => $this->whenPivotLoaded('mailbox_user', fn () => $this->pivot->role),
            'inbox_unread_count' => $this->when(isset($this->inbox_unread_count), $this->inbox_unread_count),
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
        ];
    }
}

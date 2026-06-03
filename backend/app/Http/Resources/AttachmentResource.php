<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttachmentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Generate a temporary signed R2 URL directly so the browser can
        // download without needing to hit our authenticated API endpoint.
        $downloadUrl = \Illuminate\Support\Facades\Storage::disk('r2')
            ->temporaryUrl($this->r2_key, now()->addHours(1));

        return [
            'id' => $this->id,
            'filename' => $this->filename,
            'content_type' => $this->content_type,
            'size' => $this->size,
            'download_url' => $downloadUrl,
            'inline_url' => str_starts_with($this->content_type, 'image/')
                ? $this->r2_url
                : null,
        ];
    }
}

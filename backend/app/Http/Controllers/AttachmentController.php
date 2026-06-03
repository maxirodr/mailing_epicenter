<?php

namespace App\Http\Controllers;

use App\Http\Resources\AttachmentResource;
use App\Models\Attachment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AttachmentController extends Controller
{
    private const MAX_SIZE_KB = 25600; // 25MB

    private const ALLOWED_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain', 'text/csv',
        'application/zip', 'application/x-rar-compressed', 'application/gzip',
        'application/json',
        'video/mp4', 'audio/mpeg', 'audio/wav',
    ];

    public function upload(Request $request): JsonResponse
    {
        $request->validate([
            'file' => ['required', 'file', 'max:' . self::MAX_SIZE_KB],
        ]);

        $file = $request->file('file');

        if (! in_array($file->getMimeType(), self::ALLOWED_TYPES)) {
            return response()->json(['message' => 'File type not allowed.'], 422);
        }

        $key = 'attachments/' . Str::uuid() . '/' . $file->getClientOriginalName();

        Storage::disk('r2')->put($key, file_get_contents($file->getRealPath()), [
            'ContentType' => $file->getMimeType(),
        ]);

        $attachment = Attachment::create([
            'email_id' => null,
            'filename' => $file->getClientOriginalName(),
            'content_type' => $file->getMimeType(),
            'size' => $file->getSize(),
            'r2_key' => $key,
            'r2_url' => Storage::disk('r2')->url($key),
        ]);

        return response()->json(new AttachmentResource($attachment), 201);
    }

    public function download(Attachment $attachment, Request $request): JsonResponse
    {
        // If attachment is linked to an email, verify user has access to the mailbox
        if ($attachment->email_id) {
            $mailbox = $attachment->email->mailbox;

            $hasAccess = $mailbox->users()->where('users.id', Auth::id())->exists();

            if (! $hasAccess) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
        }

        // Unattached files (uploaded but not yet linked to an email) are accessible by any authenticated user

        $options = [];
        if ($request->boolean('inline')) {
            $options['ResponseContentDisposition'] = 'inline';
            $options['ResponseContentType'] = $attachment->content_type;
        }

        $url = Storage::disk('r2')->temporaryUrl($attachment->r2_key, now()->addMinutes(15), $options);

        return response()->json(['download_url' => $url]);
    }

    public function stream(Attachment $attachment): StreamedResponse
    {
        $this->authorizeAttachment($attachment);

        $disk = Storage::disk('r2');

        if (! $disk->exists($attachment->r2_key)) {
            abort(404);
        }

        $stream = $disk->readStream($attachment->r2_key);

        return response()->stream(function () use ($stream) {
            if (is_resource($stream)) {
                fpassthru($stream);
                fclose($stream);
            }
        }, 200, [
            'Content-Type' => $attachment->content_type,
            'Content-Length' => (string) $attachment->size,
            'Content-Disposition' => 'inline; filename="' . str_replace('"', '', $attachment->filename) . '"',
            'Cache-Control' => 'private, max-age=300',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function authorizeAttachment(Attachment $attachment): void
    {
        if ($attachment->email_id) {
            $mailbox = $attachment->email->mailbox;
            $hasAccess = $mailbox->users()->where('users.id', Auth::id())->exists();

            if (! $hasAccess) {
                abort(403, 'Forbidden.');
            }
        }
    }
}

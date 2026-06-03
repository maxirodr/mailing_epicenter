<?php

namespace App\Console\Commands;

use App\Models\Attachment;
use App\Models\Email;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class RecoverAttachmentsCommand extends Command
{
    protected $signature = 'emails:recover-attachments
        {--email-ids= : Comma-separated email IDs to recover}
        {--dry-run : Show what would be recovered without actually downloading}';

    protected $description = 'Recover missing attachments from Resend API for emails that lost their attachments';

    public function handle(): int
    {
        $emailIds = $this->option('email-ids')
            ? array_map('intval', explode(',', $this->option('email-ids')))
            : null;
        $dryRun = $this->option('dry-run');

        $apiKey = config('services.resend.key');
        if (! $apiKey) {
            $this->error('RESEND API key not configured.');
            return 1;
        }

        // Step 1: List received emails from Resend API and build message_id -> resend_id map
        $this->info('Fetching received emails from Resend API...');
        $resendMap = $this->buildResendMap($apiKey);
        $this->info('Found ' . count($resendMap) . ' received emails in Resend.');

        // Step 2: Find emails in our DB that should have attachments
        $query = Email::whereDoesntHave('attachments');
        if ($emailIds) {
            $query->whereIn('id', $emailIds);
        }
        $emails = $query->get();

        $recovered = 0;
        $failed = 0;

        foreach ($emails as $email) {
            $messageId = $email->message_id;
            if (! $messageId) continue;

            // Try to find Resend ID by message_id
            $resendId = $resendMap[$messageId] ?? $resendMap[trim($messageId, '<>')] ?? null;

            if (! $resendId) continue;

            // Fetch attachment list from Resend
            $attachments = $this->fetchAttachments($apiKey, $resendId);
            if (empty($attachments)) continue;

            $this->info("Email #{$email->id} ({$email->subject}): " . count($attachments) . ' attachment(s)');

            if ($dryRun) {
                foreach ($attachments as $att) {
                    $this->line("  - {$att['filename']} (would download)");
                }
                $recovered += count($attachments);
                continue;
            }

            foreach ($attachments as $att) {
                $filename = $att['filename'] ?? 'unknown';
                $downloadUrl = $att['download_url'] ?? null;

                if (! $downloadUrl) {
                    $this->warn("  - {$filename}: no download_url");
                    $failed++;
                    continue;
                }

                // Check if already recovered
                if (Attachment::where('email_id', $email->id)->where('filename', $filename)->exists()) {
                    $this->line("  - {$filename}: already exists, skipping");
                    continue;
                }

                try {
                    $response = Http::timeout(60)->get($downloadUrl);
                    if (! $response->successful()) {
                        $this->warn("  - {$filename}: download failed (HTTP {$response->status()})");
                        $failed++;
                        continue;
                    }

                    $content = $response->body();
                    $contentType = $att['content_type'] ?? $response->header('Content-Type', 'application/octet-stream');
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

                    $this->info("  - {$filename}: recovered (" . $this->formatSize(strlen($content)) . ')');
                    $recovered++;

                    // Handle inline images: replace cid: references in HTML
                    $contentId = $att['content_id'] ?? null;
                    if ($contentId && $email->html_body && str_contains($email->html_body, 'cid:')) {
                        $r2Url = Storage::disk('r2')->url($key);
                        $html = str_replace(
                            ['cid:' . $contentId, 'cid:' . trim($contentId, '<>')],
                            $r2Url,
                            $email->html_body
                        );
                        if ($html !== $email->html_body) {
                            $email->update(['html_body' => $html]);
                            $this->line("    (replaced cid:{$contentId} in HTML)");
                        }
                    }
                } catch (\Exception $e) {
                    $this->warn("  - {$filename}: " . $e->getMessage());
                    $failed++;
                }
            }
        }

        $this->newLine();
        $this->info("=== Recovery Summary ===");
        $this->info("Recovered: {$recovered}");
        $this->info("Failed: {$failed}");

        if ($dryRun) {
            $this->warn('This was a DRY RUN — no files were actually downloaded.');
        }

        return 0;
    }

    private function buildResendMap(string $apiKey): array
    {
        $map = [];
        $cursor = null;

        // Paginate through all received emails
        for ($page = 0; $page < 50; $page++) { // Safety limit
            $params = ['limit' => 100];
            if ($cursor) {
                $params['after'] = $cursor;
            }

            $response = Http::withToken($apiKey)
                ->timeout(30)
                ->get('https://api.resend.com/emails/receiving', $params);

            if (! $response->successful()) {
                $this->warn("API request failed: HTTP {$response->status()}");
                break;
            }

            $data = $response->json();
            $emails = $data['data'] ?? [];

            foreach ($emails as $email) {
                $messageId = $email['message_id'] ?? null;
                $resendId = $email['id'] ?? null;
                $hasAttachments = ! empty($email['attachments']);

                if ($messageId && $resendId && $hasAttachments) {
                    $map[$messageId] = $resendId;
                    // Also store without angle brackets
                    $map[trim($messageId, '<>')] = $resendId;
                }
            }

            if (empty($data['has_more']) || empty($emails)) {
                break;
            }

            $cursor = end($emails)['id'];
            $this->line("  Fetched page " . ($page + 1) . " (" . count($map) . " emails with attachments)");
        }

        return $map;
    }

    private function fetchAttachments(string $apiKey, string $resendId): array
    {
        try {
            $response = Http::withToken($apiKey)
                ->timeout(30)
                ->get("https://api.resend.com/emails/receiving/{$resendId}/attachments");

            if ($response->successful()) {
                return $response->json()['data'] ?? [];
            }
        } catch (\Exception $e) {
            $this->warn("Failed to fetch attachments for {$resendId}: {$e->getMessage()}");
        }

        return [];
    }

    private function formatSize(int $bytes): string
    {
        if ($bytes < 1024) return "{$bytes} B";
        if ($bytes < 1024 * 1024) return round($bytes / 1024, 1) . ' KB';
        return round($bytes / (1024 * 1024), 1) . ' MB';
    }
}

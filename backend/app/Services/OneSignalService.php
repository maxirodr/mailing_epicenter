<?php

namespace App\Services;

use App\Models\Mailbox;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class OneSignalService
{
    private ?string $appId;

    private ?string $restApiKey;

    public function __construct()
    {
        $this->appId = config('services.onesignal.app_id');
        $this->restApiKey = config('services.onesignal.rest_api_key');
    }

    public function isConfigured(): bool
    {
        return !empty($this->appId) && !empty($this->restApiKey);
    }

    /**
     * Send notification to a user by their external_id (Laravel user ID).
     * Uses OneSignal Aliases API — no need to store player_id.
     */
    public function sendToExternalUser(int $userId, string $title, string $message, array $data = []): bool
    {
        if (!$this->isConfigured()) {
            Log::debug('OneSignal not configured, skipping notification.');
            return false;
        }

        $payload = [
            'app_id' => $this->appId,
            'include_aliases' => [
                'external_id' => ['user_' . $userId],
            ],
            'target_channel' => 'push',
            'headings' => ['en' => $title],
            'contents' => ['en' => $message],
            'data' => $data,
            'web_url' => config('services.onesignal.frontend_url', 'http://localhost:5173') . '/mail',
        ];

        return $this->send($payload);
    }

    /**
     * Send notification to all users in a mailbox.
     */
    public function sendToMailboxUsers(int $mailboxId, string $title, string $message, array $data = []): void
    {
        if (!$this->isConfigured()) {
            return;
        }

        $mailbox = Mailbox::with('users')->find($mailboxId);
        if (!$mailbox) return;

        $externalIds = $mailbox->users->pluck('id')->map(fn ($id) => 'user_' . $id)->toArray();

        if (empty($externalIds)) return;

        $payload = [
            'app_id' => $this->appId,
            'include_aliases' => [
                'external_id' => $externalIds,
            ],
            'target_channel' => 'push',
            'headings' => ['en' => $title],
            'contents' => ['en' => $message],
            'data' => $data,
            'web_url' => config('services.onesignal.frontend_url', 'http://localhost:5173') . '/mail',
        ];

        $this->send($payload);
    }

    private function send(array $payload): bool
    {
        if (!empty($payload['data'])) {
            $payload['data'] = array_map('strval', $payload['data']);
        }

        try {
            $response = Http::withHeaders([
                'Authorization' => 'Key ' . $this->restApiKey,
                'Content-Type' => 'application/json',
            ])->post('https://api.onesignal.com/notifications', $payload);

            if ($response->failed()) {
                Log::warning('OneSignal notification failed', [
                    'status' => $response->status(),
                    'body' => $response->body(),
                ]);
                return false;
            }

            return true;
        } catch (\Throwable $e) {
            Log::error('OneSignal notification error: ' . $e->getMessage());
            return false;
        }
    }
}

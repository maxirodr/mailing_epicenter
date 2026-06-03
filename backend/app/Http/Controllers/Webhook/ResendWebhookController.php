<?php

namespace App\Http\Controllers\Webhook;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessInboundEmail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class ResendWebhookController extends Controller
{
    public function handle(Request $request): JsonResponse
    {
        if (! $this->verifySignature($request)) {
            return response()->json(['message' => 'Unauthorized.'], 401);
        }

        $payload = $request->all();
        $type = $payload['type'] ?? null;

        Log::info('Webhook received.', ['type' => $type]);

        return match ($type) {
            'email.received' => $this->handleInbound($payload),
            'domain.updated',
            'domain.created',
            'domain.deleted',
            'email.sent',
            'email.delivered',
            'email.bounced',
            'email.complained',
            'email.delivery_delayed' => response()->json(['message' => 'Accepted.'], 200),
            default => response()->json(['message' => 'Unhandled event type.'], 200),
        };
    }

    private function handleInbound(array $payload): JsonResponse
    {
        ProcessInboundEmail::dispatch($payload);

        return response()->json(['message' => 'Accepted.'], 200);
    }

    private function verifySignature(Request $request): bool
    {
        $secret = config('services.resend.webhook_secret');
        if (! $secret) {
            Log::warning('Webhook rejected: RESEND_WEBHOOK_SECRET not configured.');
            return false;
        }

        $svixId = $request->header('svix-id');
        $svixTimestamp = $request->header('svix-timestamp');
        $svixSignature = $request->header('svix-signature');

        if (! $svixId || ! $svixTimestamp || ! $svixSignature) {
            Log::warning('Webhook rejected: missing Svix headers.', [
                'has_svix_id' => (bool) $svixId,
                'has_svix_timestamp' => (bool) $svixTimestamp,
                'has_svix_signature' => (bool) $svixSignature,
                'all_headers' => array_keys($request->headers->all()),
            ]);
            return false;
        }

        // Reject timestamps older than 5 minutes to prevent replay attacks
        $timestampDiff = abs(time() - (int) $svixTimestamp);
        if ($timestampDiff > 300) {
            Log::warning('Webhook rejected: timestamp too old.', [
                'svix_timestamp' => $svixTimestamp,
                'server_time' => time(),
                'diff_seconds' => $timestampDiff,
            ]);
            return false;
        }

        // Remove "whsec_" prefix and base64-decode the secret
        $secretBytes = base64_decode(str_replace('whsec_', '', $secret));

        // Build the signature base string
        $toSign = "{$svixId}.{$svixTimestamp}.{$request->getContent()}";
        $expectedSignature = base64_encode(hash_hmac('sha256', $toSign, $secretBytes, true));

        // Svix sends multiple signatures separated by spaces (e.g., "v1,<sig1> v1,<sig2>")
        $signatures = explode(' ', $svixSignature);
        foreach ($signatures as $sig) {
            $parts = explode(',', $sig, 2);
            if (count($parts) === 2 && $parts[0] === 'v1' && hash_equals($expectedSignature, $parts[1])) {
                Log::info('Webhook signature verified.', ['svix_id' => $svixId]);
                return true;
            }
        }

        Log::warning('Webhook rejected: signature mismatch.', [
            'svix_id' => $svixId,
        ]);

        return false;
    }
}

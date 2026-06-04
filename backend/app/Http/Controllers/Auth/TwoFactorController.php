<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\LoginHistory;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

class TwoFactorController extends Controller
{
    private Google2FA $google2fa;

    public function __construct()
    {
        $this->google2fa = new Google2FA();
    }

    public function setup(Request $request): JsonResponse
    {
        $user = $request->user();
        $secret = $this->google2fa->generateSecretKey();

        $request->session()->put('2fa_setup_secret', $secret);

        $qrCodeUrl = $this->google2fa->getQRCodeUrl(
            'Epicenter Mail',
            $user->email,
            $secret,
        );

        return response()->json([
            'secret' => $secret,
            'qr_url' => $qrCodeUrl,
        ]);
    }

    public function confirmSetup(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $secret = $request->session()->get('2fa_setup_secret');

        if (! $secret) {
            return response()->json([
                'message' => 'No 2FA setup in progress.',
            ], 422);
        }

        $valid = $this->google2fa->verifyKey($secret, $request->code);

        if (! $valid) {
            return response()->json([
                'message' => 'Invalid verification code.',
            ], 422);
        }

        $user = $request->user();
        $recoveryCodes = $this->generateRecoveryCodes();

        $user->update([
            'google2fa_secret' => $secret,
            'two_factor_confirmed_at' => now(),
            'two_factor_recovery_codes' => Crypt::encryptString(json_encode($recoveryCodes)),
        ]);

        $request->session()->forget('2fa_setup_secret');

        return response()->json([
            'message' => 'Two-factor authentication enabled.',
            'recovery_codes' => $recoveryCodes,
        ]);
    }

    public function verifyTotp(Request $request): JsonResponse
    {
        $request->validate([
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $userId = $request->session()->get('pending_2fa_user_id');

        if (! $userId) {
            return response()->json([
                'message' => 'No pending two-factor authentication.',
            ], 422);
        }

        $user = User::find($userId);

        if (! $user || ! $user->google2fa_secret) {
            $request->session()->forget('pending_2fa_user_id');

            return response()->json([
                'message' => 'Invalid session state.',
            ], 422);
        }

        $valid = $this->google2fa->verifyKey($user->google2fa_secret, $request->code);

        if (! $valid) {
            return response()->json([
                'message' => 'Invalid verification code.',
            ], 422);
        }

        $request->session()->forget('pending_2fa_user_id');

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        LoginHistory::create([
            'user_id' => $user->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => true,
            'method' => 'totp',
            'created_at' => now(),
        ]);

        return response()->json([
            'user' => new UserResource($user->load(['mailboxes', 'passkeys'])),
        ]);
    }

    public function getRecoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user->two_factor_recovery_codes) {
            return response()->json(['recovery_codes' => []], 200);
        }

        $codes = json_decode(Crypt::decryptString($user->two_factor_recovery_codes), true);

        return response()->json(['recovery_codes' => $codes]);
    }

    public function regenerateRecoveryCodes(Request $request): JsonResponse
    {
        $user = $request->user();

        if (!$user->two_factor_confirmed_at) {
            return response()->json(['message' => 'Two-factor authentication is not enabled.'], 422);
        }

        $recoveryCodes = $this->generateRecoveryCodes();
        $user->update([
            'two_factor_recovery_codes' => Crypt::encryptString(json_encode($recoveryCodes)),
        ]);

        return response()->json(['recovery_codes' => $recoveryCodes]);
    }

    public function disable(Request $request): JsonResponse
    {
        return response()->json([
            'message' => 'Two-factor authentication is mandatory and cannot be disabled.',
        ], 403);
    }

    private function generateRecoveryCodes(int $count = 8): array
    {
        $codes = [];
        for ($i = 0; $i < $count; $i++) {
            $codes[] = Str::upper(Str::random(4) . '-' . Str::random(4));
        }

        return $codes;
    }
}

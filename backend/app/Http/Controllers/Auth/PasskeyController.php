<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\LoginHistory;
use App\Http\Resources\UserResource;
use App\Services\WebAuthnService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class PasskeyController extends Controller
{
    public function __construct(
        private WebAuthnService $webauthn,
    ) {}

    // ── Public: Login with Passkey ──

    public function loginOptions(Request $request): JsonResponse
    {
        $options = $this->webauthn->generateAuthenticationOptions();

        return response()->json($options);
    }

    public function loginVerify(Request $request): JsonResponse
    {
        $request->validate([
            'id' => ['required', 'string'],
            'rawId' => ['required', 'string'],
            'type' => ['required', 'string'],
            'response' => ['required', 'array'],
        ]);

        try {
            $user = $this->webauthn->verifyAuthentication($request->all(), $request->input('challengeKey'));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Passkey login verification failed', [
                'error' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);

            return response()->json(['message' => 'Passkey verification failed.'], 422);
        }

        Auth::guard('web')->login($user);
        $request->session()->regenerate();

        LoginHistory::create([
            'user_id' => $user->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => true,
            'method' => 'passkey',
            'created_at' => now(),
        ]);

        return response()->json([
            'user' => new UserResource($user->load(['mailboxes', 'passkeys'])),
        ]);
    }

    // ── Authenticated: Register Passkey ──

    public function registerOptions(Request $request): JsonResponse
    {
        $options = $this->webauthn->generateRegistrationOptions($request->user());

        return response()->json($options);
    }

    public function registerVerify(Request $request): JsonResponse
    {
        $request->validate([
            'id' => ['required', 'string'],
            'rawId' => ['required', 'string'],
            'type' => ['required', 'string'],
            'response' => ['required', 'array'],
            'name' => ['sometimes', 'string', 'max:255'],
        ]);

        try {
            $passkey = $this->webauthn->verifyRegistration($request->all(), $request->user());
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Passkey registration failed', [
                'error' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json(['message' => 'Passkey registration failed: ' . $e->getMessage()], 422);
        }

        return response()->json([
            'message' => 'Passkey registered successfully.',
            'passkey' => [
                'id' => $passkey->id,
                'name' => $passkey->name,
                'created_at' => $passkey->created_at,
            ],
        ]);
    }

    // ── Authenticated: Manage Passkeys ──

    public function index(Request $request): JsonResponse
    {
        $passkeys = $request->user()->passkeys()
            ->select('id', 'name', 'created_at')
            ->orderByDesc('created_at')
            ->get();

        return response()->json($passkeys);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $passkey = $request->user()->passkeys()->findOrFail($id);
        $passkey->delete();

        return response()->json(['message' => 'Passkey deleted.']);
    }
}

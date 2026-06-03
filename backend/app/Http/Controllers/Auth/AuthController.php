<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Email;
use App\Models\LoginHistory;
use App\Models\User;
use App\Models\UserPreference;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($request->only('email', 'password'))) {
            $failedUser = User::where('email', $request->email)->first();
            if ($failedUser) {
                LoginHistory::create([
                    'user_id' => $failedUser->id,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                    'success' => false,
                    'method' => 'password',
                    'created_at' => now(),
                ]);
            }

            return response()->json([
                'message' => 'Invalid credentials.',
            ], 401);
        }

        $user = Auth::user();

        if ($user->google2fa_secret !== null && $user->two_factor_confirmed_at !== null) {
            Auth::guard('web')->logout();

            $request->session()->put('pending_2fa_user_id', $user->id);
            $request->session()->save();

            $methods = ['totp'];
            if ($user->passkeys()->exists()) {
                $methods[] = 'passkey';
            }

            return response()->json([
                'two_factor_required' => true,
                'methods' => $methods,
            ]);
        }

        LoginHistory::create([
            'user_id' => $user->id,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
            'success' => true,
            'method' => 'password',
            'created_at' => now(),
        ]);

        $request->session()->regenerate();

        return response()->json([
            'two_factor_required' => false,
            'setup_required' => $user->setup_completed_at === null,
            'user' => new UserResource($user->load(['mailboxes', 'passkeys'])),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        try {
            return response()->json(new UserResource($request->user()->load(['mailboxes', 'passkeys'])));
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('/auth/me failed', [
                'error' => $e->getMessage(),
                'file' => $e->getFile() . ':' . $e->getLine(),
            ]);
            throw $e;
        }
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'current_password' => ['required', 'string'],
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $user = $request->user();

        if (! Hash::check($validated['current_password'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->update(['password' => Hash::make($validated['password'])]);

        return response()->json(['message' => 'Password updated.']);
    }

    public function updateNotificationSettings(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'onesignal_player_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'push_enabled' => ['sometimes', 'boolean'],
        ]);

        $user = $request->user();

        if (array_key_exists('onesignal_player_id', $validated)) {
            $user->onesignal_player_id = $validated['onesignal_player_id'];
        }

        $user->save();

        return response()->json([
            'message' => 'Notification settings updated.',
            'onesignal_player_id' => $user->onesignal_player_id,
        ]);
    }

    public function updateProfile(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'timezone' => ['sometimes', 'string', 'max:255'],
            'language' => ['sometimes', 'string', 'max:10'],
        ]);

        $user = $request->user();
        $user->update($validated);

        return response()->json(new UserResource($user->load(['mailboxes', 'passkeys'])));
    }

    public function uploadAvatar(Request $request): JsonResponse
    {
        $request->validate(['avatar' => ['required', 'image', 'max:2048']]);

        $file = $request->file('avatar');
        $path = 'avatars/' . $request->user()->id . '/' . Str::uuid() . '.' . $file->getClientOriginalExtension();

        Storage::disk('r2')->put($path, file_get_contents($file), ['ContentType' => $file->getMimeType()]);

        $url = Storage::disk('r2')->url($path);
        $request->user()->update(['avatar_url' => $url]);

        return response()->json(['avatar_url' => $url]);
    }

    public function loginHistory(Request $request): JsonResponse
    {
        $history = LoginHistory::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json($history);
    }

    public function getPreferences(Request $request): JsonResponse
    {
        $prefs = $request->user()->preferences;
        $defaults = [
            'theme' => 'dark',
            'density' => 'normal',
            'font_size' => 'normal',
            'default_mailbox_id' => null,
            'reply_behavior' => 'reply',
            'conversation_view' => true,
            'mark_as_read_on_view' => true,
            'notification_categories' => ['primary', 'updates'],
            'notify_sent' => false,
        ];

        return response()->json(array_merge($defaults, $prefs?->preferences ?? []));
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'theme' => ['sometimes', 'in:dark,light,auto'],
            'density' => ['sometimes', 'in:compact,normal,spacious'],
            'font_size' => ['sometimes', 'in:small,normal,large'],
            'default_mailbox_id' => ['sometimes', 'nullable', 'integer'],
            'reply_behavior' => ['sometimes', 'in:reply,reply_all'],
            'conversation_view' => ['sometimes', 'boolean'],
            'mark_as_read_on_view' => ['sometimes', 'boolean'],
            'notification_categories' => ['sometimes', 'array'],
            'notification_categories.*' => ['string', 'in:primary,promotions,social,updates,forums'],
            'notify_sent' => ['sometimes', 'boolean'],
        ]);

        $pref = UserPreference::firstOrCreate(
            ['user_id' => $request->user()->id],
            ['preferences' => []]
        );

        $pref->update(['preferences' => array_merge($pref->preferences ?? [], $validated)]);

        return response()->json($pref->preferences);
    }

    public function deleteAccount(Request $request): JsonResponse
    {
        $request->validate(['password' => ['required', 'string']]);

        $user = $request->user();

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        $user->mailboxes()->detach();

        $user->update([
            'name' => 'Deleted User',
            'email' => 'deleted_' . $user->id . '@deleted.local',
            'password' => Hash::make(Str::random(40)),
            'google2fa_secret' => null,
            'two_factor_confirmed_at' => null,
            'onesignal_player_id' => null,
            'avatar_url' => null,
        ]);

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Account deleted.']);
    }

    public function exportData(Request $request): JsonResponse
    {
        $user = $request->user();
        $user->load(['mailboxes', 'passkeys']);

        $data = [
            'user' => [
                'name' => $user->name,
                'email' => $user->email,
                'created_at' => $user->created_at,
            ],
            'mailboxes' => $user->mailboxes->map(fn ($m) => [
                'address' => $m->address . '@' . $m->domain,
                'display_name' => $m->display_name,
            ]),
            'emails' => Email::whereIn('mailbox_id', $user->mailboxes->pluck('id'))
                ->select('from_address', 'to_addresses', 'subject', 'text_body', 'direction', 'sent_at')
                ->orderByDesc('sent_at')
                ->limit(1000)
                ->get(),
            'exported_at' => now()->toIso8601String(),
        ];

        return response()->json($data);
    }

    public function setupComplete(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user->two_factor_confirmed_at) {
            return response()->json([
                'message' => 'Two-factor authentication must be enabled before completing setup.',
            ], 422);
        }

        if ($user->setup_completed_at) {
            return response()->json([
                'message' => 'Setup already completed.',
            ]);
        }

        $user->update(['setup_completed_at' => now()]);

        return response()->json([
            'message' => 'Setup completed.',
            'user' => new UserResource($user->load(['mailboxes', 'passkeys'])),
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'message' => 'Logged out.',
        ]);
    }
}

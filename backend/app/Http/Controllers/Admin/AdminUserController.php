<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\Mailbox;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Models\UserInvite;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AdminUserController extends Controller
{
    public function index(): JsonResponse
    {
        $users = User::with('mailboxes')->paginate(20);

        return response()->json(UserResource::collection($users)->response()->getData(true));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['sometimes', 'string', 'min:8'],
            'is_admin' => ['sometimes', 'boolean'],
            'create_mailbox' => ['sometimes', 'boolean'],
            'send_invite' => ['sometimes', 'boolean'],
        ]);

        $createMailbox = $validated['create_mailbox'] ?? false;
        $sendInvite = $validated['send_invite'] ?? false;
        unset($validated['create_mailbox'], $validated['send_invite']);

        // If sending invite, password is not required — set a random one
        if ($sendInvite && empty($validated['password'])) {
            $validated['password'] = Hash::make(Str::random(40));
        } elseif (! empty($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        } else {
            return response()->json(['message' => 'Password is required when not sending an invite.'], 422);
        }

        $user = User::create($validated);

        if ($createMailbox) {
            $parts = explode('@', $user->email, 2);
            if (count($parts) === 2 && ! Mailbox::where('address', $parts[0])->where('domain', $parts[1])->exists()) {
                $mailbox = Mailbox::create([
                    'address' => $parts[0],
                    'domain' => $parts[1],
                    'display_name' => $user->name,
                ]);

                foreach ([
                    ['name' => 'INBOX', 'type' => 'system', 'sort_order' => 1],
                    ['name' => 'SENT', 'type' => 'system', 'sort_order' => 2],
                    ['name' => 'DRAFTS', 'type' => 'system', 'sort_order' => 3],
                    ['name' => 'SPAM', 'type' => 'system', 'sort_order' => 4],
                    ['name' => 'TRASH', 'type' => 'system', 'sort_order' => 5],
                    ['name' => 'SCHEDULED', 'type' => 'system', 'sort_order' => 6],
                ] as $label) {
                    $mailbox->labels()->create($label);
                }

                $mailbox->users()->attach($user->id, ['role' => 'owner']);
            }
        }

        $invite = null;
        if ($sendInvite) {
            $invite = UserInvite::create([
                'user_id' => $user->id,
                'token' => Str::random(64),
                'expires_at' => now()->addDays(7),
            ]);
        }

        $user->load('mailboxes');

        $response = new UserResource($user);
        $data = $response->toArray(request());

        if ($invite) {
            $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');
            $data['invite_url'] = $frontendUrl . '/invite/' . $invite->token;
        }

        return response()->json($data, 201);
    }

    public function show(User $user): JsonResponse
    {
        $user->load('mailboxes');

        return response()->json(new UserResource($user));
    }

    public function update(Request $request, User $user): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'email' => ['sometimes', 'string', 'email', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['sometimes', 'string', 'min:8'],
            'is_admin' => ['sometimes', 'boolean'],
        ]);

        if (isset($validated['password'])) {
            $validated['password'] = Hash::make($validated['password']);
        }

        $user->update($validated);

        return response()->json(new UserResource($user));
    }

    public function destroy(Request $request, User $user): JsonResponse
    {
        if ($request->user()->id === $user->id) {
            return response()->json(['message' => 'Cannot delete your own account.'], 403);
        }

        $user->delete();

        return response()->json(null, 204);
    }

    public function resendInvite(Request $request, User $user): JsonResponse
    {
        // Invalidate any existing invites
        UserInvite::where('user_id', $user->id)->whereNull('used_at')->update(['used_at' => now()]);

        $invite = UserInvite::create([
            'user_id' => $user->id,
            'token' => Str::random(64),
            'expires_at' => now()->addDays(7),
        ]);

        $frontendUrl = rtrim(config('app.frontend_url', config('app.url')), '/');

        return response()->json([
            'invite_url' => $frontendUrl . '/invite/' . $invite->token,
            'expires_at' => $invite->expires_at,
        ]);
    }
}

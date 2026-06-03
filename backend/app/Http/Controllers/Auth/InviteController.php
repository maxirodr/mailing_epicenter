<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\UserInvite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class InviteController extends Controller
{
    public function show(string $token): JsonResponse
    {
        $invite = UserInvite::with('user:id,name,email')
            ->where('token', $token)
            ->first();

        if (! $invite) {
            return response()->json(['message' => 'Invalid invite link.'], 404);
        }

        if ($invite->used_at !== null) {
            return response()->json(['message' => 'This invite has already been used.'], 410);
        }

        if ($invite->expires_at->isPast()) {
            return response()->json(['message' => 'This invite has expired.'], 410);
        }

        return response()->json([
            'user' => [
                'name' => $invite->user->name,
                'email' => $invite->user->email,
            ],
            'expires_at' => $invite->expires_at,
        ]);
    }

    public function complete(Request $request, string $token): JsonResponse
    {
        $request->validate([
            'password' => ['required', 'string', 'min:8', 'confirmed'],
        ]);

        $invite = UserInvite::with('user')
            ->where('token', $token)
            ->first();

        if (! $invite || ! $invite->isValid()) {
            return response()->json(['message' => 'Invalid or expired invite link.'], 422);
        }

        $user = $invite->user;
        $user->update([
            'password' => Hash::make($request->password),
        ]);

        $invite->update(['used_at' => now()]);

        return response()->json([
            'message' => 'Password set successfully. You can now log in.',
        ]);
    }
}

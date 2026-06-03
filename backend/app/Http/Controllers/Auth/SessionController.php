<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\UserSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Session;

class SessionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $sessions = UserSession::where('user_id', $request->user()->id)
            ->orderByDesc('last_activity')
            ->limit(50)
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'name' => $s->name,
                'ip_address' => $s->ip_address,
                'user_agent' => $s->user_agent,
                'device' => $this->parseDevice($s->user_agent),
                'last_activity' => $s->last_activity,
                'is_current' => $s->session_id === request()->session()->getId(),
            ]);

        return response()->json($sessions);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $session = UserSession::where('user_id', $request->user()->id)->findOrFail($id);

        if ($session->session_id === $request->session()->getId()) {
            return response()->json(['message' => 'Cannot revoke your current session.'], 422);
        }

        // Destroy the actual Laravel session file/record
        $handler = Session::getHandler();
        $handler->destroy($session->session_id);

        $session->delete();

        return response()->json(null, 204);
    }

    public function destroyOthers(Request $request): JsonResponse
    {
        $others = UserSession::where('user_id', $request->user()->id)
            ->where('session_id', '!=', $request->session()->getId())
            ->get();

        $handler = Session::getHandler();
        foreach ($others as $session) {
            $handler->destroy($session->session_id);
            $session->delete();
        }

        return response()->json(['message' => 'All other sessions revoked.']);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $session = UserSession::where('user_id', $request->user()->id)->findOrFail($id);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
        ]);

        $session->update(['name' => $validated['name']]);

        return response()->json([
            'id' => $session->id,
            'name' => $session->name,
        ]);
    }

    private function parseDevice(?string $ua): string
    {
        if (!$ua) return 'Unknown';
        if (str_contains($ua, 'Mobile')) return 'Mobile';
        if (str_contains($ua, 'Chrome')) return 'Chrome';
        if (str_contains($ua, 'Firefox')) return 'Firefox';
        if (str_contains($ua, 'Safari')) return 'Safari';
        if (str_contains($ua, 'Edge')) return 'Edge';

        return 'Browser';
    }
}

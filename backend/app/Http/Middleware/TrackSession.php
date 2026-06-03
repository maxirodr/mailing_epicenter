<?php

namespace App\Http\Middleware;

use App\Models\UserSession;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class TrackSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        if ($request->user() && $request->session()->getId()) {
            $sessionId = $request->session()->getId();
            $existing = UserSession::where('session_id', $sessionId)->exists();

            $attributes = [
                'user_id' => $request->user()->id,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
                'last_activity' => now(),
            ];

            if (! $existing) {
                $attributes['name'] = self::generateSessionName($request->userAgent());
            }

            UserSession::updateOrCreate(
                ['session_id' => $sessionId],
                $attributes,
            );
        }

        return $response;
    }

    private static function generateSessionName(?string $ua): string
    {
        if (! $ua) {
            return 'Unknown Device';
        }

        // Detect browser
        $browser = 'Browser';
        if (str_contains($ua, 'Edg/') || str_contains($ua, 'Edge/')) {
            $browser = 'Edge';
        } elseif (str_contains($ua, 'OPR/') || str_contains($ua, 'Opera')) {
            $browser = 'Opera';
        } elseif (str_contains($ua, 'Chrome/') && ! str_contains($ua, 'Edg/')) {
            $browser = 'Chrome';
        } elseif (str_contains($ua, 'Firefox/')) {
            $browser = 'Firefox';
        } elseif (str_contains($ua, 'Safari/') && ! str_contains($ua, 'Chrome/')) {
            $browser = 'Safari';
        }

        // Detect OS
        $os = '';
        if (str_contains($ua, 'iPhone')) {
            $os = 'iPhone';
        } elseif (str_contains($ua, 'iPad')) {
            $os = 'iPad';
        } elseif (str_contains($ua, 'Android')) {
            $os = 'Android';
        } elseif (str_contains($ua, 'Macintosh') || str_contains($ua, 'Mac OS')) {
            $os = 'Mac';
        } elseif (str_contains($ua, 'Windows')) {
            $os = 'Windows';
        } elseif (str_contains($ua, 'Linux')) {
            $os = 'Linux';
        }

        return $os ? "{$browser} on {$os}" : $browser;
    }
}

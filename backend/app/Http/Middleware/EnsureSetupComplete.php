<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureSetupComplete
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user() && $request->user()->setup_completed_at === null) {
            return response()->json([
                'message' => 'Account setup required.',
                'setup_required' => true,
            ], 403);
        }

        return $next($request);
    }
}

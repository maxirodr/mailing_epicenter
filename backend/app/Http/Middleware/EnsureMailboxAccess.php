<?php

namespace App\Http\Middleware;

use App\Models\Mailbox;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureMailboxAccess
{
    public function handle(Request $request, Closure $next): Response
    {
        $mailbox = $request->route('mailbox');

        if ($mailbox instanceof Mailbox) {
            $hasAccess = $request->user()
                ->mailboxes()
                ->where('mailboxes.id', $mailbox->id)
                ->exists();

            if (! $hasAccess) {
                return response()->json(['message' => 'Forbidden.'], 403);
            }
        }

        return $next($request);
    }
}

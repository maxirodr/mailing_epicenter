<?php

namespace App\Http\Controllers;

use App\Http\Resources\ThreadResource;
use App\Models\Mailbox;
use App\Models\Thread;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SearchController extends Controller
{
    private function toBooleanQuery(string $term): string
    {
        // Strip characters that are FULLTEXT operators or delimiters
        $clean = preg_replace('/[+\-<>()~*"@\[\]{}]/', ' ', $term);

        // Extract words >= 3 chars (innodb_ft_min_token_size default)
        preg_match_all('/\w{3,}/u', $clean, $matches);

        // Prefix each word with + (require ALL) and suffix with * (prefix match)
        return implode(' ', array_map(fn ($w) => '+' . $w . '*', $matches[0]));
    }

    public function search(Mailbox $mailbox, Request $request): JsonResponse
    {
        $request->validate([
            'q' => ['sometimes', 'nullable', 'string', 'max:500'],
            'from' => ['sometimes', 'nullable', 'string', 'max:255'],
            'to' => ['sometimes', 'nullable', 'string', 'max:255'],
            'after' => ['sometimes', 'nullable', 'date'],
            'before' => ['sometimes', 'nullable', 'date'],
            'has_attachment' => ['sometimes', 'nullable', 'boolean'],
            'is_unread' => ['sometimes', 'nullable', 'boolean'],
            'category' => ['sometimes', 'nullable', 'string', 'in:primary,promotions,social,updates,forums'],
            'label' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $query = Thread::where('mailbox_id', $mailbox->id);

        $hasEmailFilter = $request->filled('q') || $request->filled('from') || $request->filled('to')
            || $request->filled('after') || $request->filled('before') || $request->boolean('has_attachment');

        if ($hasEmailFilter) {
            $query->whereHas('emails', function ($emailQuery) use ($request) {
                if ($request->filled('q')) {
                    $term = $request->query('q');
                    $booleanTerm = $this->toBooleanQuery($term);

                    $emailQuery->where(function ($q) use ($term, $booleanTerm) {
                        $q->where('subject', 'LIKE', '%' . $term . '%')
                            ->orWhere('from_address', 'LIKE', '%' . $term . '%')
                            ->orWhere('from_name', 'LIKE', '%' . $term . '%')
                            ->orWhere('to_addresses', 'LIKE', '%' . $term . '%')
                            ->orWhereFullText(['subject', 'text_body'], $booleanTerm, ['mode' => 'boolean']);
                    });
                }

                if ($request->filled('from')) {
                    $emailQuery->where('from_address', 'LIKE', '%' . $request->query('from') . '%');
                }

                if ($request->filled('to')) {
                    $emailQuery->whereJsonContains('to_addresses', $request->query('to'));
                }

                if ($request->filled('after')) {
                    $emailQuery->where('sent_at', '>=', $request->query('after'));
                }

                if ($request->filled('before')) {
                    $emailQuery->where('sent_at', '<=', $request->query('before'));
                }

                if ($request->boolean('has_attachment')) {
                    $emailQuery->whereHas('attachments');
                }
            });
        }

        if ($request->has('is_unread') && $request->boolean('is_unread')) {
            $userId = auth()->id();
            $query->where(function ($q) use ($userId) {
                $q->whereDoesntHave('currentUserState')
                    ->orWhereHas('currentUserState', fn ($s) => $s->where('user_id', $userId)->where('is_read', false));
            });
        }

        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }

        if ($request->filled('label')) {
            $query->whereHas('labels', function ($q) use ($request) {
                $q->where('name', $request->query('label'));
            });
        }

        $threads = $query->with(['latestEmail' => fn ($q) => $q->withCount('attachments'), 'currentUserState', 'labels'])
            ->orderByDesc('last_message_at')
            ->paginate(25);

        return response()->json(ThreadResource::collection($threads)->response()->getData(true));
    }
}

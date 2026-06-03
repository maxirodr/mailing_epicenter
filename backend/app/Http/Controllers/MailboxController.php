<?php

namespace App\Http\Controllers;

use App\Http\Resources\MailboxResource;
use App\Models\AutoReply;
use App\Models\Email;
use App\Models\Mailbox;
use App\Models\Thread;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class MailboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $mailboxes = $request->user()
            ->mailboxes()
            ->with('labels')
            ->get();

        $mailboxIds = $mailboxes->pluck('id');

        $unreadCounts = DB::table('threads')
            ->join('thread_label', 'threads.id', '=', 'thread_label.thread_id')
            ->join('labels', 'thread_label.label_id', '=', 'labels.id')
            ->leftJoin('thread_user_states', function ($join) use ($userId) {
                $join->on('threads.id', '=', 'thread_user_states.thread_id')
                    ->where('thread_user_states.user_id', '=', $userId);
            })
            ->whereIn('threads.mailbox_id', $mailboxIds)
            ->where('labels.name', 'INBOX')
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_trashed')
                  ->orWhere('thread_user_states.is_trashed', false);
            })
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_read')
                  ->orWhere('thread_user_states.is_read', false);
            })
            ->select('threads.mailbox_id', DB::raw('COUNT(DISTINCT threads.id) as unread_count'))
            ->groupBy('threads.mailbox_id')
            ->pluck('unread_count', 'mailbox_id');

        $mailboxes->each(function ($mailbox) use ($unreadCounts) {
            $mailbox->setAttribute('inbox_unread_count', $unreadCounts[$mailbox->id] ?? 0);
        });

        return response()->json(MailboxResource::collection($mailboxes));
    }

    public function counts(Mailbox $mailbox, Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $counts = DB::table('threads')
            ->join('thread_label', 'threads.id', '=', 'thread_label.thread_id')
            ->join('labels', 'thread_label.label_id', '=', 'labels.id')
            ->leftJoin('thread_user_states', function ($join) use ($userId) {
                $join->on('threads.id', '=', 'thread_user_states.thread_id')
                    ->where('thread_user_states.user_id', '=', $userId);
            })
            ->where('threads.mailbox_id', $mailbox->id)
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_trashed')
                  ->orWhere('thread_user_states.is_trashed', false);
            })
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_read')
                  ->orWhere('thread_user_states.is_read', false);
            })
            ->select('labels.name', DB::raw('COUNT(DISTINCT threads.id) as unread_count'))
            ->groupBy('labels.name')
            ->pluck('unread_count', 'name');

        return response()->json($counts);
    }

    public function categoryCounts(Mailbox $mailbox, Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $counts = DB::table('threads')
            ->join('thread_label', 'threads.id', '=', 'thread_label.thread_id')
            ->join('labels', 'thread_label.label_id', '=', 'labels.id')
            ->leftJoin('thread_user_states', function ($join) use ($userId) {
                $join->on('threads.id', '=', 'thread_user_states.thread_id')
                    ->where('thread_user_states.user_id', '=', $userId);
            })
            ->where('threads.mailbox_id', $mailbox->id)
            ->where('labels.name', 'INBOX')
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_trashed')
                  ->orWhere('thread_user_states.is_trashed', false);
            })
            ->where(function ($q) {
                $q->whereNull('thread_user_states.is_read')
                  ->orWhere('thread_user_states.is_read', false);
            })
            ->select('threads.category', DB::raw('COUNT(DISTINCT threads.id) as unread_count'))
            ->groupBy('threads.category')
            ->pluck('unread_count', 'category');

        return response()->json($counts);
    }

    public function suggestContacts(Mailbox $mailbox, Request $request): JsonResponse
    {
        $q = $request->query('q', '');
        if (strlen($q) < 2) {
            return response()->json([]);
        }

        // Search both inbound (from) and outbound (to) contacts, ordered by most recent activity
        $fromContacts = Email::where('mailbox_id', $mailbox->id)
            ->where(function ($query) use ($q) {
                $query->where('from_address', 'LIKE', "%{$q}%")
                      ->orWhere('from_name', 'LIKE', "%{$q}%");
            })
            ->selectRaw('from_address as address, from_name as name, MAX(sent_at) as last_used')
            ->groupBy('from_address', 'from_name');

        $toContacts = Email::where('mailbox_id', $mailbox->id)
            ->where('direction', 'outbound')
            ->whereRaw("JSON_SEARCH(to_addresses, 'one', ?, NULL, '$[*]') IS NOT NULL", ["%{$q}%"])
            ->selectRaw("JSON_UNQUOTE(JSON_EXTRACT(to_addresses, '$[0]')) as address, NULL as name, MAX(sent_at) as last_used")
            ->groupBy('address');

        $contacts = $fromContacts->unionAll($toContacts)
            ->orderByDesc('last_used')
            ->limit(20)
            ->get();

        // Deduplicate by address, keeping the entry with a name
        $seen = [];
        $result = [];
        foreach ($contacts as $c) {
            $addr = strtolower($c->address);
            if (isset($seen[$addr])) continue;
            $seen[$addr] = true;
            $result[] = ['address' => $c->address, 'name' => $c->name];
            if (count($result) >= 10) break;
        }

        return response()->json($result);
    }

    public function updateSignature(Mailbox $mailbox, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'signature' => ['nullable', 'string', 'max:10000'],
        ]);

        $mailbox->update(['signature' => $validated['signature']]);

        return response()->json(new MailboxResource($mailbox));
    }

    public function updateProfile(Mailbox $mailbox, Request $request): JsonResponse
    {
        $request->validate([
            'display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'avatar' => ['sometimes', 'nullable', 'image', 'max:2048'],
        ]);

        if ($request->hasFile('avatar')) {
            $file = $request->file('avatar');
            $path = 'mailbox-avatars/' . $mailbox->id . '/' . Str::uuid() . '.' . $file->getClientOriginalExtension();

            Storage::disk('r2')->put($path, file_get_contents($file), [
                'ContentType' => $file->getMimeType(),
            ]);

            $mailbox->avatar_url = Storage::disk('r2')->url($path);
        }

        if ($request->has('display_name')) {
            $mailbox->display_name = $request->input('display_name') ?: null;
        }

        $mailbox->save();

        return response()->json(new MailboxResource($mailbox));
    }

    public function getAutoReply(Mailbox $mailbox): JsonResponse
    {
        $autoReply = $mailbox->autoReply ?? new AutoReply([
            'mailbox_id' => $mailbox->id,
            'enabled' => false,
            'subject' => 'Out of Office',
            'message' => '',
        ]);

        return response()->json($autoReply);
    }

    public function updateAutoReply(Mailbox $mailbox, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'enabled' => ['required', 'boolean'],
            'subject' => ['required_if:enabled,true', 'string', 'max:255'],
            'message' => ['required_if:enabled,true', 'string', 'max:5000'],
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
        ]);

        $autoReply = AutoReply::updateOrCreate(
            ['mailbox_id' => $mailbox->id],
            $validated
        );

        return response()->json($autoReply);
    }
}

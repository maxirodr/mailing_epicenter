<?php

namespace App\Http\Controllers;

use App\Http\Resources\ThreadResource;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use App\Models\DomainBlacklist;
use App\Models\SenderBlacklist;
use App\Models\SenderCategoryOverride;
use App\Models\SenderWhitelist;
use App\Models\ThreadUserState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ThreadController extends Controller
{
    public function index(Mailbox $mailbox, Request $request): JsonResponse
    {
        $query = Thread::where('mailbox_id', $mailbox->id)
            ->with(['latestEmail' => fn ($q) => $q->withCount('attachments'), 'currentUserState', 'labels']);

        if ($request->has('label')) {
            $query->whereHas('labels', function ($q) use ($request) {
                $q->where('name', $request->query('label'));
            });
        }

        if ($request->has('category')) {
            $query->where('category', $request->query('category'));
        }

        if ($request->has('is_unread') && $request->boolean('is_unread')) {
            $userId = auth()->id();
            $query->where(function ($q) use ($userId) {
                $q->whereDoesntHave('currentUserState')
                    ->orWhereHas('currentUserState', fn ($s) => $s->where('user_id', $userId)->where('is_read', false));
            });
        }

        $threads = $query->orderByDesc('last_message_at')
            ->paginate(25);

        return response()->json(ThreadResource::collection($threads)->response()->getData(true));
    }

    public function show(Mailbox $mailbox, Thread $thread): JsonResponse
    {
        if ($thread->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Thread does not belong to this mailbox.'], 404);
        }

        $thread->load(['emails' => fn ($q) => $q->with('attachments')->orderByDesc('sent_at'), 'currentUserState', 'labels']);

        return response()->json(new ThreadResource($thread));
    }

    public function update(Mailbox $mailbox, Thread $thread, Request $request): JsonResponse
    {
        if ($thread->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Thread does not belong to this mailbox.'], 404);
        }

        $validated = $request->validate([
            'is_read' => ['sometimes', 'boolean'],
            'is_starred' => ['sometimes', 'boolean'],
            'is_trashed' => ['sometimes', 'boolean'],
            'is_spam' => ['sometimes', 'boolean'],
            'label_ids' => ['sometimes', 'array'],
            'label_ids.*' => ['integer', Rule::exists('labels', 'id')->where('mailbox_id', $mailbox->id)],
            'category' => ['sometimes', 'string', Rule::in(['primary', 'promotions', 'social', 'updates', 'forums'])],
        ]);

        $stateFields = array_intersect_key($validated, array_flip(['is_read', 'is_starred', 'is_trashed', 'is_spam']));

        if (! empty($stateFields)) {
            ThreadUserState::updateOrCreate(
                ['thread_id' => $thread->id, 'user_id' => $request->user()->id],
                $stateFields
            );
        }

        // Move INBOX <-> TRASH labels when (un)trashing
        if (array_key_exists('is_trashed', $validated)) {
            $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
            $trashLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'TRASH')->first();
            if ($validated['is_trashed'] === true) {
                if ($inboxLabel) {
                    $thread->labels()->detach($inboxLabel->id);
                }
                if ($trashLabel) {
                    $thread->labels()->syncWithoutDetaching([$trashLabel->id]);
                }
            } else {
                if ($trashLabel) {
                    $thread->labels()->detach($trashLabel->id);
                }
                if ($inboxLabel) {
                    $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
                }
            }
        }

        // Move labels and blacklist sender when marking as spam
        if (isset($validated['is_spam']) && $validated['is_spam'] === true) {
            $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
            $spamLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SPAM')->first();
            if ($inboxLabel) {
                $thread->labels()->detach($inboxLabel->id);
            }
            if ($spamLabel) {
                $thread->labels()->syncWithoutDetaching([$spamLabel->id]);
            }

            $senderEmail = $thread->emails()
                ->where('direction', 'inbound')
                ->latest('sent_at')
                ->value('from_address');

            if ($senderEmail) {
                SenderBlacklist::firstOrCreate([
                    'mailbox_id' => $mailbox->id,
                    'user_id' => $request->user()->id,
                    'from_address' => strtolower($senderEmail),
                ]);

                DomainBlacklist::incrementForSender($mailbox->id, $request->user()->id, $senderEmail);
            }
        }

        if (array_key_exists('label_ids', $validated)) {
            $thread->labels()->sync($validated['label_ids']);
        }

        if (isset($validated['category'])) {
            $thread->update(['category' => $validated['category']]);

            // Learn sender preference (per individual address, not domain)
            $firstInbound = $thread->emails()
                ->where('direction', 'inbound')
                ->oldest('sent_at')
                ->first();

            if ($firstInbound && $firstInbound->from_address) {
                SenderCategoryOverride::updateOrCreate(
                    ['mailbox_id' => $mailbox->id, 'from_address' => strtolower($firstInbound->from_address)],
                    ['category' => $validated['category'], 'created_by' => $request->user()->id]
                );
            }
        }

        $thread->load(['currentUserState', 'labels']);

        return response()->json(new ThreadResource($thread));
    }

    public function destroy(Mailbox $mailbox, Thread $thread): JsonResponse
    {
        if ($thread->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Thread does not belong to this mailbox.'], 404);
        }

        $state = ThreadUserState::where('thread_id', $thread->id)
            ->where('user_id', auth()->id())
            ->first();

        if (! $state || ! $state->is_trashed) {
            return response()->json(['message' => 'Thread must be trashed before permanent deletion.'], 422);
        }

        $thread->emails()->each(function ($email) {
            $email->attachments()->delete();
            $email->delete();
        });
        $thread->threadUserStates()->delete();
        $thread->labels()->detach();
        $thread->delete();

        return response()->json(null, 204);
    }

    public function notSpam(Mailbox $mailbox, Thread $thread, Request $request): JsonResponse
    {
        if ($thread->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Thread does not belong to this mailbox.'], 404);
        }

        $validated = $request->validate([
            'trust_sender' => ['sometimes', 'boolean'],
        ]);

        $userId = $request->user()->id;

        // Mark as not spam
        ThreadUserState::updateOrCreate(
            ['thread_id' => $thread->id, 'user_id' => $userId],
            ['is_spam' => false]
        );

        // Move from SPAM label to INBOX
        $spamLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SPAM')->first();
        $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
        if ($spamLabel) {
            $thread->labels()->detach($spamLabel->id);
        }
        if ($inboxLabel) {
            $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
        }

        // Remove sender from blacklist
        $senderEmail = $thread->emails()
            ->where('direction', 'inbound')
            ->latest('sent_at')
            ->value('from_address');

        if ($senderEmail) {
            SenderBlacklist::where('mailbox_id', $mailbox->id)
                ->where('user_id', $userId)
                ->where('from_address', strtolower($senderEmail))
                ->delete();

            DomainBlacklist::decrementForSender($mailbox->id, $userId, $senderEmail);
        }

        // Whitelist sender if requested
        if (!empty($validated['trust_sender'])) {
            $senderEmail = $thread->emails()
                ->where('direction', 'inbound')
                ->latest('sent_at')
                ->value('from_address');

            if ($senderEmail) {
                SenderWhitelist::firstOrCreate([
                    'mailbox_id' => $mailbox->id,
                    'user_id' => $userId,
                    'from_address' => strtolower($senderEmail),
                ]);
            }
        }

        $thread->load(['currentUserState', 'labels']);

        return response()->json(new ThreadResource($thread));
    }

    public function emptyTrash(Mailbox $mailbox, Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $threadIds = ThreadUserState::where('user_id', $userId)
            ->where('is_trashed', true)
            ->whereIn('thread_id', Thread::where('mailbox_id', $mailbox->id)->pluck('id'))
            ->pluck('thread_id');

        $count = 0;
        foreach ($threadIds as $threadId) {
            $thread = Thread::find($threadId);
            if (! $thread) {
                continue;
            }
            $thread->emails()->each(function ($email) {
                $email->attachments()->delete();
                $email->delete();
            });
            $thread->threadUserStates()->delete();
            $thread->labels()->detach();
            $thread->delete();
            $count++;
        }

        return response()->json(['message' => 'Trash emptied.', 'count' => $count]);
    }

    public function markAllRead(Mailbox $mailbox, Request $request): JsonResponse
    {
        $request->validate([
            'category' => ['sometimes', 'nullable', 'string', Rule::in(['primary', 'promotions', 'social', 'updates', 'forums'])],
            'label' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $userId = $request->user()->id;

        $query = Thread::where('mailbox_id', $mailbox->id);

        if ($request->filled('category')) {
            $query->where('category', $request->query('category'));
        }

        if ($request->filled('label')) {
            $query->whereHas('labels', fn ($q) => $q->where('name', $request->query('label')));
        }

        // Only threads that are currently unread for this user
        $query->where(function ($q) use ($userId) {
            $q->whereDoesntHave('threadUserStates', fn ($s) => $s->where('user_id', $userId))
              ->orWhereHas('threadUserStates', fn ($s) => $s->where('user_id', $userId)->where('is_read', false));
        });

        $threadIds = $query->pluck('id');

        foreach ($threadIds as $threadId) {
            ThreadUserState::updateOrCreate(
                ['thread_id' => $threadId, 'user_id' => $userId],
                ['is_read' => true]
            );
        }

        return response()->json(['message' => 'All marked as read.', 'count' => $threadIds->count()]);
    }

    public function bulk(Mailbox $mailbox, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'thread_ids' => ['required', 'array', 'min:1'],
            'thread_ids.*' => ['integer'],
            'action' => ['required', 'string', Rule::in([
                'read', 'unread', 'star', 'unstar',
                'trash', 'untrash', 'spam', 'not_spam',
                'delete', 'label', 'unlabel', 'category',
            ])],
            'label_id' => ['required_if:action,label,unlabel', 'integer', Rule::exists('labels', 'id')->where('mailbox_id', $mailbox->id)],
            'category' => ['required_if:action,category', 'string', Rule::in(['primary', 'promotions', 'social', 'updates', 'forums'])],
        ]);

        $threads = Thread::where('mailbox_id', $mailbox->id)
            ->whereIn('id', $validated['thread_ids'])
            ->get();

        $userId = $request->user()->id;
        $count = $threads->count();

        foreach ($threads as $thread) {
            match ($validated['action']) {
                'read' => ThreadUserState::updateOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_read' => true]
                ),
                'unread' => ThreadUserState::updateOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_read' => false]
                ),
                'star' => ThreadUserState::updateOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_starred' => true]
                ),
                'unstar' => ThreadUserState::updateOrCreate(
                    ['thread_id' => $thread->id, 'user_id' => $userId],
                    ['is_starred' => false]
                ),
                'trash' => (function () use ($thread, $mailbox, $userId) {
                    ThreadUserState::updateOrCreate(
                        ['thread_id' => $thread->id, 'user_id' => $userId],
                        ['is_trashed' => true]
                    );
                    $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
                    $trashLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'TRASH')->first();
                    if ($inboxLabel) {
                        $thread->labels()->detach($inboxLabel->id);
                    }
                    if ($trashLabel) {
                        $thread->labels()->syncWithoutDetaching([$trashLabel->id]);
                    }
                })(),
                'untrash' => (function () use ($thread, $mailbox, $userId) {
                    ThreadUserState::updateOrCreate(
                        ['thread_id' => $thread->id, 'user_id' => $userId],
                        ['is_trashed' => false]
                    );
                    $trashLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'TRASH')->first();
                    $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
                    if ($trashLabel) {
                        $thread->labels()->detach($trashLabel->id);
                    }
                    if ($inboxLabel) {
                        $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
                    }
                })(),
                'spam' => (function () use ($thread, $mailbox, $userId) {
                    ThreadUserState::updateOrCreate(
                        ['thread_id' => $thread->id, 'user_id' => $userId],
                        ['is_spam' => true]
                    );

                    $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
                    $spamLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SPAM')->first();
                    if ($inboxLabel) {
                        $thread->labels()->detach($inboxLabel->id);
                    }
                    if ($spamLabel) {
                        $thread->labels()->syncWithoutDetaching([$spamLabel->id]);
                    }

                    $senderEmail = $thread->emails()
                        ->where('direction', 'inbound')
                        ->latest('sent_at')
                        ->value('from_address');

                    if ($senderEmail) {
                        SenderBlacklist::firstOrCreate([
                            'mailbox_id' => $mailbox->id,
                            'user_id' => $userId,
                            'from_address' => strtolower($senderEmail),
                        ]);

                        DomainBlacklist::incrementForSender($mailbox->id, $userId, $senderEmail);
                    }
                })(),
                'not_spam' => (function () use ($thread, $mailbox, $userId) {
                    ThreadUserState::updateOrCreate(
                        ['thread_id' => $thread->id, 'user_id' => $userId],
                        ['is_spam' => false]
                    );

                    $spamLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'SPAM')->first();
                    $inboxLabel = Label::where('mailbox_id', $mailbox->id)->where('name', 'INBOX')->first();
                    if ($spamLabel) {
                        $thread->labels()->detach($spamLabel->id);
                    }
                    if ($inboxLabel) {
                        $thread->labels()->syncWithoutDetaching([$inboxLabel->id]);
                    }

                    $senderEmail = $thread->emails()
                        ->where('direction', 'inbound')
                        ->latest('sent_at')
                        ->value('from_address');

                    if ($senderEmail) {
                        SenderBlacklist::where('mailbox_id', $mailbox->id)
                            ->where('user_id', $userId)
                            ->where('from_address', strtolower($senderEmail))
                            ->delete();

                        DomainBlacklist::decrementForSender($mailbox->id, $userId, $senderEmail);
                    }
                })(),
                'delete' => (function () use ($thread, $userId) {
                    $state = ThreadUserState::where('thread_id', $thread->id)
                        ->where('user_id', $userId)
                        ->first();
                    if ($state && $state->is_trashed) {
                        $thread->emails()->each(function ($email) {
                            $email->attachments()->delete();
                            $email->delete();
                        });
                        $thread->threadUserStates()->delete();
                        $thread->labels()->detach();
                        $thread->delete();
                    }
                })(),
                'label' => $thread->labels()->syncWithoutDetaching([$validated['label_id']]),
                'unlabel' => $thread->labels()->detach($validated['label_id']),
                'category' => (function () use ($thread, $mailbox, $validated, $userId) {
                    $thread->update(['category' => $validated['category']]);

                    $firstInbound = $thread->emails()
                        ->where('direction', 'inbound')
                        ->oldest('sent_at')
                        ->first();

                    if ($firstInbound && $firstInbound->from_address) {
                        SenderCategoryOverride::updateOrCreate(
                            ['mailbox_id' => $mailbox->id, 'from_address' => strtolower($firstInbound->from_address)],
                            ['category' => $validated['category'], 'created_by' => $userId]
                        );
                    }
                })(),
            };
        }

        return response()->json(['message' => 'Bulk action applied.', 'count' => $count]);
    }
}

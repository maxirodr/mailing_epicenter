<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\MailboxResource;
use App\Jobs\ProcessInboundEmail;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\UnmatchedEmail;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class AdminMailboxController extends Controller
{
    public function index(): JsonResponse
    {
        $mailboxes = Mailbox::with('users')->paginate(20);

        return response()->json(MailboxResource::collection($mailboxes)->response()->getData(true));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'address' => ['required', 'string', 'max:255'],
            'domain' => ['required', 'string', 'max:255'],
            'display_name' => ['sometimes', 'string', 'max:255'],
        ]);

        $mailbox = Mailbox::create($validated);

        $systemLabels = [
            ['name' => 'INBOX', 'type' => 'system', 'sort_order' => 1],
            ['name' => 'SENT', 'type' => 'system', 'sort_order' => 2],
            ['name' => 'DRAFTS', 'type' => 'system', 'sort_order' => 3],
            ['name' => 'SPAM', 'type' => 'system', 'sort_order' => 4],
            ['name' => 'TRASH', 'type' => 'system', 'sort_order' => 5],
            ['name' => 'SCHEDULED', 'type' => 'system', 'sort_order' => 6],
        ];

        foreach ($systemLabels as $label) {
            $mailbox->labels()->create($label);
        }

        $mailbox->load('labels');

        // Process any unmatched emails that were waiting for this mailbox
        $fullAddress = $mailbox->address . '@' . $mailbox->domain;
        $pendingEmails = UnmatchedEmail::where(function ($q) use ($fullAddress) {
            $q->whereJsonContains('to_addresses', $fullAddress);
        })->get();

        $processedCount = 0;
        foreach ($pendingEmails as $unmatched) {
            try {
                ProcessInboundEmail::dispatch($unmatched->raw_payload);
                $unmatched->delete();
                $processedCount++;
            } catch (\Throwable $e) {
                Log::warning('Failed to reprocess unmatched email', [
                    'unmatched_id' => $unmatched->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        if ($processedCount > 0) {
            Log::info("Processed {$processedCount} unmatched emails for new mailbox {$fullAddress}");
        }

        return response()->json(new MailboxResource($mailbox), 201);
    }

    public function show(Mailbox $mailbox): JsonResponse
    {
        $mailbox->load(['users', 'labels']);

        return response()->json(new MailboxResource($mailbox));
    }

    public function update(Request $request, Mailbox $mailbox): JsonResponse
    {
        $validated = $request->validate([
            'address' => ['sometimes', 'string', 'max:255'],
            'domain' => ['sometimes', 'string', 'max:255'],
            'display_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'signature' => ['sometimes', 'nullable', 'string'],
        ]);

        $mailbox->update($validated);

        return response()->json(new MailboxResource($mailbox));
    }

    public function destroy(Mailbox $mailbox): JsonResponse
    {
        $mailbox->delete();

        return response()->json(null, 204);
    }

    public function assignUser(Request $request, Mailbox $mailbox, User $user): JsonResponse
    {
        $validated = $request->validate([
            'role' => ['sometimes', 'string', Rule::in(['owner', 'member'])],
        ]);

        $role = $validated['role'] ?? 'member';

        $mailbox->users()->syncWithoutDetaching([
            $user->id => ['role' => $role],
        ]);

        $mailbox->load('users');

        return response()->json(new MailboxResource($mailbox));
    }

    public function removeUser(Mailbox $mailbox, User $user): JsonResponse
    {
        $mailbox->users()->detach($user->id);

        return response()->json(null, 204);
    }
}

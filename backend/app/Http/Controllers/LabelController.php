<?php

namespace App\Http\Controllers;

use App\Http\Resources\LabelResource;
use App\Models\Label;
use App\Models\Mailbox;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LabelController extends Controller
{
    public function index(Mailbox $mailbox): JsonResponse
    {
        $labels = Label::where('mailbox_id', $mailbox->id)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(LabelResource::collection($labels));
    }

    public function store(Mailbox $mailbox, Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'color' => ['sometimes', 'nullable', 'string', 'max:7'],
        ]);

        $label = Label::create([
            'mailbox_id' => $mailbox->id,
            'name' => $validated['name'],
            'color' => $validated['color'] ?? null,
            'type' => 'custom',
            'sort_order' => Label::where('mailbox_id', $mailbox->id)->max('sort_order') + 1,
        ]);

        return response()->json(new LabelResource($label), 201);
    }

    public function show(Mailbox $mailbox, Label $label): JsonResponse
    {
        if ($label->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Label does not belong to this mailbox.'], 404);
        }

        return response()->json(new LabelResource($label));
    }

    public function update(Mailbox $mailbox, Label $label, Request $request): JsonResponse
    {
        if ($label->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Label does not belong to this mailbox.'], 404);
        }

        if ($label->type === 'system') {
            return response()->json(['message' => 'System labels cannot be modified.'], 422);
        }

        $validated = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'color' => ['sometimes', 'nullable', 'string', 'max:7'],
        ]);

        $label->update($validated);

        return response()->json(new LabelResource($label));
    }

    public function destroy(Mailbox $mailbox, Label $label): JsonResponse
    {
        if ($label->mailbox_id !== $mailbox->id) {
            return response()->json(['message' => 'Label does not belong to this mailbox.'], 404);
        }

        if ($label->type === 'system') {
            return response()->json(['message' => 'System labels cannot be deleted.'], 422);
        }

        $label->threads()->detach();
        $label->delete();

        return response()->json(null, 204);
    }
}

<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\UnmatchedEmail;
use Illuminate\Http\JsonResponse;

class AdminUnmatchedController extends Controller
{
    public function index(): JsonResponse
    {
        $emails = UnmatchedEmail::latest()->paginate(20);

        return response()->json($emails);
    }

    public function destroy(UnmatchedEmail $unmatchedEmail): JsonResponse
    {
        $unmatchedEmail->delete();

        return response()->json(null, 204);
    }
}

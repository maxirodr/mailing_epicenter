<?php

use App\Http\Controllers\Admin\AdminMailboxController;
use App\Http\Controllers\Admin\AdminUnmatchedController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\AttachmentController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\Auth\SessionController;
use App\Http\Controllers\Auth\TwoFactorController;
use App\Http\Controllers\Auth\PasskeyController;
use App\Http\Controllers\Auth\InviteController;
use App\Http\Middleware\EnsureSetupComplete;
use App\Http\Controllers\EmailController;
use App\Http\Controllers\LabelController;
use App\Http\Controllers\MailboxController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\ThreadController;
use App\Http\Controllers\Webhook\ResendWebhookController;
use App\Http\Middleware\EnsureIsAdmin;
use App\Http\Middleware\EnsureMailboxAccess;
use App\Services\OneSignalService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Public auth routes
Route::post('/auth/login', [AuthController::class, 'login'])
    ->middleware('throttle:5,1');

Route::post('/auth/2fa/totp', [TwoFactorController::class, 'verifyTotp'])
    ->middleware('throttle:5,1');

// Passkey auth (public)
Route::post('/auth/passkey/login/options', [PasskeyController::class, 'loginOptions'])
    ->middleware('throttle:10,1');
Route::post('/auth/passkey/login/verify', [PasskeyController::class, 'loginVerify'])
    ->middleware('throttle:5,1');

// Invite (public)
Route::get('/invite/{token}', [InviteController::class, 'show']);
Route::post('/invite/{token}', [InviteController::class, 'complete']);

// Webhooks (public, no auth)
Route::post('/webhooks/resend', [ResendWebhookController::class, 'handle'])
    ->middleware('throttle:30,1');

// Authenticated routes
Route::middleware(['auth:sanctum', 'throttle:600,1'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::put('/auth/password', [AuthController::class, 'updatePassword']);
    Route::put('/auth/profile', [AuthController::class, 'updateProfile']);
    Route::post('/auth/avatar', [AuthController::class, 'uploadAvatar']);
    Route::put('/auth/notifications', [AuthController::class, 'updateNotificationSettings']);
    Route::get('/auth/preferences', [AuthController::class, 'getPreferences']);
    Route::put('/auth/preferences', [AuthController::class, 'updatePreferences']);
    Route::post('/auth/delete-account', [AuthController::class, 'deleteAccount']);
    Route::get('/auth/export', [AuthController::class, 'exportData']);
    // Setup
    Route::post('/auth/setup-complete', [AuthController::class, 'setupComplete']);

    // Passkeys (authenticated)
    Route::post('/auth/passkey/register/options', [PasskeyController::class, 'registerOptions']);
    Route::post('/auth/passkey/register/verify', [PasskeyController::class, 'registerVerify']);
    Route::get('/auth/passkeys', [PasskeyController::class, 'index']);
    Route::delete('/auth/passkeys/{id}', [PasskeyController::class, 'destroy']);

    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Sessions
    Route::get('/auth/sessions', [SessionController::class, 'index']);
    Route::patch('/auth/sessions/{id}', [SessionController::class, 'update']);
    Route::delete('/auth/sessions/{id}', [SessionController::class, 'destroy']);
    Route::delete('/auth/sessions', [SessionController::class, 'destroyOthers']);

    // Login history
    Route::get('/auth/login-history', [AuthController::class, 'loginHistory']);

    // 2FA Setup
    Route::post('/auth/2fa/totp/setup', [TwoFactorController::class, 'setup']);
    Route::post('/auth/2fa/totp/confirm', [TwoFactorController::class, 'confirmSetup']);

    // 2FA Recovery & Disable
    Route::get('/auth/2fa/recovery-codes', [TwoFactorController::class, 'getRecoveryCodes']);
    Route::post('/auth/2fa/recovery-codes/regenerate', [TwoFactorController::class, 'regenerateRecoveryCodes']);
    Route::delete('/auth/2fa', [TwoFactorController::class, 'disable']);

    // Protected routes (require setup complete)
    Route::middleware(EnsureSetupComplete::class)->group(function () {

    // Mailboxes
    Route::get('/mailboxes', [MailboxController::class, 'index']);

    // Mailbox-scoped routes (with access check)
    Route::middleware(EnsureMailboxAccess::class)->prefix('mailboxes/{mailbox}')->group(function () {
        // Counts
        Route::get('/counts', [MailboxController::class, 'counts']);
        Route::get('/category-counts', [MailboxController::class, 'categoryCounts']);

        // Signature
        Route::patch('/signature', [MailboxController::class, 'updateSignature']);

        // Profile
        Route::post('/profile', [MailboxController::class, 'updateProfile']);

        // Auto-reply
        Route::get('/auto-reply', [MailboxController::class, 'getAutoReply']);
        Route::put('/auto-reply', [MailboxController::class, 'updateAutoReply']);

        // Threads
        Route::get('/threads', [ThreadController::class, 'index']);
        Route::get('/threads/{thread}', [ThreadController::class, 'show']);
        Route::patch('/threads/{thread}', [ThreadController::class, 'update']);
        Route::delete('/threads/{thread}', [ThreadController::class, 'destroy']);
        Route::post('/threads/bulk', [ThreadController::class, 'bulk']);
        Route::post('/threads/empty-trash', [ThreadController::class, 'emptyTrash']);
        Route::post('/threads/{thread}/not-spam', [ThreadController::class, 'notSpam']);
        Route::post('/threads/mark-all-read', [ThreadController::class, 'markAllRead']);

        // Emails
        Route::post('/emails', [EmailController::class, 'store'])->middleware('throttle:30,1');
        Route::post('/emails/{email}/reply', [EmailController::class, 'reply'])->middleware('throttle:30,1');
        Route::post('/emails/{email}/forward', [EmailController::class, 'forward'])->middleware('throttle:30,1');
        Route::put('/drafts/{draft}', [EmailController::class, 'updateDraft']);
        Route::post('/drafts/{draft}/send', [EmailController::class, 'sendDraft'])->middleware('throttle:30,1');
        Route::delete('/drafts/{draft}', [EmailController::class, 'destroyDraft']);
        Route::post('/emails/{email}/cancel', [EmailController::class, 'cancelSend']);
        Route::post('/emails/{email}/send-now', [EmailController::class, 'sendScheduledNow']);

        // Contacts
        Route::get('/contacts/suggest', [MailboxController::class, 'suggestContacts']);

        // Labels
        Route::apiResource('labels', LabelController::class);

        // Search
        Route::get('/search', [SearchController::class, 'search']);
    });

    // Attachments (not mailbox-scoped)
    Route::post('/attachments/upload', [AttachmentController::class, 'upload'])
        ->middleware('throttle:20,1');
    Route::get('/attachments/{attachment}/download', [AttachmentController::class, 'download'])
        ->name('attachments.download');
    Route::get('/attachments/{attachment}/stream', [AttachmentController::class, 'stream'])
        ->name('attachments.stream');
    // Admin routes
    Route::middleware(EnsureIsAdmin::class)->prefix('admin')->group(function () {
        Route::get('/stats', function () {
            $unmatchedByAddress = \App\Models\UnmatchedEmail::selectRaw("JSON_UNQUOTE(JSON_EXTRACT(to_addresses, '$[0]')) as address, COUNT(*) as count")
                ->groupBy('address')
                ->orderByDesc('count')
                ->limit(10)
                ->pluck('count', 'address');

            return response()->json([
                'users' => \App\Models\User::count(),
                'mailboxes' => \App\Models\Mailbox::count(),
                'emails' => \App\Models\Email::count(),
                'threads' => \App\Models\Thread::count(),
                'unmatched' => \App\Models\UnmatchedEmail::count(),
                'unmatched_by_address' => $unmatchedByAddress,
            ]);
        });

        Route::apiResource('users', AdminUserController::class);
        Route::apiResource('mailboxes', AdminMailboxController::class);
        Route::post('/mailboxes/{mailbox}/users/{user}', [AdminMailboxController::class, 'assignUser']);
        Route::delete('/mailboxes/{mailbox}/users/{user}', [AdminMailboxController::class, 'removeUser']);
        Route::post('/users/{user}/resend-invite', [AdminUserController::class, 'resendInvite']);

        Route::get('/unmatched-emails', [AdminUnmatchedController::class, 'index']);
        Route::delete('/unmatched-emails/{unmatchedEmail}', [AdminUnmatchedController::class, 'destroy']);

        Route::post('/test-notification', function (Request $request) {
            $service = app(OneSignalService::class);

            if (!$service->isConfigured()) {
                return response()->json(['message' => 'OneSignal not configured.'], 422);
            }

            $sent = $service->sendToExternalUser(
                $request->user()->id,
                'Test Notification',
                'If you see this, push notifications are working!',
                ['type' => 'test']
            );

            return response()->json([
                'message' => $sent ? 'Test notification sent.' : 'Failed to send notification.',
                'success' => $sent,
            ]);
        });
    });

    }); // end EnsureSetupComplete
});

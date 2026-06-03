<?php

namespace Tests\Feature;

use App\Models\Email;
use App\Models\Label;
use App\Models\Mailbox;
use App\Models\Thread;
use App\Models\ThreadUserState;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ThreadBulkActionsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Mailbox $mailbox;
    private array $systemLabels;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutMiddleware(\App\Http\Middleware\TrackSession::class);

        $this->user = User::create([
            'name' => 'Test User',
            'email' => 'tester@example.com',
            'password' => bcrypt('secret'),
            'setup_completed_at' => now(),
        ]);

        $this->mailbox = Mailbox::create([
            'address' => 'inbox',
            'domain' => 'example.com',
            'display_name' => 'Inbox',
        ]);

        $this->user->mailboxes()->attach($this->mailbox->id);

        foreach (['INBOX', 'SENT', 'DRAFTS', 'SCHEDULED', 'SPAM', 'TRASH'] as $i => $name) {
            $this->systemLabels[$name] = Label::create([
                'mailbox_id' => $this->mailbox->id,
                'name' => $name,
                'type' => 'system',
                'sort_order' => $i,
            ]);
        }
    }

    private function makeThreadInInbox(): Thread
    {
        $thread = Thread::create([
            'mailbox_id' => $this->mailbox->id,
            'subject' => 'Test thread',
            'snippet' => 'snippet',
            'last_message_at' => now(),
            'message_count' => 1,
            'category' => 'primary',
        ]);
        $thread->labels()->attach($this->systemLabels['INBOX']->id);

        Email::create([
            'mailbox_id' => $this->mailbox->id,
            'thread_id' => $thread->id,
            'message_id' => 'msg-' . $thread->id . '@example.com',
            'direction' => 'inbound',
            'from_address' => 'sender@external.com',
            'from_name' => 'External Sender',
            'to_addresses' => ['inbox@example.com'],
            'subject' => 'Test thread',
            'text_body' => 'body',
            'sent_at' => now(),
        ]);

        return $thread;
    }

    private function postBulk(array $threadIds, string $action, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/mailboxes/{$this->mailbox->id}/threads/bulk", array_merge([
                'thread_ids' => $threadIds,
                'action' => $action,
            ], $extra));
    }

    public function test_bulk_trash_attaches_trash_label_and_detaches_inbox(): void
    {
        $a = $this->makeThreadInInbox();
        $b = $this->makeThreadInInbox();

        $resp = $this->postBulk([$a->id, $b->id], 'trash');
        $resp->assertOk();

        foreach ([$a, $b] as $t) {
            $labels = $t->fresh()->labels()->pluck('name')->all();
            $this->assertContains('TRASH', $labels, "Thread {$t->id} should have TRASH label");
            $this->assertNotContains('INBOX', $labels, "Thread {$t->id} should NOT have INBOX label");
            $state = ThreadUserState::where(['thread_id' => $t->id, 'user_id' => $this->user->id])->first();
            $this->assertTrue((bool) $state->is_trashed);
        }
    }

    public function test_bulk_untrash_restores_inbox_label(): void
    {
        $thread = $this->makeThreadInInbox();
        $this->postBulk([$thread->id], 'trash')->assertOk();

        $resp = $this->postBulk([$thread->id], 'untrash');
        $resp->assertOk();

        $labels = $thread->fresh()->labels()->pluck('name')->all();
        $this->assertContains('INBOX', $labels);
        $this->assertNotContains('TRASH', $labels);
        $state = ThreadUserState::where(['thread_id' => $thread->id, 'user_id' => $this->user->id])->first();
        $this->assertFalse((bool) $state->is_trashed);
    }

    public function test_bulk_read_unread_toggles_state(): void
    {
        $thread = $this->makeThreadInInbox();

        $this->postBulk([$thread->id], 'read')->assertOk();
        $this->assertTrue((bool) ThreadUserState::where(['thread_id' => $thread->id, 'user_id' => $this->user->id])->first()->is_read);

        $this->postBulk([$thread->id], 'unread')->assertOk();
        $this->assertFalse((bool) ThreadUserState::where(['thread_id' => $thread->id, 'user_id' => $this->user->id])->first()->is_read);
    }

    public function test_bulk_spam_attaches_spam_label_and_detaches_inbox(): void
    {
        $thread = $this->makeThreadInInbox();

        $resp = $this->postBulk([$thread->id], 'spam');
        $resp->assertOk();

        $labels = $thread->fresh()->labels()->pluck('name')->all();
        $this->assertContains('SPAM', $labels);
        $this->assertNotContains('INBOX', $labels);
        $state = ThreadUserState::where(['thread_id' => $thread->id, 'user_id' => $this->user->id])->first();
        $this->assertTrue((bool) $state->is_spam);
    }

    public function test_bulk_category_updates_thread_category(): void
    {
        $thread = $this->makeThreadInInbox();
        $this->assertSame('primary', $thread->category);

        $resp = $this->postBulk([$thread->id], 'category', ['category' => 'promotions']);
        $resp->assertOk();

        $this->assertSame('promotions', $thread->fresh()->category);
    }

    public function test_bulk_delete_only_works_after_trash(): void
    {
        $thread = $this->makeThreadInInbox();

        $this->postBulk([$thread->id], 'delete')->assertOk();
        $this->assertNotNull(Thread::find($thread->id), 'Delete should be a no-op when thread is not trashed');

        $this->postBulk([$thread->id], 'trash')->assertOk();
        $this->postBulk([$thread->id], 'delete')->assertOk();
        $this->assertNull(Thread::find($thread->id), 'Delete should remove a trashed thread');
    }

    public function test_empty_trash_deletes_only_trashed_threads_for_user(): void
    {
        $kept = $this->makeThreadInInbox();
        $trashed1 = $this->makeThreadInInbox();
        $trashed2 = $this->makeThreadInInbox();

        $this->postBulk([$trashed1->id, $trashed2->id], 'trash')->assertOk();

        $resp = $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/mailboxes/{$this->mailbox->id}/threads/empty-trash");
        $resp->assertOk();
        $this->assertSame(2, $resp->json('count'));

        $this->assertNotNull(Thread::find($kept->id), 'Non-trashed thread should survive');
        $this->assertNull(Thread::find($trashed1->id));
        $this->assertNull(Thread::find($trashed2->id));
    }

    public function test_single_update_is_trashed_attaches_trash_label(): void
    {
        $thread = $this->makeThreadInInbox();

        $resp = $this->actingAs($this->user, 'sanctum')
            ->patchJson("/api/mailboxes/{$this->mailbox->id}/threads/{$thread->id}", [
                'is_trashed' => true,
            ]);
        $resp->assertOk();

        $labels = $thread->fresh()->labels()->pluck('name')->all();
        $this->assertContains('TRASH', $labels);
        $this->assertNotContains('INBOX', $labels);
    }

    public function test_single_update_is_trashed_false_restores_inbox(): void
    {
        $thread = $this->makeThreadInInbox();
        $this->postBulk([$thread->id], 'trash')->assertOk();

        $this->actingAs($this->user, 'sanctum')
            ->patchJson("/api/mailboxes/{$this->mailbox->id}/threads/{$thread->id}", [
                'is_trashed' => false,
            ])
            ->assertOk();

        $labels = $thread->fresh()->labels()->pluck('name')->all();
        $this->assertContains('INBOX', $labels);
        $this->assertNotContains('TRASH', $labels);
    }
}

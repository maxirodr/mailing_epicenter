<?php

namespace App\Console\Commands;

use App\Models\Mailbox;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;

class CreateAdminCommand extends Command
{
    protected $signature = 'mail:create-admin';

    protected $description = 'Create an admin user with a personal mailbox';

    public function handle(): int
    {
        $name = $this->ask('Name');

        $email = $this->ask('Email');
        $emailValidator = Validator::make(['email' => $email], [
            'email' => ['required', 'email', 'unique:users,email'],
        ]);

        if ($emailValidator->fails()) {
            $this->error($emailValidator->errors()->first('email'));
            return Command::FAILURE;
        }

        $password = $this->secret('Password');
        if (strlen($password) < 8) {
            $this->error('Password must be at least 8 characters.');
            return Command::FAILURE;
        }

        $confirmPassword = $this->secret('Confirm password');
        if ($password !== $confirmPassword) {
            $this->error('Passwords do not match.');
            return Command::FAILURE;
        }

        // Create admin user
        $user = User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
            'is_admin' => true,
        ]);

        // Auto-create a mailbox matching the user's email
        $parts = explode('@', $email, 2);
        if (count($parts) === 2) {
            $mailbox = Mailbox::create([
                'address' => $parts[0],
                'domain' => $parts[1],
                'display_name' => $name,
            ]);

            // Create system labels
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

            // Assign user as owner
            $mailbox->users()->attach($user->id, ['role' => 'owner']);

            $this->info("Mailbox created: {$mailbox->address}@{$mailbox->domain}");
        }

        $this->info("Admin user created: {$user->email}");

        return Command::SUCCESS;
    }
}

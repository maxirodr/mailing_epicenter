<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'display_name',
        'email',
        'password',
        'is_admin',
        'google2fa_secret',
        'two_factor_confirmed_at',
        'two_factor_recovery_codes',
        'setup_completed_at',
        'onesignal_player_id',
        'avatar_url',
        'timezone',
        'language',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'google2fa_secret',
        'two_factor_recovery_codes',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'two_factor_confirmed_at' => 'datetime',
            'setup_completed_at' => 'datetime',
        ];
    }

    public function mailboxes(): BelongsToMany
    {
        return $this->belongsToMany(Mailbox::class, 'mailbox_user')
            ->withPivot('role')
            ->withTimestamps();
    }

    public function threadUserStates(): HasMany
    {
        return $this->hasMany(ThreadUserState::class);
    }

    public function preferences(): HasOne
    {
        return $this->hasOne(UserPreference::class);
    }

    public function passkeys(): HasMany
    {
        return $this->hasMany(Passkey::class);
    }

    public function hasPasskeys(): bool
    {
        return $this->passkeys()->exists();
    }
}

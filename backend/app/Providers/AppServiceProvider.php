<?php

namespace App\Providers;

use App\Models\Email;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Route::model('draft', Email::class);

        // Resend API rate limit: 2 requests per second
        RateLimiter::for('resend-api', function (object $job) {
            return Limit::perSecond(2);
        });
    }
}

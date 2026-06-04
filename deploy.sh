#!/bin/bash
set -e

echo "Deploying Epicenter Mail..."

APP_DIR=/var/www/mailing.epicentersport.com

cd "$APP_DIR"
git pull origin main

# Backend
cd "$APP_DIR/backend"
composer install --no-dev --optimize-autoloader
php artisan config:clear
php artisan cache:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force

# Frontend
cd "$APP_DIR/frontend"
npm ci
npm run build

# Sync supervisor config and restart ONLY this app's services
# (never "restart all" — this host runs other apps under supervisor)
sudo cp "$APP_DIR/supervisord.conf" /etc/supervisor/conf.d/mailing_epicenter.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl restart epimail-serve epimail-reverb epimail-scheduler 'epimail-queue:*'

# Verify queue workers are processing (Epicenter uses Redis DB 2)
sleep 5
QUEUE_SIZE=$(cd "$APP_DIR/backend" && php artisan tinker --execute="echo \Illuminate\Support\Facades\Redis::connection()->llen('queues:default');" 2>/dev/null)
echo "Queue size after deploy: $QUEUE_SIZE"

echo "Deployment complete!"

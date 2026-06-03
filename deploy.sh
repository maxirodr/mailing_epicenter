#!/bin/bash
set -e

echo "Deploying NexoSmart Mail..."

cd /var/www/nexosmart-mail
git pull origin main

# Backend
cd /var/www/nexosmart-mail/backend
composer install --no-dev --optimize-autoloader
php artisan config:clear
php artisan cache:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan migrate --force

# Frontend
cd /var/www/nexosmart-mail/frontend
npm ci
npm run build

# Sync supervisor config and restart services
sudo cp /var/www/nexosmart-mail/supervisord.conf /etc/supervisor/conf.d/nexosmart-mail.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl restart all

# Verify queue workers are processing
sleep 5
QUEUE_SIZE=$(cd /var/www/nexosmart-mail/backend && php artisan tinker --execute="echo \Illuminate\Support\Facades\Redis::llen('queues:default');" 2>/dev/null)
echo "Queue size after deploy: $QUEUE_SIZE"

echo "Deployment complete!"

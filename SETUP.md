# Epicenter Mail - Setup Guide

> Production host note: this app runs **alongside** other apps on the server.
> It uses dedicated ports **8002** (HTTP/serve) and **8090** (Reverb/WebSocket),
> supervisor programs prefixed **`epimail-`**, and Redis DBs **2** (default) and
> **3** (cache) so it never collides with the other deployments. TLS is
> terminated upstream (Cloudflare); origin Nginx serves plain HTTP on port 80.

## 1. Prerequisites

| Tool    | Version  |
|---------|----------|
| PHP     | 8.3+     |
| MySQL   | 8.0+     |
| Redis   | 7.0+     |
| Node.js | 20+      |
| Composer| 2.x      |
| Nginx   | latest   |
| Supervisor | latest |

Required PHP extensions: `mbstring`, `xml`, `curl`, `mysql`, `redis`, `zip`, `bcmath`, `gd`.

## 2. Local Development Setup

```bash
# Clone the repo
git clone git@github.com:nexosmart-green/mailing_epicenter.git
cd mailing_epicenter

# Backend
cd backend
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate --seed
php artisan serve

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` and the backend API at `http://localhost:8000`.

## 3. Resend Configuration

1. Create an account at [resend.com](https://resend.com).
2. Add and verify your sending domain (`epicentersport.com`).
3. Copy your API key into `RESEND_API_KEY` in `.env`.
4. Set up a webhook endpoint pointing to `https://mailing.epicentersport.com/api/webhooks/resend`.
5. Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

### MX Records (for receiving via Resend)

| Type | Host                      | Value                      | Priority |
|------|---------------------------|----------------------------|----------|
| MX   | epicentersport.com        | feedback-smtp.resend.com   | 10       |
| TXT  | epicentersport.com        | (SPF record from Resend)   | -        |
| TXT  | resend._domainkey...      | (DKIM record from Resend)  | -        |

## 4. R2 Storage Setup

1. Create an R2 bucket named `epicenter-mail` in your Cloudflare dashboard.
2. Generate R2 API tokens with read/write permissions.
3. Fill in the R2 variables in `.env`:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` (replace `ACCOUNT_ID` with your Cloudflare account ID)
4. Optionally set up a custom domain for public access to stored assets and set `R2_URL`.

## 5. Production Deployment

### Initial server setup

```bash
# Install dependencies (if not already present)
sudo apt update && sudo apt install -y nginx supervisor redis-server mysql-server php8.3-fpm php8.3-cli \
  php8.3-mbstring php8.3-xml php8.3-curl php8.3-mysql php8.3-redis php8.3-zip php8.3-bcmath php8.3-gd

# Project lives here
cd /var/www/mailing.epicentersport.com

# Backend setup
cd backend
# (.env is created from the template in this guide / repo task)
composer install --no-dev --optimize-autoloader
php artisan key:generate
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache

# Frontend build
cd ../frontend
npm ci
npm run build
```

### Database

```sql
CREATE DATABASE epicenter_mail CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'epicenter_mail'@'127.0.0.1' IDENTIFIED BY '<DB_PASSWORD>';
GRANT ALL PRIVILEGES ON epicenter_mail.* TO 'epicenter_mail'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### Configure Nginx

```bash
sudo cp /var/www/mailing.epicentersport.com/nginx.conf /etc/nginx/sites-available/mailing_epicenter
sudo ln -s /etc/nginx/sites-available/mailing_epicenter /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

> TLS: this origin serves plain HTTP on port 80 and TLS is terminated upstream
> (Cloudflare). If you instead need a local certificate, install certbot
> (`sudo apt install certbot python3-certbot-nginx`) and add an SSL server block.

### Configure Supervisor

```bash
sudo cp /var/www/mailing.epicentersport.com/supervisord.conf /etc/supervisor/conf.d/mailing_epicenter.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start epimail-serve epimail-reverb epimail-scheduler 'epimail-queue:*'
```

> Never run `supervisorctl restart all` on this host — other apps run under the
> same supervisor. Always target the `epimail-*` programs explicitly.

### Subsequent deployments

```bash
cd /var/www/mailing.epicentersport.com
bash deploy.sh
```

## 6. Creating the First Admin User

```bash
cd /var/www/mailing.epicentersport.com/backend
php artisan tinker
```

```php
use App\Models\User;

User::create([
    'name' => 'Admin',
    'email' => 'admin@epicentersport.com',
    'password' => bcrypt('CHANGE_ME'),
    'role' => 'admin',
]);
```

Or if a seeder is available:

```bash
php artisan db:seed --class=AdminSeeder
```

## 7. DNS Records

| Type  | Host                                | Value                          | TTL  |
|-------|-------------------------------------|--------------------------------|------|
| A     | mailing.epicentersport.com          | YOUR_SERVER_IP                 | 3600 |
| MX    | epicentersport.com                  | feedback-smtp.resend.com       | 10   |
| TXT   | epicentersport.com                  | v=spf1 include:resend.com ~all | 3600 |
| TXT   | resend._domainkey.epicentersport.com | (DKIM value from Resend)      | 3600 |

## 8. Troubleshooting

**Queue jobs not processing**
```bash
sudo supervisorctl status                                      # Check worker status
tail -f /var/www/mailing.epicentersport.com/backend/storage/logs/queue-worker.log
php artisan queue:retry all                                    # Retry failed jobs
```

**WebSocket connection failing**
- Verify Reverb is running: `sudo supervisorctl status epimail-reverb`
- Check that port 8090 is listening locally (`ss -ltnp | grep 8090`)
- Confirm `REVERB_*` variables match between backend `.env` and frontend config

**502 Bad Gateway from Nginx**
- Ensure `php artisan serve` is running on port 8002 (`sudo supervisorctl status epimail-serve`)
- Check supervisor logs: `tail -f /var/www/mailing.epicentersport.com/backend/storage/logs/serve.log`
- Verify Nginx config: `sudo nginx -t`

**Redis connection refused**
```bash
sudo systemctl status redis-server
redis-cli ping                                 # Should return PONG
```

**Emails not sending**
- Verify `RESEND_API_KEY` is set and valid
- Check the queue is processing: `php artisan queue:work --once`
- Review Laravel log: `tail -f storage/logs/laravel.log`

**File uploads failing (R2)**
- Confirm R2 credentials in `.env`
- Test connectivity: `php artisan tinker` then `Storage::disk('r2')->put('test.txt', 'ok')`
- Check the bucket exists and the API token has write permissions

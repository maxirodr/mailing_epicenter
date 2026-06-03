# NexoSmart Mail - Setup Guide

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
git clone git@github.com:your-org/nexosmart-mail.git
cd nexosmart-mail

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
2. Add and verify your sending domain (`nexosmart.com`).
3. Copy your API key into `RESEND_API_KEY` in `.env`.
4. Set up a webhook endpoint pointing to `https://mail.nexosmart.com/api/webhooks/resend`.
5. Copy the webhook signing secret into `RESEND_WEBHOOK_SECRET`.

### MX Records (for receiving via Resend)

| Type | Host                  | Value                      | Priority |
|------|-----------------------|----------------------------|----------|
| MX   | mail.nexosmart.com    | feedback-smtp.resend.com   | 10       |
| TXT  | mail.nexosmart.com    | (SPF record from Resend)   | -        |
| TXT  | resend._domainkey...  | (DKIM record from Resend)  | -        |

## 4. R2 Storage Setup

1. Create an R2 bucket named `nexosmart-mail` in your Cloudflare dashboard.
2. Generate R2 API tokens with read/write permissions.
3. Fill in the R2 variables in `.env`:
   - `R2_ACCESS_KEY_ID`
   - `R2_SECRET_ACCESS_KEY`
   - `R2_ENDPOINT` (replace `ACCOUNT_ID` with your Cloudflare account ID)
4. Optionally set up a custom domain (`r2.mail.nexosmart.com`) for public access to stored assets.

## 5. Production Deployment

### Initial server setup

```bash
# Install dependencies
sudo apt update && sudo apt install -y nginx supervisor redis-server mysql-server php8.3-fpm php8.3-cli \
  php8.3-mbstring php8.3-xml php8.3-curl php8.3-mysql php8.3-redis php8.3-zip php8.3-bcmath php8.3-gd

# Clone project
sudo mkdir -p /var/www/nexosmart-mail
sudo chown www-data:www-data /var/www/nexosmart-mail
cd /var/www/nexosmart-mail
git clone git@github.com:your-org/nexosmart-mail.git .

# Backend setup
cd backend
cp .env.production .env
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

### Configure Nginx

```bash
sudo cp /var/www/nexosmart-mail/nginx.conf /etc/nginx/sites-available/nexosmart-mail
sudo ln -s /etc/nginx/sites-available/nexosmart-mail /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Configure Supervisor

```bash
sudo cp /var/www/nexosmart-mail/supervisord.conf /etc/supervisor/conf.d/nexosmart-mail.conf
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start all
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mail.nexosmart.com
```

### Subsequent deployments

```bash
cd /var/www/nexosmart-mail
bash deploy.sh
```

## 6. Creating the First Admin User

```bash
cd /var/www/nexosmart-mail/backend
php artisan tinker
```

```php
use App\Models\User;

User::create([
    'name' => 'Admin',
    'email' => 'admin@nexosmart.com',
    'password' => bcrypt('CHANGE_ME'),
    'role' => 'admin',
]);
```

Or if a seeder is available:

```bash
php artisan db:seed --class=AdminSeeder
```

## 7. DNS Records

| Type  | Host                     | Value                          | TTL  |
|-------|--------------------------|--------------------------------|------|
| A     | mail.nexosmart.com       | YOUR_SERVER_IP                 | 3600 |
| CNAME | r2.mail.nexosmart.com    | YOUR_R2_PUBLIC_DOMAIN          | 3600 |
| MX    | nexosmart.com            | feedback-smtp.resend.com       | 10   |
| TXT   | nexosmart.com            | v=spf1 include:resend.com ~all | 3600 |
| TXT   | resend._domainkey.nexosmart.com | (DKIM value from Resend) | 3600 |

## 8. Troubleshooting

**Queue jobs not processing**
```bash
sudo supervisorctl status                     # Check worker status
tail -f /var/log/laravel-queue.err.log         # Check error logs
php artisan queue:retry all                    # Retry failed jobs
```

**WebSocket connection failing**
- Verify Reverb is running: `sudo supervisorctl status laravel-reverb`
- Check that port 8080 is not blocked by the firewall
- Confirm `REVERB_*` variables match between backend `.env` and frontend config

**502 Bad Gateway from Nginx**
- Ensure `php artisan serve` is running on port 8000
- Check supervisor logs: `tail -f /var/log/laravel-serve.err.log`
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

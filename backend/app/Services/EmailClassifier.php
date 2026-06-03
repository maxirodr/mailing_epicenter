<?php

namespace App\Services;

use App\Models\SenderCategoryOverride;

class EmailClassifier
{
    private const SOCIAL_DOMAINS = [
        // Major social platforms
        'facebook.com', 'facebookmail.com',
        'twitter.com', 'x.com',
        'linkedin.com',
        'instagram.com',
        'github.com',
        'discord.com', 'discordapp.com',
        'slack.com',
        'reddit.com', 'redditmail.com',
        'youtube.com',
        'tiktok.com',
        'pinterest.com',
        'whatsapp.com',
        'telegram.org',
        'medium.com',
        'tumblr.com',
        'snapchat.com',
        'twitch.tv',
        'mastodon.social',
        // Collaboration/project tools (notification-heavy)
        'trello.com',
        'atlassian.com',
        'asana.com',
        'notion.so',
        'figma.com',
        'miro.com',
        'clickup.com',
        'monday.com',
        // Social/community platforms
        'meetup.com',
        'eventbrite.com',
        'loom.com',
        'fathom.video',
        // Dev communities
        'gitlab.com',
        'bitbucket.org',
        'stackoverflow.com',
    ];

    private const MARKETING_DOMAINS = [
        'mailchimp.com', 'mail.mailchimp.com',
        'sendgrid.net', 'sendgrid.com',
        'constantcontact.com',
        'hubspot.com', 'hubspotemail.net',
        'mailgun.com', 'mailgun.org',
        'campaign-archive.com',
        'createsend.com',
        'klaviyo.com',
        'brevo.com', 'sendinblue.com',
        'mailerlite.com',
        'aweber.com',
        'getresponse.com',
        'convertkit.com',
        'drip.com',
        'activecampaign.com',
        'beehiiv.com',
        'substack.com',
    ];

    /**
     * Patterns in the from_address local part that indicate promotions.
     * Matched against full from_address string.
     */
    private const PROMO_FROM_PATTERNS = [
        '/marketing/i',
        '/newsletter/i',
        '/promo/i',
        '/offers/i',
        '/ofertas/i',
        '/deals/i',
        '/campaign/i',
        '/novedades/i',
        '/comunicacion/i',
        '/comunicaciones/i',
        '/news@/i',
        '/digest@/i',
        '/weekly@/i',
        '/daily@/i',
    ];

    /**
     * Patterns in the from_address that indicate transactional/update emails.
     * Includes English AND Spanish no-reply variants.
     */
    private const UPDATE_FROM_PATTERNS = [
        // English no-reply variants
        '/noreply/i',
        '/no-reply/i',
        '/no\.reply/i',
        '/no_reply/i',
        '/do[-_.]?not[-_.]?reply/i',
        // Spanish no-reply variants
        '/no[-_.]?responder/i',
        '/no[-_.]?responda/i',
        '/no[-_.]?respondas/i',
        '/nocontestar/i',
        // Notification patterns
        '/notifications?@/i',
        '/notificaciones?@/i',
        '/alerts?@/i',
        '/alertas?@/i',
        // Billing & finance
        '/billing/i',
        '/factura/i',
        '/facturacion/i',
        '/cobranzas/i',
        '/payment/i',
        '/invoice/i',
        '/receipt/i',
        '/recibo/i',
        // Account & security
        '/account/i',
        '/security/i',
        '/seguridad/i',
        '/verify/i',
        '/verification/i',
        '/verificacion/i',
        // Orders & shipping
        '/confirmation/i',
        '/confirmacion/i',
        '/order/i',
        '/pedido/i',
        '/shipping/i',
        '/delivery/i',
        '/envio/i',
        // Service & support
        '/support/i',
        '/soporte/i',
        '/service/i',
        // Transactional senders
        '/avisos/i',
        '/mensajero@/i',
        '/mensajes@/i',
        '/mensajesyavisos/i',
        '/postmaster/i',
        '/mailer-daemon/i',
        '/automated/i',
        '/calendar[-_.]?notification/i',
        '/info@.*mercadopago/i',
        '/info@.*mercadolibre/i',
    ];

    /**
     * Subject patterns that strongly indicate updates/transactional emails.
     * Used as secondary signal when from_address doesn't match.
     */
    private const UPDATE_SUBJECT_PATTERNS = [
        '/tu (recibo|factura|pedido|orden|compra|pago|envio)/i',
        '/your (receipt|invoice|order|payment|shipment)/i',
        '/confirmamos tu/i',
        '/confirmaci[oó]n de/i',
        '/order confirm/i',
        '/factura (mensual|electr[oó]nica)/i',
        '/deuda registrada/i',
        '/estado de cuenta/i',
        '/resumen de (cuenta|tarjeta)/i',
    ];

    public function classifyWithOverrides(array $data, int $mailboxId): string
    {
        $fromAddress = strtolower($data['from_address'] ?? '');

        if ($fromAddress) {
            $override = SenderCategoryOverride::where('mailbox_id', $mailboxId)
                ->where('from_address', $fromAddress)
                ->first();

            if ($override) {
                return $override->category;
            }
        }

        return $this->classify($data);
    }

    public function classify(array $data): string
    {
        $fromAddress = strtolower($data['from_address'] ?? '');
        $fromDomain = $this->extractDomain($fromAddress);
        $listUnsubscribe = $data['list_unsubscribe'] ?? null;
        $listId = $data['list_id'] ?? null;
        $subject = $data['subject'] ?? '';

        // 1. Social: from known social/collaboration platform domains
        if ($this->isDomainMatch($fromDomain, self::SOCIAL_DOMAINS)) {
            return 'social';
        }

        // 2. Promotions: newsletter/promo patterns (with OR without list_unsubscribe)
        if ($this->matchesAnyPattern($fromAddress, self::PROMO_FROM_PATTERNS)) {
            return 'promotions';
        }

        // 3. Promotions: has list_unsubscribe + marketing platform domain
        if ($listUnsubscribe && $this->isDomainMatch($fromDomain, self::MARKETING_DOMAINS)) {
            return 'promotions';
        }

        // 4. Updates: transactional/no-reply patterns
        if ($this->matchesAnyPattern($fromAddress, self::UPDATE_FROM_PATTERNS)) {
            return 'updates';
        }

        // 5. Updates: subject patterns for transactional emails
        if ($this->matchesAnyPattern($subject, self::UPDATE_SUBJECT_PATTERNS)) {
            return 'updates';
        }

        // 6. Promotions: has both list_id AND list_unsubscribe (commercial mailing lists, not real forums)
        if ($listId && $listUnsubscribe) {
            return 'promotions';
        }

        // 7. Forums: has list_id only (actual mailing lists/forums without unsubscribe = real discussion)
        if ($listId) {
            return 'forums';
        }

        // 8. Promotions fallback: has list_unsubscribe but didn't match above
        if ($listUnsubscribe) {
            return 'promotions';
        }

        // 9. Primary: personal/business email
        return 'primary';
    }

    private function extractDomain(string $email): string
    {
        $parts = explode('@', $email, 2);

        return $parts[1] ?? '';
    }

    private function isDomainMatch(string $domain, array $domains): bool
    {
        foreach ($domains as $d) {
            if ($domain === $d || str_ends_with($domain, '.'.$d)) {
                return true;
            }
        }

        return false;
    }

    private function matchesAnyPattern(string $value, array $patterns): bool
    {
        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $value)) {
                return true;
            }
        }

        return false;
    }
}

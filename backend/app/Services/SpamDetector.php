<?php

namespace App\Services;

class SpamDetector
{
    private const DISPOSABLE_DOMAINS = [
        'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
        'yopmail.com', 'sharklasers.com', 'grr.la', 'guerrillamailblock.com',
        'pokemail.net', 'spam4.me', 'binkmail.com', 'safetymail.info',
        'trashmail.com', 'trashmail.me', 'trashmail.net', 'dispostable.com',
        'maildrop.cc', 'mailnesia.com', 'tempail.com', 'tempr.email',
        'temp-mail.org', 'fakeinbox.com', 'getnada.com', 'emailondeck.com',
        'mintemail.com', 'mohmal.com', 'burnermail.io', 'inboxbear.com',
    ];

    // English phishing subject patterns
    private const PHISHING_SUBJECT_PATTERNS_EN = [
        '/urgent.*action.*required/i',
        '/verify.*your.*account/i',
        '/account.*suspen/i',
        '/unusual.*sign.*in/i',
        '/click.*here.*immediately/i',
        '/your.*account.*has.*been/i',
        '/confirm.*your.*identity/i',
        '/security.*alert.*action/i',
        '/password.*expir/i',
        '/unauthorized.*access/i',
        '/billing.*issue.*update.*payment/i',
        '/prime.*membership.*renewing/i',
        '/I\s*RECORDED\s*YOU/i',
        '/YOU\s*PERVERT/i',
        '/action\s*required.*icloud/i',
        '/update\s*payment\s*method\s*immediately/i',
        '/unlimited\s*SMTP/i',
        '/fresh\s*email\s*list/i',
        '/mass\s*mailing\s*tools/i',
        '/SMTP.*cpanel/i',
        '/email\s*sorter/i',
        '/SMTP\s*crack/i',
        '/welcome\s*package.*claim/i',
        '/personal\s*code.*generated/i',
    ];

    // Spanish phishing subject patterns
    private const PHISHING_SUBJECT_PATTERNS_ES = [
        '/obligaciones?\s*(fiscales?|tributarias?)\s*(impag|pendient|vencid)/iu',
        '/deuda\s*(pendiente|vencida|impaga|fiscal|tributaria)/iu',
        '/acci[oó]n\s*requerida/iu',
        '/cuenta\s*(suspendida|bloqueada|inhabilitada)/iu',
        '/irregularidad\s*(fiscal|tributari|en\s*(su|tu)\s*cuenta)/iu',
        '/notificaci[oó]n\s*(judicial|legal|fiscal)/iu',
        '/bloqueo\s*de\s*(su|tu)?\s*cuenta/iu',
        '/regularizaci[oó]n\s*(inmediata|urgente)/iu',
        '/verifi(car|que)\s*(su|tu)\s*identidad/iu',
        '/acceso\s*no\s*autorizado/iu',
        '/actividad\s*sospechosa\s*(en|de)\s*(su|tu)/iu',
        '/embargo\s*(de\s*)?(su|tu|bienes|cuenta)/iu',
        '/intimaci[oó]n\s*(de\s*pago|fiscal|legal)/iu',
        '/c[eé]dula\s*de\s*notificaci[oó]n/iu',
        '/requerimiento\s*(fiscal|impositivo|de\s*pago)/iu',
        '/multa\s*(pendiente|impaga|fiscal)/iu',
        '/pago\s*(rechazado|fallido|no\s*registrado|impactado)/iu',
        '/cobro\s*(pendiente|rechazado)/iu',
        '/(actuali[czs][aáe]|confirm[aáe]|compro[bv][aáe])\s*(tu|su|sus|tus)?\s*(m[eé]todo|medio|forma|datos?|detalles?)\s*de\s*pago/iu',
        '/[uú]ltimo\s*(pago|cobro|d[eé]bito)\s*(no\s*registrado|rechazado|fallido|pendiente)/iu',
        '/proceso\s*judicial\s*(en\s*ejecuci[oó]n)/iu',
        '/acreditaci[oó]n\s*(registrada|confirmada)/iu',
        '/transferencia\s*acreditada/iu',
        '/complete?\s*(el\s*)?pago\s*de\s*env[ií]o/iu',
        '/tu\s*paquete\s*te\s*est[aá]\s*esperando/iu',
        '/documentos?\s*pendientes?/iu',
        '/suscripci[oó]n\s*(puede\s*cortarse|rechazad)/iu',
        '/aviso\s*(sobre|r[aá]pido)?\s*(tu|su)\s*[uú]ltimo\s*(cobro|pago|d[eé]bito)/iu',
        '/verifi(c[aá]|car)\s*(el\s*)?[uú]ltimo\s*d[eé]bito/iu',
        '/(se\s*)?requiere\s*confirmaci[oó]n\s*de\s*cuenta/iu',
        '/confirmaci[oó]n\s*de\s*cuenta\s*requerida/iu',
        '/datos?\s*de\s*pago\s*(por\s*)?actualizar/iu',
        '/pod[eé]s\s*revisar\s*tus\s*pagos/iu',
        '/aviso\s*(r[aá]pido\s*)?(sobre\s*)?(tu|su)\s*suscripci[oó]n/iu',
        '/notificaci[oó]n\s*de\s*env[ií]o\s*correo\s*argentino/iu',
        '/servicio\s*postal.*env[ií]o.*pendiente/iu',
        '/actualizaci[oó]n\s*de\s*(tu|su)\s*env[ií]o/iu',
        '/estimado.*requiere\s*(tu|su)\s*atenci[oó]n/iu',
        '/requerimiento\s*de\s*aclaraciones\s*en\s*tr[aá]mite/iu',
        '/informaci[oó]n\s*actualizada\s*sobre\s*(su|tu)\s*ex?\s*pediente/iu',
        '/aviso\s*de\s*cobran[cç]a/iu',
        '/el\s*dinero\s*fue\s*acreditado/iu',
        '/por\s*favor\s*actualice?\s*(sus|tus)\s*(detalles?|datos?)\s*de\s*pago/iu',
        '/pago\s*de\s*(tu|su)\s*suscripci[oó]n\s*(rechazado|fallido|pendiente)/iu',
        '/comprobante\s*fiscal\s*disponible/iu',
        '/correo\s*argentino.*paquete/iu',
        '/extracto\s*de\s*cuenta\s*informativo/iu',
    ];

    // Spanish body patterns that indicate phishing when combined
    private const PHISHING_BODY_PATTERNS_ES = [
        '/acciones?\s*legales/iu',
        '/bloqueos?\s*de\s*cuentas?\s*bancarias?/iu',
        '/sanciones?\s*administrativas?/iu',
        '/tributos?\s*no\s*pagados?/iu',
        '/regularizaci[oó]n\s*inmediata/iu',
        '/recargos?\s*adicionales?/iu',
        '/estimado\s*contribuyente/iu',
        '/intereses?\s*acumulados?/iu',
        '/descargar\s*(el\s*)?(documento|archivo|informe)\s*(oficial|adjunto|de\s*deuda)/iu',
        '/VENCIDO/u',
        '/ACCI[OÓ]N\s*REQUERIDA/u',
        '/actualizar?\s*(datos?\s*de|forma\s*de|m[eé]todo\s*de)\s*pago/iu',
        '/su\s*(env[ií]o|paquete)\s*(est[aá]\s*pendiente|no\s*(pudo|fue))/iu',
        '/gastos?\s*de\s*env[ií]o\s*(pendiente|no\s*pagad)/iu',
        '/hac[eé]\s*click\s*(ac[aá]|aqu[ií])\s*para\s*(regularizar|actualizar|confirmar|verificar)/iu',
        '/comprobante\s*(fiscal|de\s*pago)\s*disponible/iu',
        '/para\s*evitar\s*(el\s*)?(bloqueo|suspensi[oó]n|cancelaci[oó]n)/iu',
        '/su\s*cuenta\s*ser[aá]\s*(bloqueada|suspendida|cancelada)/iu',
        '/haga\s*click\s*(en\s*el\s*)?(siguiente\s*)?(bot[oó]n|enlace|link)/iu',
        '/verifique\s*(su|tu)\s*(cuenta|identidad|datos)/iu',
    ];

    // VPS / generic hosting hostname prefixes
    private const SUSPICIOUS_HOSTNAME_PREFIXES = [
        'vps', 'vps1', 'vps2', 'vps3', 'srv', 'server', 'host', 'node',
        'cloud', 'box', 'vm', 'dedicated', 'mailer', 'bulk', 'mass',
    ];

    // Suspicious foreign TLDs for emails targeting Argentine users
    private const SUSPICIOUS_LINK_TLDS = [
        'vn', 'cn', 'ru', 'tk', 'ml', 'ga', 'cf', 'gq', 'top', 'xyz',
        'buzz', 'work', 'click', 'link', 'icu', 'pw', 'cc', 'su',
        'bid', 'loan', 'racing', 'review', 'win', 'download', 'stream',
        'space', 'cloud', 'online', 'site', 'digital', 'center',
    ];

    public function score(array $data): int
    {
        $score = 0;
        $subject = $data['subject'] ?? '';
        $fromAddress = $data['from_address'] ?? '';
        $authResults = $data['authentication_results'] ?? null;

        $score += $this->scoreAuthResults($authResults);
        $score += $this->scoreMessageId($data['message_id'] ?? null);
        $score += $this->scoreSenderReputation($fromAddress);
        $score += $this->scoreDangerousContent(
            $subject,
            $data['html_body'] ?? '',
            $data['text_body'] ?? ''
        );
        $score += $this->scoreSuspiciousImages($data['html_body'] ?? '');
        $score += $this->scoreExcessiveUrls($data['html_body'] ?? $data['text_body'] ?? '');
        $score += $this->scoreBulkCharacteristics(
            $data['list_id'] ?? null,
            $data['list_unsubscribe'] ?? null
        );
        $score += $this->scoreSuspiciousLinks(
            $data['html_body'] ?? $data['text_body'] ?? '',
            $fromAddress
        );
        $score += $this->scoreHomoglyphs($subject);
        $score += $this->scoreFakeTransactionId($subject);
        $normalizedSubject = $this->normalizeHomoglyphs($subject);
        $score += $this->scoreNoAuthWithFinancialSubject($authResults, $normalizedSubject);
        $score += $this->scoreSenderSubjectMismatch($fromAddress, $normalizedSubject);

        return min($score, 100);
    }

    private function scoreAuthResults(?string $authResults): int
    {
        if (!$authResults) {
            return 0;
        }

        $score = 0;

        if (preg_match('/spf=(fail|softfail)/i', $authResults)) {
            $score += 30;
        }

        if (preg_match('/dkim=fail/i', $authResults)) {
            $score += 30;
        } elseif (preg_match('/dkim=none/i', $authResults)) {
            $score += 15;
        } elseif (!preg_match('/dkim=/i', $authResults)) {
            $score += 15;
        }

        if (preg_match('/dmarc=(fail|none)/i', $authResults)) {
            $score += 20;
        }

        if (preg_match('/envelope-from=([^;\s]+)/i', $authResults, $envFrom)
            && preg_match('/header\.from=([^;\s]+)/i', $authResults, $headerFrom)) {
            $envDomain = $this->extractDomain($envFrom[1]);
            $headerDomain = $headerFrom[1];
            if ($envDomain && $headerDomain && $envDomain !== $headerDomain) {
                $score += 10;
            }
        }

        return $score;
    }

    private function scoreMessageId(?string $messageId): int
    {
        if (!$messageId || !str_contains($messageId, '@')) {
            return 15;
        }

        return 0;
    }

    private function scoreSenderReputation(string $fromAddress): int
    {
        $fromAddress = strtolower($fromAddress);
        $parts = explode('@', $fromAddress, 2);
        $domain = $parts[1] ?? '';
        $local = $parts[0] ?? '';

        $score = 0;

        // Disposable email domains
        if (in_array($domain, self::DISPOSABLE_DOMAINS, true)) {
            return 20;
        }

        // Long hex strings or all-digit local parts
        if (preg_match('/^[a-f0-9]{20,}$/i', $local) || preg_match('/^\d{10,}$/', $local)) {
            $score += 15;
        }

        // Auto-generated sender patterns (e.g., Informe-N14146, Alert-ID8837, Caso-R2891)
        if (preg_match('/^[a-z]+-[a-z]?\d{3,}$/i', $local)) {
            $score += 15;
        }

        // Auto-generated freemail patterns (e.g., daniela_tdj294661@libero.it, ponte_sab285494@libero.it)
        if (preg_match('/^[a-z]+_[a-z]{2,4}\d{4,}$/i', $local)) {
            $score += 25;
        }

        // Auto-generated patterns with _gpt, _docs suffix (e.g., valentine_gpt891423@libero.it, paula_docs710211@libero.it)
        if (preg_match('/^[a-z]+_(gpt|docs|bot|api|sys|tmp|test)\d{4,}$/i', $local)) {
            $score += 25;
        }

        // Name + _argenta/similar pattern (e.g., luna_argenta469101@libero.it)
        if (preg_match('/^[a-z]+_[a-z]{5,}\d{4,}$/i', $local)) {
            $score += 25;
        }

        // Random gibberish local parts (20+ chars with consonant clusters)
        if (strlen($local) > 20 && preg_match('/[bcdfghjklmnpqrstvwxyz]{5,}/i', $local)) {
            $score += 15;
        }

        // Local part contains a different domain (e.g., rimcasino.cc@advancedsafetytrainingllc.com)
        if (preg_match('/\.[a-z]{2,6}$/i', $local)) {
            $score += 20;
        }

        // Casino/gambling terms in local part
        if (preg_match('/(casino|cazzino|poker|betting|slot|jackpot)/i', $local)) {
            $score += 25;
        }

        // Random-looking subdomains on biz.id (e.g., a33.shoon5.biz.id)
        if (preg_match('/\.biz\.id$/i', $domain)) {
            $score += 20;
        }

        // Random long subdomains on cloud hosting (e.g., 8caabc7.online-server.cloud)
        if (preg_match('/\.online-server\.(cloud|net|com)$/i', $domain)) {
            $score += 15;
        }

        // Random hash-like subdomains on gadget.app
        if (preg_match('/\.gadget\.app$/i', $domain)) {
            $score += 15;
        }

        // Numeric subdomain prefix (e.g., a33.something, a13.something, a19.something)
        if (preg_match('/^[a-z]\d{1,3}\./i', $domain)) {
            $score += 10;
        }

        // s[N] or similar numbered subdomains (e.g., s9.maxkitap.com)
        if (preg_match('/^[a-z]\d+\./i', $domain) && preg_match('/\.(com|net|org)$/i', $domain)) {
            $score += 10;
        }

        // VPS / generic hosting hostnames (e.g., vps.gemagrup.net, srv1.example.com)
        $domainParts = explode('.', $domain);
        if (count($domainParts) >= 3) {
            $subdomain = $domainParts[0];
            if (in_array($subdomain, self::SUSPICIOUS_HOSTNAME_PREFIXES, true)) {
                $score += 10;
            }
        }

        // Subdomain of firebaseapp.com, appspot.com, etc. (free hosting abuse)
        $freeHostingDomains = ['firebaseapp.com', 'appspot.com', 'herokuapp.com', 'web.app', 'netlify.app', 'vercel.app', 'pages.dev'];
        foreach ($freeHostingDomains as $freeHost) {
            if (str_ends_with($domain, '.' . $freeHost) || $domain === $freeHost) {
                $score += 15;
                break;
            }
        }

        // mtasrv.net and similar MTA relay domains
        if (preg_match('/\.(mtasrv|senders|mta)\.(net|com)$/i', $domain)) {
            $score += 10;
        }

        // custom-mail.info and similar generic mail service domains
        if (preg_match('/^(custom-mail|bulk-mail|mass-mail|send-mail)\./i', $domain) || $domain === 'custom-mail.info') {
            $score += 15;
        }

        return min($score, 35);
    }

    private function scoreDangerousContent(string $subject, string $htmlBody, string $textBody): int
    {
        $score = 0;
        $body = $htmlBody ?: $textBody;

        // Normalize homoglyphs in subject before pattern matching so Cyrillic/Greek confusables
        // don't bypass regex (e.g., Greek Ρ→P, Cyrillic о→o, а→a, е→e, с→c)
        $normalizedSubject = $this->normalizeHomoglyphs($subject);

        // English phishing subject patterns
        foreach (self::PHISHING_SUBJECT_PATTERNS_EN as $pattern) {
            if (preg_match($pattern, $normalizedSubject)) {
                $score += 25;
                break;
            }
        }

        // Spanish phishing subject patterns
        if ($score === 0) {
            foreach (self::PHISHING_SUBJECT_PATTERNS_ES as $pattern) {
                if (preg_match($pattern, $normalizedSubject)) {
                    $score += 25;
                    break;
                }
            }
        }

        if (!$body) {
            return $score;
        }

        // URLs with IP addresses instead of domains
        if (preg_match('/https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i', $body)) {
            $score += 20;
        }

        // data: URIs in href (potential obfuscation)
        if (preg_match('/href\s*=\s*["\']?\s*data:/i', $body)) {
            $score += 20;
        }

        // data: URIs in src (potential malware disguised as images)
        if (preg_match('/src\s*=\s*["\']?\s*data:/i', $body)) {
            $score += 25;
        }

        // Percent-encoded URLs in hrefs (obfuscation technique)
        if (preg_match('/href\s*=\s*["\'][^"\']*%[0-9a-f]{2}.*%[0-9a-f]{2}/i', $body)) {
            $score += 10;
        }

        // Spanish phishing body content — count matching patterns
        $bodyText = strip_tags($body);
        $esBodyHits = 0;
        foreach (self::PHISHING_BODY_PATTERNS_ES as $pattern) {
            if (preg_match($pattern, $bodyText)) {
                $esBodyHits++;
            }
        }
        if ($esBodyHits >= 3) {
            $score += 25;
        } elseif ($esBodyHits >= 2) {
            $score += 15;
        }

        return min($score, 60);
    }

    /**
     * Detect Unicode homoglyph attacks: Cyrillic/Greek characters mixed with Latin text.
     * E.g., "Ρago" uses Greek Rho (U+03A1) instead of P, "Necesitamоs" uses Cyrillic о (U+043E).
     */
    private function scoreHomoglyphs(string $subject): int
    {
        if (!$subject) {
            return 0;
        }

        $hasLatin = preg_match('/[a-zA-Z]/', $subject);
        $hasCyrillic = preg_match('/[\x{0400}-\x{04FF}]/u', $subject);
        $hasGreek = preg_match('/[\x{0370}-\x{03FF}]/u', $subject);

        if ($hasLatin && ($hasCyrillic || $hasGreek)) {
            return 40;
        }

        return 0;
    }

    private function normalizeHomoglyphs(string $text): string
    {
        $map = [
            "\xCE\x91" => 'A', "\xCE\x92" => 'B', "\xCE\x95" => 'E', "\xCE\x96" => 'Z',
            "\xCE\x97" => 'H', "\xCE\x99" => 'I', "\xCE\x9A" => 'K', "\xCE\x9C" => 'M',
            "\xCE\x9D" => 'N', "\xCE\x9F" => 'O', "\xCE\xA1" => 'P', "\xCE\xA4" => 'T',
            "\xCE\xA5" => 'Y', "\xCE\xA7" => 'X',
            "\xCE\xBF" => 'o',
            "\xD0\x90" => 'A', "\xD0\x92" => 'B', "\xD0\x95" => 'E', "\xD0\x9A" => 'K',
            "\xD0\x9C" => 'M', "\xD0\x9D" => 'H', "\xD0\x9E" => 'O', "\xD0\xA0" => 'P',
            "\xD0\xA1" => 'C', "\xD0\xA2" => 'T', "\xD0\xA5" => 'X',
            "\xD0\xB0" => 'a', "\xD0\xB5" => 'e', "\xD0\xBE" => 'o', "\xD1\x80" => 'p',
            "\xD1\x81" => 'c', "\xD1\x83" => 'y', "\xD1\x85" => 'x',
        ];

        return strtr($text, $map);
    }

    /**
     * Detect fake financial transaction subjects: date + time + alphanumeric transaction ID.
     * Pattern: "Pago impactado exitosamente 08/03/2026 23:41:26 F4INQ1XWQPETFG15FZ4Q"
     * Legitimate services never embed raw transaction IDs in subject lines like this.
     */
    private function scoreFakeTransactionId(string $subject): int
    {
        if (preg_match('/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+[A-Z0-9]{4,}/', $subject)) {
            return 35;
        }

        // Numeric case/reference IDs at end of subject (e.g., "991553-2026", "(69071062)")
        if (preg_match('/[\.\s]\d{5,}-\d{4}\s*$/', $subject) || preg_match('/\(\d{6,}\)\s*$/', $subject)) {
            return 10;
        }

        return 0;
    }

    /**
     * No authentication results + financial/payment subject = very suspicious.
     * Most phishing emails from spoofed domains lack auth results entirely,
     * while legitimate financial services always have SPF/DKIM/DMARC.
     */
    private function scoreNoAuthWithFinancialSubject(?string $authResults, string $subject): int
    {
        if ($authResults) {
            return 0;
        }

        $financialPatterns = [
            '/pago/iu', '/cobro/iu', '/d[eé]bito/iu', '/factura/iu',
            '/env[ií]o.*pendiente/iu', '/paquete.*esperando/iu',
            '/servicio\s*postal/iu', '/correo\s*argentino/iu',
            '/acreditac/iu', '/transferencia/iu',
            '/suscripci[oó]n/iu', '/confirmaci[oó]n\s*de\s*cuenta/iu',
            '/forma\s*de\s*pago/iu', '/medio\s*de\s*pago/iu', '/m[eé]todo\s*de\s*pago/iu',
            '/datos?\s*de\s*pago/iu', '/detalles?\s*de\s*pago/iu',
            '/billing/i', '/payment.*method/i', '/payment.*issue/i',
        ];

        foreach ($financialPatterns as $pattern) {
            if (preg_match($pattern, $subject)) {
                return 20;
            }
        }

        return 0;
    }

    /**
     * Sender domain is clearly unrelated to a financial/payment subject.
     * E.g., pawsomepet.co sending "Pago rechazado" or lhh.com sending "Correo Argentino" notifications.
     */
    private function scoreSenderSubjectMismatch(string $fromAddress, string $subject): int
    {
        $domain = $this->extractDomain($fromAddress);

        // Only flag if subject is payment/financial
        $isFinancialSubject = preg_match('/(pago|cobro|d[eé]bito|factura|acreditac|transferencia|suscripci[oó]n|env[ií]o|paquete|correo\s*argentino|billing|payment)/iu', $subject);
        if (!$isFinancialSubject) {
            return 0;
        }

        // Known legitimate financial/payment domains should NOT be flagged
        $legitimateFinancialDomains = [
            'mercadopago.com', 'mercadolibre.com', 'paypal.com', 'stripe.com',
            'visa.com', 'mastercard.com', 'amex.com', 'naranja.com',
            'bancoprovincia.com.ar', 'bancogalicia.com.ar', 'bbva.com.ar',
            'santander.com.ar', 'macro.com.ar', 'hsbc.com.ar',
            'brubank.com.ar', 'ualabee.com.ar', 'uala.com.ar',
            'correoargentino.com.ar', 'andreani.com', 'oca.com.ar',
            'afip.gob.ar', 'arba.gov.ar',
        ];

        $baseDomain = $this->getBaseDomain($domain);
        if (in_array($baseDomain, $legitimateFinancialDomains, true)) {
            return 0;
        }

        // Flagged: domain contains NO financial keywords but subject is financial
        $domainLooksFinancial = preg_match('/(bank|banco|pay|pago|financ|credit|credito|envio|correo|postal|segur|insurance)/i', $domain);
        if (!$domainLooksFinancial) {
            return 15;
        }

        return 0;
    }

    private function scoreSuspiciousImages(string $body): int
    {
        if (!$body) {
            return 0;
        }

        $score = 0;

        // 1x1 tracking pixels
        if (preg_match('/<img\b[^>]*(?:width\s*=\s*["\']?1["\']?\b|height\s*=\s*["\']?1["\']?\b)[^>]*>/i', $body)) {
            $score += 5;
        }

        // Images with display:none or visibility:hidden
        if (preg_match('/<img\b[^>]*style\s*=\s*["\'][^"\']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i', $body)) {
            $score += 10;
        }

        // Excessive external images (common in phishing)
        $externalImgCount = preg_match_all('/<img\b[^>]*src\s*=\s*["\']?https?:\/\//i', $body);
        if ($externalImgCount > 15) {
            $score += 10;
        }

        return min($score, 15);
    }

    private function scoreExcessiveUrls(string $body): int
    {
        if (!$body) {
            return 0;
        }

        $urlCount = preg_match_all('/https?:\/\//i', $body);

        return $urlCount > 10 ? 10 : 0;
    }

    private function scoreBulkCharacteristics(?string $listId, ?string $listUnsubscribe): int
    {
        if ($listId && !$listUnsubscribe) {
            return 10;
        }

        return 0;
    }

    private function scoreSuspiciousLinks(string $body, string $fromAddress): int
    {
        if (!$body) {
            return 0;
        }

        $score = 0;

        if (!preg_match_all('/href\s*=\s*["\']?(https?:\/\/[^"\'>\s]+)/i', $body, $matches)) {
            return 0;
        }

        $urls = array_unique($matches[1]);
        $senderDomain = $this->extractDomain($fromAddress);

        foreach ($urls as $url) {
            $linkHost = parse_url($url, PHP_URL_HOST);
            if (!$linkHost) {
                continue;
            }

            $linkHost = strtolower($linkHost);

            $linkParts = explode('.', $linkHost);
            $linkTld = end($linkParts);

            if (in_array($linkTld, self::SUSPICIOUS_LINK_TLDS, true)) {
                $score += 15;
                break;
            }

            if ($senderDomain && $linkHost) {
                $linkBaseDomain = $this->getBaseDomain($linkHost);
                $senderBaseDomain = $this->getBaseDomain($senderDomain);

                $trackingDomains = [
                    'google.com', 'googleapis.com', 'gstatic.com',
                    'facebook.com', 'fbcdn.net',
                    'twitter.com', 'twimg.com',
                    'linkedin.com', 'licdn.com',
                    'apple.com', 'icloud.com',
                    'microsoft.com', 'office.com', 'outlook.com',
                    'sendgrid.net', 'mailchimp.com', 'mailgun.org',
                    'amazonaws.com', 'cloudfront.net',
                ];
                if (in_array($linkBaseDomain, $trackingDomains, true)) {
                    continue;
                }
            }
        }

        return min($score, 20);
    }

    private function extractDomain(string $emailOrDomain): string
    {
        $parts = explode('@', $emailOrDomain, 2);
        return strtolower($parts[1] ?? $parts[0]);
    }

    private function getBaseDomain(string $host): string
    {
        $parts = explode('.', $host);
        if (count($parts) >= 2) {
            return implode('.', array_slice($parts, -2));
        }
        return $host;
    }
}

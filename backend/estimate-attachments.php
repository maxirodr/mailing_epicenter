<?php
/**
 * Quick script to estimate total attachment size from mbox.
 * Samples first N matching emails and extrapolates.
 */

$file = $argv[1] ?? '';
$addresses = array_map('strtolower', explode(',', $argv[2] ?? ''));
$sampleSize = (int)($argv[3] ?? 500);

if (!file_exists($file)) { die("File not found\n"); }

$handle = fopen($file, 'r');
$matched = 0;
$totalAttachments = 0;
$totalBytes = 0;
$emailsWithAttachments = 0;
$rawMessage = '';

echo "Sampling {$sampleSize} matching emails for attachment estimation...\n";

while (($line = fgets($handle)) !== false) {
    if (str_starts_with($line, 'From ') && $rawMessage !== '') {
        if (processMessage($rawMessage, $addresses, $totalAttachments, $totalBytes, $emailsWithAttachments)) {
            $matched++;
            if ($matched >= $sampleSize) break;
            if ($matched % 100 === 0) echo "  Sampled: {$matched}/{$sampleSize}\n";
        }
        $rawMessage = '';
        continue;
    }
    $rawMessage .= $line;
}
fclose($handle);

// Last message
if ($rawMessage !== '' && $matched < $sampleSize) {
    processMessage($rawMessage, $addresses, $totalAttachments, $totalBytes, $emailsWithAttachments);
    $matched++;
}

$totalEmails = 92906;
$ratio = $matched > 0 ? $totalEmails / $matched : 0;
$estimatedBytes = $totalBytes * $ratio;
$estimatedAttachments = (int)($totalAttachments * $ratio);
$estimatedEmailsWithAtt = (int)($emailsWithAttachments * $ratio);

echo "\n=== Sample Results ({$matched} emails) ===\n";
echo "Emails with attachments: {$emailsWithAttachments}\n";
echo "Total attachments: {$totalAttachments}\n";
echo "Total size: " . formatBytes($totalBytes) . "\n";
echo "\n=== Extrapolated to {$totalEmails} emails ===\n";
echo "Emails with attachments: ~{$estimatedEmailsWithAtt}\n";
echo "Total attachments: ~{$estimatedAttachments}\n";
echo "Estimated upload size: ~" . formatBytes((int)$estimatedBytes) . "\n";

function processMessage(string $raw, array $addresses, int &$totalAtt, int &$totalBytes, int &$emailsWithAtt): bool {
    $rawLower = strtolower($raw);
    $found = false;
    foreach ($addresses as $addr) {
        if (str_contains($rawLower, $addr)) { $found = true; break; }
    }
    if (!$found) return false;

    // Parse headers
    $pos = strpos($raw, "\n\n");
    if ($pos === false) return true;
    $headerSection = substr($raw, 0, $pos);
    $headerSection = preg_replace('/\r?\n[ \t]+/', ' ', $headerSection);

    $headers = [];
    foreach (explode("\n", $headerSection) as $line) {
        if (preg_match('/^([A-Za-z0-9-]+):\s*(.*)$/', rtrim($line, "\r"), $m)) {
            $headers[strtolower($m[1])] = $m[2];
        }
    }

    // Quick check: is target in from/to/cc?
    $check = strtolower(($headers['from'] ?? '') . ' ' . ($headers['to'] ?? '') . ' ' . ($headers['cc'] ?? '') . ' ' . ($headers['delivered-to'] ?? ''));
    $matched = false;
    foreach ($addresses as $addr) {
        if (str_contains($check, $addr)) { $matched = true; break; }
    }
    if (!$matched) return false;

    // Check for attachments in body
    $ct = $headers['content-type'] ?? '';
    if (!str_contains(strtolower($ct), 'multipart/')) return true;

    $body = substr($raw, $pos + 2);
    $atts = countAttachments($body, $ct);
    if ($atts['count'] > 0) {
        $emailsWithAtt++;
        $totalAtt += $atts['count'];
        $totalBytes += $atts['bytes'];
    }
    return true;
}

function countAttachments(string $body, string $contentType): array {
    $result = ['count' => 0, 'bytes' => 0];
    if (!preg_match('/boundary\s*=\s*"?([^";,\s]+)/i', $contentType, $m)) return $result;
    $boundary = trim($m[1], '"');

    $parts = explode('--' . $boundary, $body);
    array_shift($parts);

    foreach ($parts as $part) {
        $part = trim($part);
        if ($part === '--' || str_starts_with($part, '--')) continue;

        $hEnd = strpos($part, "\n\n");
        if ($hEnd === false) continue;
        $ph = substr($part, 0, $hEnd);
        $pb = substr($part, $hEnd + 2);
        $ph = preg_replace('/\r?\n[ \t]+/', ' ', $ph);

        $pHeaders = [];
        foreach (explode("\n", $ph) as $line) {
            if (preg_match('/^([A-Za-z0-9-]+):\s*(.*)$/', rtrim($line, "\r"), $m2)) {
                $pHeaders[strtolower($m2[1])] = $m2[2];
            }
        }

        $pct = strtolower($pHeaders['content-type'] ?? 'text/plain');
        $disp = strtolower($pHeaders['content-disposition'] ?? '');

        // Nested multipart
        if (str_contains($pct, 'multipart/')) {
            $nested = countAttachments($pb, $pHeaders['content-type'] ?? '');
            $result['count'] += $nested['count'];
            $result['bytes'] += $nested['bytes'];
            continue;
        }

        $isAtt = str_contains($disp, 'attachment');
        if (!$isAtt && str_contains($disp, 'inline') && !str_contains($pct, 'text/')) $isAtt = true;
        if (!$isAtt && !str_contains($pct, 'text/plain') && !str_contains($pct, 'text/html')) $isAtt = true;
        if (!$isAtt) continue;

        $enc = strtolower($pHeaders['content-transfer-encoding'] ?? '7bit');
        $rawSize = strlen($pb);
        $decoded = match($enc) {
            'base64' => (int)($rawSize * 0.75), // base64 ratio
            default => $rawSize,
        };
        $result['count']++;
        $result['bytes'] += $decoded;
    }
    return $result;
}

function formatBytes(int $bytes): string {
    $units = ['B', 'KB', 'MB', 'GB'];
    $i = 0; $s = $bytes;
    while ($s >= 1024 && $i < 3) { $s /= 1024; $i++; }
    return round($s, 2) . ' ' . $units[$i];
}

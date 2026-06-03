<?php

namespace App\Console\Commands;

use App\Models\Email;
use Illuminate\Console\Command;

class FixMimeAddressesCommand extends Command
{
    protected $signature = 'emails:fix-mime';
    protected $description = 'Decode MIME encoded-words in from_name, subject, to/cc/bcc addresses';

    public function handle(): void
    {
        $total = Email::count();
        $this->info("Scanning {$total} emails...");
        $fixed = 0;

        $bar = $this->output->createProgressBar($total);

        Email::chunk(200, function ($emails) use (&$fixed, $bar) {
            foreach ($emails as $email) {
                $changes = [];

                // Fix from_name
                if ($email->from_name && preg_match('/=\?/', $email->from_name)) {
                    $changes['from_name'] = $this->decodeMimeHeader($email->from_name);
                }

                // Fix subject
                if ($email->subject && preg_match('/=\?/', $email->subject)) {
                    $changes['subject'] = $this->decodeMimeHeader($email->subject);
                }

                // Fix address arrays
                foreach (['to_addresses', 'cc_addresses', 'bcc_addresses'] as $field) {
                    $addrs = $email->$field;
                    if (!is_array($addrs)) continue;

                    $cleaned = [];
                    $changed = false;
                    foreach ($addrs as $addr) {
                        if (preg_match('/=\?/', $addr)) {
                            $decoded = $this->decodeMimeHeader($addr);
                            // Extract just the email
                            if (preg_match('/<([^>]+)>/', $decoded, $m)) {
                                $cleaned[] = strtolower(trim($m[1]));
                            } elseif (preg_match('/[\w.+-]+@[\w.-]+\.\w{2,}/', $decoded, $m)) {
                                $cleaned[] = strtolower(trim($m[0]));
                            } else {
                                $cleaned[] = $addr;
                            }
                            $changed = true;
                        } else {
                            $cleaned[] = $addr;
                        }
                    }
                    if ($changed) {
                        $changes[$field] = $cleaned;
                    }
                }

                if (!empty($changes)) {
                    $email->update($changes);
                    $fixed++;
                }

                $bar->advance();
            }
        });

        $bar->finish();
        $this->newLine();
        $this->info("Fixed {$fixed} emails.");
    }

    private function decodeMimeHeader(string $header): string
    {
        if (! str_contains($header, '=?')) {
            return $header;
        }

        if (function_exists('iconv_mime_decode')) {
            $decoded = @iconv_mime_decode($header, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
            if ($decoded !== false && ! str_contains($decoded, '?')) {
                return $decoded;
            }
        }

        return preg_replace_callback(
            '/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/',
            function (array $matches) {
                $charset = $matches[1];
                $encoding = strtoupper($matches[2]);
                $text = $matches[3];

                if ($encoding === 'B') {
                    $text = base64_decode($text);
                } elseif ($encoding === 'Q') {
                    $text = quoted_printable_decode(str_replace('_', ' ', $text));
                }

                if ($text === false) {
                    return $matches[0];
                }

                $normalized = strtoupper(str_replace(['iso_', 'iso-'], ['ISO', 'ISO-'], $charset));
                if ($normalized !== 'UTF-8') {
                    $converted = @mb_convert_encoding($text, 'UTF-8', $charset);
                    if ($converted !== false) {
                        return $converted;
                    }
                }

                return $text;
            },
            $header
        );
    }
}

<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Config\Services;

/**
 * Rate limiting untuk POST /auth/login.
 * Maksimal 5 percobaan per menit untuk setiap username,
 * supaya password tidak bisa ditebak dengan mencoba ribuan kali (brute force).
 */
class BatasLogin implements FilterInterface
{
    private const MAKS_PER_MENIT = 5;

    public function before(RequestInterface $request, $arguments = null)
    {
        $body     = $request->getJSON(true);
        $username = is_array($body) ? strtolower(trim((string) ($body['username'] ?? ''))) : '';

        // kunci cache hanya boleh huruf/angka, jadi username di-hash
        $kunci     = 'login_' . md5($username);
        $throttler = Services::throttler();

        if ($throttler->check($kunci, self::MAKS_PER_MENIT, MINUTE) === false) {
            $tunggu = max(1, $throttler->getTokenTime());

            return Services::response()
                ->setStatusCode(429)
                ->setHeader('Retry-After', (string) $tunggu)
                ->setJSON([
                    'status'  => 'error',
                    'message' => "Terlalu banyak percobaan login. Coba lagi dalam {$tunggu} detik",
                    'data'    => null,
                ]);
        }

        return null;
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
        return null;
    }
}
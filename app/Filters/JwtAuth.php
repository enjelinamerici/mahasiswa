<?php

namespace App\Filters;

use CodeIgniter\Filters\FilterInterface;
use CodeIgniter\HTTP\RequestInterface;
use CodeIgniter\HTTP\ResponseInterface;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class JwtAuth implements FilterInterface
{
    public function before(RequestInterface $request, $arguments = null)
    {
        if (! preg_match('/^Bearer\s+(.+)$/i', $request->getHeaderLine('Authorization'), $m)) {
            return $this->tolak(401, 'Token tidak ada');
        }
        try {
            $data = JWT::decode($m[1], new Key(env('JWT_SECRET'), 'HS256'));
        } catch (\Throwable $e) {
            return $this->tolak(401, 'Token tidak valid atau kedaluwarsa');
        }
        if (! empty($arguments) && ! in_array($data->role, $arguments, true)) {
            return $this->tolak(403, 'Role tidak punya hak akses');
        }
    }

    public function after(RequestInterface $request, ResponseInterface $response, $arguments = null)
    {
    }

    private function tolak(int $kode, string $pesan)
    {
        return service('response')->setStatusCode($kode)
            ->setJSON(['status' => 'error', 'message' => $pesan, 'data' => null]);
    }
}
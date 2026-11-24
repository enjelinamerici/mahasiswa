<?php

namespace App\Controllers\Api;

use CodeIgniter\RESTful\ResourceController;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

class BaseApi extends ResourceController
{
    protected $format = 'json';

    // Isi token user yang login (role, nim, username)
    protected function pengguna(): ?object
    {
        if (! preg_match('/^Bearer\s+(.+)$/i', $this->request->getHeaderLine('Authorization'), $m)) {
            return null;
        }
        try {
            return JWT::decode($m[1], new Key(env('JWT_SECRET'), 'HS256'));
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function sukses($data = null, string $pesan = 'OK', int $kode = 200)
    {
        return $this->respond(['status' => 'success', 'message' => $pesan, 'data' => $data], $kode);
    }

    protected function gagal(string $pesan, int $kode = 400, $errors = null)
    {
        $body = ['status' => 'error', 'message' => $pesan, 'data' => null];
        if ($errors) {
            $body['errors'] = $errors;
        }
        return $this->respond($body, $kode);
    }

    // Petakan error PostgreSQL ke kode HTTP (tanpa membocorkan detail server)
    protected function errorDb(\Throwable $e)
    {
        $m = $e->getMessage();
        if (str_contains($m, 'duplicate key')) {
            return $this->gagal('Data sudah ada (duplikat)', 409);
        }
        if (str_contains($m, 'versi tidak cocok')) {
            return $this->gagal('Data sudah diubah pengguna lain, muat ulang lalu coba lagi', 409);
        }
        if (str_contains($m, 'tidak ditemukan')) {
            return $this->gagal('Data tidak ditemukan', 404);
        }
                if (str_contains($m, 'violates')) {
            return $this->gagal('Data melanggar aturan database. Semua perubahan dibatalkan (rollback)', 422);
        }
        if (str_contains($m, 'value too long')) {
            return $this->gagal('Ada isian yang terlalu panjang untuk database. Semua perubahan dibatalkan (rollback)', 422);
        }
        log_message('error', $m);
        return $this->gagal('Terjadi kesalahan pada server', 500);
    }
}
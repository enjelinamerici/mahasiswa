<?php

namespace App\Controllers\Api;

use CodeIgniter\RESTful\ResourceController;

class BaseApi extends ResourceController
{
    protected $format = 'json';

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
            return $this->gagal('Data melanggar aturan database', 422);
        }
        log_message('error', $m);
        return $this->gagal('Terjadi kesalahan pada server', 500);
    }
}
<?php

namespace App\Controllers\Api;

use Firebase\JWT\JWT;

class Auth extends BaseApi
{
    public function login()
    {
        $in = $this->request->getJSON(true) ?? [];
        $rules = [
            'username' => 'required|max_length[50]',
            'password' => 'required|max_length[100]',
        ];
        if (! $this->validateData($in, $rules)) {
            return $this->gagal('Validasi gagal', 422, $this->validator->getErrors());
        }

        $db = \Config\Database::connect();
        $u = $db->query(
            'SELECT u.id, u.username, u.password_hash, u.nim, r.nama AS role
               FROM akademik.users u JOIN akademik.roles r ON r.id = u.role_id
              WHERE u.username = ? AND u.is_active = TRUE',
            [$in['username']]
        )->getRowArray();

        if (! $u || ! password_verify($in['password'], $u['password_hash'])) {
            return $this->gagal('Username atau password salah', 401);
        }

        $now = time();
        $token = JWT::encode([
            'iss' => 'api-mahasiswa', 'iat' => $now, 'exp' => $now + 3600,
            'sub' => $u['id'], 'username' => $u['username'],
            'role' => $u['role'], 'nim' => $u['nim'],
        ], env('JWT_SECRET'), 'HS256');

        // Mahasiswa yang masih memakai password awal (tanggal lahir DDMMYYYY)
        // diberi tanda, supaya aplikasi bisa mengingatkan untuk menggantinya.
        $passwordAwal = false;
        if ($u['role'] === 'mahasiswa' && $u['nim']) {
            $tgl = $db->query('SELECT tanggal_lahir FROM akademik.mahasiswa WHERE nim = ?', [$u['nim']])->getRowArray();
            $passwordAwal = $tgl && hash_equals(date('dmY', strtotime($tgl['tanggal_lahir'])), (string) $in['password']);
        }

        return $this->sukses([
            'token'         => $token,
            'token_type'    => 'Bearer',
            'expires_in'    => 3600,
            'role'          => $u['role'],
            'password_awal' => $passwordAwal,
        ], 'Login berhasil');
    }
}
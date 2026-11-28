<?php

namespace App\Controllers\Api;

class Akun extends BaseApi
{
    // PUT /api/v1/akun/password
    // Body: {"password_lama": "...", "password_baru": "...", "konfirmasi_password": "..."}
    public function gantiPassword()
    {
        $u = $this->pengguna();
        if (! $u || empty($u->sub)) {
            return $this->gagal('Token tidak valid', 401);
        }

        $in    = $this->request->getJSON(true) ?? [];
        $rules = [
            'password_lama'       => 'required|max_length[100]',
            'password_baru'       => 'required|min_length[8]|max_length[100]',
            'konfirmasi_password' => 'required|matches[password_baru]',
        ];
        $pesan = [
            'password_baru'       => ['min_length' => 'Password baru minimal 8 karakter'],
            'konfirmasi_password' => ['matches' => 'Konfirmasi password tidak sama dengan password baru'],
        ];
        if (! $this->validateData($in, $rules, $pesan)) {
            return $this->gagal('Data tidak valid', 422, $this->validator->getErrors());
        }
        if ($in['password_baru'] === $in['password_lama']) {
            return $this->gagal('Data tidak valid', 422, ['password_baru' => 'Password baru harus berbeda dari password lama']);
        }

        try {
            $db  = \Config\Database::connect();
            $row = $db->query(
                'SELECT id, password_hash FROM akademik.users WHERE id = ? AND is_active = TRUE',
                [(int) $u->sub]
            )->getRowArray();
            if (! $row) {
                return $this->gagal('Akun tidak ditemukan atau tidak aktif', 401);
            }
            if (! password_verify($in['password_lama'], $row['password_hash'])) {
                return $this->gagal('Data tidak valid', 422, ['password_lama' => 'Password lama salah']);
            }

            $db->query(
                'UPDATE akademik.users SET password_hash = ? WHERE id = ?',
                [password_hash($in['password_baru'], PASSWORD_DEFAULT), $row['id']]
            );

            return $this->sukses(null, 'Password berhasil diganti');
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }
}

<?php

namespace App\Controllers\Api;

/**
 * Profil milik mahasiswa yang sedang login (dipakai Portal Mahasiswa / App 2).
 * NIM selalu diambil dari token, bukan dari URL, sehingga mahasiswa
 * tidak mungkin membaca atau mengubah data orang lain.
 */
class Profil extends Mahasiswa
{
    // Data yang boleh diubah sendiri oleh mahasiswa.
    // Data akademik & identitas (nama, NIM, kelas, status, email, tanggal lahir,
    // agama, alamat KTP, orang tua) tetap hanya bisa diubah admin/operator.
    private const BOLEH_DIUBAH_MAHASISWA = [
        'no_telepon', 'cita_cita', 'alamat_domisili',
        'keahlian', 'minat_bakat', 'bahasa', 'hobi', 'makanan_favorit', 'genre_musik',
    ];

    // GET /api/v1/profil
    public function saya()
    {
        $nim = $this->nimLogin();
        if ($nim === null) {
            return $this->gagal('Akun ini tidak terhubung dengan data mahasiswa', 403);
        }
        $row = $this->ambil($nim);
        if (! $row) {
            return $this->gagal('Data mahasiswa untuk akun ini tidak ditemukan', 404);
        }

        return $this->sukses($row);
    }

    // PUT /api/v1/profil   (wajib kirim "version")
    public function ubah()
    {
        $nim = $this->nimLogin();
        if ($nim === null) {
            return $this->gagal('Akun ini tidak terhubung dengan data mahasiswa', 403);
        }
        $data = $this->body();
        if ($data === null) {
            return $this->gagal('Body JSON kosong atau tidak valid', 400);
        }

        $dilarang = array_diff(array_keys($data), array_merge(self::BOLEH_DIUBAH_MAHASISWA, ['version']));
        if ($dilarang) {
            return $this->gagal(
                'Ada data yang hanya bisa diubah oleh admin',
                422,
                array_fill_keys(array_values($dilarang), 'Field ini hanya bisa diubah oleh admin/operator')
            );
        }

        return $this->prosesUbah($nim, $data);
    }

    private function nimLogin(): ?string
    {
        $nim = (string) ($this->pengguna()->nim ?? '');

        return $this->nimValid($nim) ? $nim : null;
    }
}

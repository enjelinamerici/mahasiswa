<?php

namespace App\Controllers\Api;

class Kelas extends BaseApi
{
    // GET /api/v1/kelas
    public function index()
    {
        $rows = \Config\Database::connect()
            ->query('SELECT id, kode, tingkat, golongan FROM akademik.kelas ORDER BY tingkat, golongan')
            ->getResultArray();

        return $this->sukses($rows);
    }

    // GET /api/v1/kelas/{id}/mahasiswa
    public function mahasiswa($id = null)
    {
        $db = \Config\Database::connect();
        if (! $db->query('SELECT 1 FROM akademik.kelas WHERE id = ?', [(int) $id])->getRowArray()) {
            return $this->gagal('Kelas tidak ditemukan', 404);
        }

        // Role mahasiswa hanya boleh melihat daftar kelasnya sendiri
        $u = $this->pengguna();
        if ($u && $u->role === 'mahasiswa') {
            $milik = $db->query('SELECT kelas_id FROM akademik.mahasiswa WHERE nim = ?', [(string) ($u->nim ?? '')])->getRowArray();
            if (! $milik || (int) $milik['kelas_id'] !== (int) $id) {
                return $this->gagal('Anda hanya boleh melihat daftar kelas sendiri', 403);
            }
        }

        $rows = $db->query(
            'SELECT p.* FROM akademik.v_mahasiswa_publik p
               JOIN akademik.kelas k ON k.kode = p.kelas
              WHERE k.id = ? ORDER BY p.nim',
            [(int) $id]
        )->getResultArray();

        return $this->sukses($rows);
    }
}
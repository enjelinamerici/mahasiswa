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

        $rows = $db->query(
            'SELECT p.* FROM akademik.v_mahasiswa_publik p
               JOIN akademik.kelas k ON k.kode = p.kelas
              WHERE k.id = ? ORDER BY p.nim',
            [(int) $id]
        )->getResultArray();

        return $this->sukses($rows);
    }
}
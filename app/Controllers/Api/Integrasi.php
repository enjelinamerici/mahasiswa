<?php

namespace App\Controllers\Api;

/**
 * Endpoint untuk kelompok lain (role "service").
 * Semua data diambil dari VIEW publik saja, sehingga data pribadi
 * (alamat, telepon, tanggal lahir, agama, suku, orang tua) tidak pernah keluar.
 */
class Integrasi extends BaseApi
{
    // Pakai user database app_integrasi jika sudah diisi di .env,
    // kalau belum, pakai koneksi default.
    private function db()
    {
        return env('database.integrasi.username')
            ? \Config\Database::connect('integrasi')
            : \Config\Database::connect();
    }

    // GET /api/v1/integrasi/kelas
    public function kelas()
    {
        try {
            $rows = $this->db()->query(
                'SELECT kelas_id, kelas, jumlah_aktif
                   FROM akademik.v_rekap_per_kelas
                  ORDER BY kelas'
            )->getResultArray();

            return $this->sukses($rows);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // GET /api/v1/integrasi/mahasiswa?kelas=TRPL 5A&angkatan=2024&status=Aktif&limit=50&page=1
    public function mahasiswa()
    {
        $limit = min(max((int) ($this->request->getGet('limit') ?? 50), 1), 200);
        $page  = max((int) ($this->request->getGet('page') ?? 1), 1);

        $where = [];
        $param = [];
        if ($kelas = $this->request->getGet('kelas')) {
                    if ($nama = trim((string) $this->request->getGet('nama'))) {
           
            $where[] = 'nama ILIKE ?';
            $param[] = '%' . addcslashes($nama, '%_\\') . '%';
        }
            $where[] = 'kelas = ?';
            $param[] = $kelas;
        }
        if ($angkatan = $this->request->getGet('angkatan')) {
            if (! ctype_digit((string) $angkatan)) {
                return $this->gagal('angkatan harus angka', 422);
            }
            $where[] = 'angkatan = ?';
            $param[] = (int) $angkatan;
        }
        if ($status = $this->request->getGet('status')) {
            $where[] = 'status_akademik = ?';
            $param[] = $status;
        }
        $sqlWhere = $where ? 'WHERE ' . implode(' AND ', $where) : '';

        try {
            $db    = $this->db();
            $total = (int) $db->query(
                "SELECT COUNT(*) AS n FROM akademik.v_mahasiswa_publik $sqlWhere",
                $param
            )->getRow()->n;

            $rows = $db->query(
                "SELECT * FROM akademik.v_mahasiswa_publik $sqlWhere ORDER BY nim LIMIT ? OFFSET ?",
                array_merge($param, [$limit, ($page - 1) * $limit])
            )->getResultArray();

            return $this->sukses(['items' => $rows, 'total' => $total, 'page' => $page, 'limit' => $limit]);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // GET /api/v1/integrasi/mahasiswa/{nim}
    public function show($nim = null)
    {
        if (! is_string($nim) || ! preg_match('/^\d{10}$/', $nim)) {
            return $this->gagal('NIM harus 10 digit angka', 422);
        }
        try {
            $row = $this->db()
                ->query('SELECT * FROM akademik.v_mahasiswa_publik WHERE nim = ?', [$nim])
                ->getRowArray();
            if (! $row) {
                return $this->gagal('Mahasiswa tidak ditemukan', 404);
            }
            return $this->sukses($row);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // GET /api/v1/integrasi/rekap
    public function rekap()
    {
        try {
            $rows = $this->db()
                ->query('SELECT * FROM akademik.v_rekap_per_kelas ORDER BY kelas')
                ->getResultArray();

            return $this->sukses($rows);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }
}
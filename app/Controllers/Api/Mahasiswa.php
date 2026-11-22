<?php

namespace App\Controllers\Api;

class Mahasiswa extends BaseApi
{
    private const WAJIB = [
        'nim', 'nama', 'jenis_kelamin', 'email', 'kelas_id', 'angkatan',
        'status_akademik', 'tempat_lahir', 'tanggal_lahir', 'agama_id',
    ];

    private const ATURAN = [
        'nim'             => 'regex_match[/^\d{10}$/]',
        'nama'            => 'max_length[100]',
        'jenis_kelamin'   => 'in_list[L,P]',
        'email'           => 'regex_match[/^\S+@\S+\.\S+$/]|max_length[100]',
        'kelas_id'        => 'is_natural_no_zero',        
        'angkatan'        => 'is_natural_no_zero',
        'status_akademik' => 'max_length[30]',
        'tempat_lahir'    => 'max_length[100]',
        'tanggal_lahir'   => 'valid_date[Y-m-d]',
        'agama_id'        => 'is_natural_no_zero',
        'suku_id'         => 'permit_empty|is_natural_no_zero',
        'no_telepon'      => 'permit_empty|max_length[20]',
        'cita_cita'       => 'permit_empty|max_length[100]',
    ];

    private const BOLEH_UBAH = [
        'nama', 'jenis_kelamin', 'email', 'kelas_id', 'angkatan', 'status_akademik',
        'tempat_lahir', 'tanggal_lahir', 'agama_id', 'suku_id', 'no_telepon', 'cita_cita',
    ];

    // GET /api/v1/mahasiswa?limit=10&page=1&kelas=TRPL 1A
    public function index()
    {
        $limit  = min(max((int) ($this->request->getGet('limit') ?? 10), 1), 100);
        $page   = max((int) ($this->request->getGet('page') ?? 1), 1);
        $kelas  = $this->request->getGet('kelas');
        $db     = \Config\Database::connect();

        $where  = '';
        $param  = [];
        if ($kelas) {
            $where   = 'WHERE kelas = ?';
            $param[] = $kelas;
        }

        $total = (int) $db->query("SELECT COUNT(*) AS n FROM akademik.v_mahasiswa_publik $where", $param)->getRow()->n;
        $rows  = $db->query(
            "SELECT * FROM akademik.v_mahasiswa_publik $where ORDER BY nim LIMIT ? OFFSET ?",
            array_merge($param, [$limit, ($page - 1) * $limit])
        )->getResultArray();

        return $this->sukses(['items' => $rows, 'total' => $total, 'page' => $page, 'limit' => $limit]);
    }

    // GET /api/v1/mahasiswa/{nim}
    public function show($nim = null)
    {
        if (! $this->nimValid($nim)) {
            return $this->gagal('NIM harus 10 digit angka', 422);
        }
        $row = $this->ambil($nim);
        if (! $row) {
            return $this->gagal('Mahasiswa tidak ditemukan', 404);
        }
        return $this->sukses($row);
    }

    // POST /api/v1/mahasiswa
    public function create()
    {
        $data = $this->body();
        if ($data === null) {
            return $this->gagal('Body JSON kosong atau tidak valid', 400);
        }

        $rules = [];
        foreach (self::ATURAN as $k => $r) {
            $rules[$k] = (in_array($k, self::WAJIB, true) ? 'required|' : '') . $r;
        }
        $v = \Config\Services::validation();
        $v->setRules($rules);
        if (! $v->run($data)) {
            return $this->gagal('Data tidak valid', 422, $v->getErrors());
        }

        try {
            $db = \Config\Database::connect();
            if ($db->query('SELECT 1 FROM akademik.mahasiswa WHERE nim = ?', [$data['nim']])->getRowArray()) {
                return $this->gagal('NIM sudah terdaftar', 409);
            }

            $kolom = array_merge(['nim'], self::BOLEH_UBAH);
            $cols  = [];
            $vals  = [];
            foreach ($kolom as $k) {
                if (array_key_exists($k, $data)) {
                    $cols[] = $k;
                    $vals[] = $data[$k] === '' ? null : $data[$k];
                }
            }
            $holder = implode(', ', array_fill(0, count($cols), '?'));
            $db->query('INSERT INTO akademik.mahasiswa (' . implode(', ', $cols) . ") VALUES ($holder)", $vals);

            return $this->sukses($this->ambil($data['nim']), 'Mahasiswa berhasil ditambahkan', 201);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // PUT /api/v1/mahasiswa/{nim}   (wajib kirim "version")
    public function update($nim = null)
    {
        if (! $this->nimValid($nim)) {
            return $this->gagal('NIM harus 10 digit angka', 422);
        }
        $data = $this->body();
        if ($data === null) {
            return $this->gagal('Body JSON kosong atau tidak valid', 400);
        }

        $rules = ['version' => 'required|is_natural_no_zero'];
        foreach (self::BOLEH_UBAH as $k) {
            $rules[$k] = 'if_exist|' . str_replace('permit_empty|', '', self::ATURAN[$k]);
        }
        $v = \Config\Services::validation();
        $v->setRules($rules);
        if (! $v->run($data)) {
            return $this->gagal('Data tidak valid', 422, $v->getErrors());
        }

        $set = [];
        $val = [];
        foreach (self::BOLEH_UBAH as $k) {
            if (array_key_exists($k, $data)) {
                $set[] = "$k = ?";
                $val[] = $data[$k] === '' ? null : $data[$k];
            }
        }
        if (! $set) {
            return $this->gagal('Tidak ada field yang diubah', 400);
        }
        $set[] = 'updated_at = now()';
        $val[] = $nim;
        $val[] = (int) $data['version'];

        try {
            $db = \Config\Database::connect();
            $db->query('UPDATE akademik.mahasiswa SET ' . implode(', ', $set) . ' WHERE nim = ? AND version = ?', $val);

            if ($db->affectedRows() === 0) {
                if (! $this->ambil($nim)) {
                    return $this->gagal('Mahasiswa tidak ditemukan', 404);
                }
                return $this->gagal('Data sudah diubah pengguna lain, muat ulang lalu coba lagi', 409);
            }
            return $this->sukses($this->ambil($nim), 'Mahasiswa berhasil diubah');
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // PATCH /api/v1/mahasiswa/{nim}/kelas
    public function pindahKelas($nim = null)
    {
        if (! $this->nimValid($nim)) {
            return $this->gagal('NIM harus 10 digit angka', 422);
        }
        $data = $this->body();
        $v = \Config\Services::validation();
        $v->setRules(['kelas_id' => 'required|is_natural_no_zero']);
        if ($data === null || ! $v->run($data)) {
            return $this->gagal('Data tidak valid', 422, $v->getErrors() ?: ['kelas_id' => 'kelas_id wajib diisi']);
        }

        try {
            $db = \Config\Database::connect();
            if (! $db->query('SELECT 1 FROM akademik.kelas WHERE id = ?', [(int) $data['kelas_id']])->getRowArray()) {
                return $this->gagal('Kelas tidak ditemukan', 404);
            }
            $db->query('UPDATE akademik.mahasiswa SET kelas_id = ?, updated_at = now() WHERE nim = ?', [(int) $data['kelas_id'], $nim]);
            if ($db->affectedRows() === 0) {
                return $this->gagal('Mahasiswa tidak ditemukan', 404);
            }
            return $this->sukses($this->ambil($nim), 'Kelas mahasiswa berhasil dipindah');
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // DELETE /api/v1/mahasiswa/{nim}   (admin saja)
    public function delete($nim = null)
    {
        if (! $this->nimValid($nim)) {
            return $this->gagal('NIM harus 10 digit angka', 422);
        }
        try {
            $db = \Config\Database::connect();
            $db->query('DELETE FROM akademik.mahasiswa WHERE nim = ?', [$nim]);
            if ($db->affectedRows() === 0) {
                return $this->gagal('Mahasiswa tidak ditemukan', 404);
            }
            return $this->sukses(null, 'Mahasiswa berhasil dihapus');
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // ---- pembantu ----
    private function nimValid($nim): bool
    {
        return is_string($nim) && preg_match('/^\d{10}$/', $nim) === 1;
    }

    private function body(): ?array
    {
        $json = $this->request->getJSON(true);
        return is_array($json) ? $json : null;
    }

    private function ambil(string $nim): ?array
    {
        return \Config\Database::connect()
            ->query('SELECT * FROM akademik.v_mahasiswa_detail WHERE nim = ?', [$nim])
            ->getRowArray();
    }
}
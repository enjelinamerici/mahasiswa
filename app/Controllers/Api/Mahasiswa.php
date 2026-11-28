<?php

namespace App\Controllers\Api;

class Mahasiswa extends BaseApi
{
    protected const WAJIB = [
        'nim', 'nama', 'jenis_kelamin', 'email', 'kelas_id', 'angkatan',
        'status_akademik', 'tempat_lahir', 'tanggal_lahir', 'agama_id',
    ];

    protected const ATURAN = [
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

    protected const BOLEH_UBAH = [
        'nama', 'jenis_kelamin', 'email', 'kelas_id', 'angkatan', 'status_akademik',
        'tempat_lahir', 'tanggal_lahir', 'agama_id', 'suku_id', 'no_telepon', 'cita_cita',
    ];

    // Data turunan (tabel lain) yang ikut disimpan saat tambah / ubah.
    // Semuanya opsional; string kosong berarti "hapus / kosongkan".
    protected const ATURAN_TURUNAN = [
        'alamat_ktp'           => 'max_length[500]',
        'alamat_domisili'      => 'max_length[500]',
        'nama_orang_tua'       => 'max_length[100]',
        'no_telepon_orang_tua' => 'regex_match[/^\d{10,14}$/]',
        'alamat_orang_tua'     => 'max_length[500]',
    ];

    // Atribut banyak-nilai: field JSON => [tabel referensi, tabel penghubung, kolom FK]
    // Nilai boleh berupa array ["Membaca","Traveling"] atau teks "Membaca, Traveling".
    protected const DAFTAR = [
        'minat_bakat'     => ['minat_bakat', 'mahasiswa_minat_bakat', 'minat_bakat_id'],
        'keahlian'        => ['keahlian', 'mahasiswa_keahlian', 'keahlian_id'],
        'bahasa'          => ['bahasa', 'mahasiswa_bahasa', 'bahasa_id'],
        'hobi'            => ['hobi', 'mahasiswa_hobi', 'hobi_id'],
        'makanan_favorit' => ['makanan', 'mahasiswa_makanan', 'makanan_id'],
        'genre_musik'     => ['genre_musik', 'mahasiswa_genre_musik', 'genre_musik_id'],
    ];

    // GET /api/v1/mahasiswa?limit=10&page=1&kelas=TRPL 1A
    public function index()
    {
        $limit  = min(max((int) ($this->request->getGet('limit') ?? 10), 1), 100);
        $page   = max((int) ($this->request->getGet('page') ?? 1), 1);
        $kelas  = $this->request->getGet('kelas');
        $db     = \Config\Database::connect();

        // Role mahasiswa hanya boleh melihat teman sekelasnya sendiri
        // (filter kelas dari URL diabaikan, supaya tidak bisa mengintip kelas lain).
        $u = $this->pengguna();
        if ($u && $u->role === 'mahasiswa') {
            $kelas = $this->kelasMahasiswa($db, (string) ($u->nim ?? ''));
            if ($kelas === null) {
                return $this->sukses(['items' => [], 'total' => 0, 'page' => $page, 'limit' => $limit]);
            }
        }

        $where  = '';
        $param  = [];
        if ($kelas) {
            $where   = 'WHERE kelas = ?';
            $param[] = $kelas;
        }


        $total = (int) $db->query(
            "SELECT COUNT(*) AS n FROM akademik.v_mahasiswa_publik $where",
            $param
        )->getRow()->n;

        $rows = $db->query(
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

        // Role mahasiswa hanya boleh melihat detail dirinya sendiri
        $u = $this->pengguna();
        if ($u && $u->role === 'mahasiswa' && ($u->nim ?? null) !== $nim) {
            return $this->gagal('Anda hanya boleh melihat data diri sendiri', 403);
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
        foreach (static::ATURAN as $k => $r) {
            $rules[$k] = (in_array($k, static::WAJIB, true) ? 'required|' : '') . $r;
        }
        foreach (static::ATURAN_TURUNAN as $k => $r) {
            $rules[$k] = 'permit_empty|' . $r;
        }
        $v = \Config\Services::validation();
        $v->setRules($rules);
        if (! $v->run($data)) {
            return $this->gagal('Data tidak valid', 422, $v->getErrors());
        }
        $daftar = $this->bacaDaftar($data);
        if (isset($daftar['errors'])) {
            return $this->gagal('Data tidak valid', 422, $daftar['errors']);
        }

        $db = \Config\Database::connect();
        try {
            if ($db->query('SELECT 1 FROM akademik.mahasiswa WHERE nim = ?', [$data['nim']])->getRowArray()) {
                return $this->gagal('NIM sudah terdaftar', 409);
            }

            $kolom = array_merge(['nim'], static::BOLEH_UBAH);
            $cols  = [];
            $vals  = [];
            foreach ($kolom as $k) {
                if (array_key_exists($k, $data)) {
                    $cols[] = $k;
                    $vals[] = $data[$k] === '' ? null : $data[$k];
                }
            }
            $holder = implode(', ', array_fill(0, count($cols), '?'));

            // TRANSAKSI: mahasiswa + alamat + orang tua + atribut lain disimpan
            // sekaligus. Jika satu langkah gagal, SEMUA dibatalkan (rollback).
            $db->transException(true)->transBegin();
            $db->query('INSERT INTO akademik.mahasiswa (' . implode(', ', $cols) . ") VALUES ($holder)", $vals);
            $this->simpanTurunan($db, $data['nim'], $data, $daftar);
            $this->buatAkunMahasiswa($db, $data['nim'], (string) $data['tanggal_lahir']);
            $db->transCommit();

            return $this->sukses($this->ambil($data['nim']), 'Mahasiswa berhasil ditambahkan', 201);
        } catch (\DomainException $e) {
            $db->transRollback();
            return $this->gagal($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $db->transRollback();
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

        return $this->prosesUbah($nim, $data);
    }

    // Logika ubah data (dipakai juga oleh PUT /profil milik mahasiswa).
    protected function prosesUbah(string $nim, array $data)
    {
        $rules = ['version' => 'required|is_natural_no_zero'];
        foreach (static::BOLEH_UBAH as $k) {
            $rules[$k] = 'if_exist|' . str_replace('permit_empty|', '', static::ATURAN[$k]);
        }
        foreach (static::ATURAN_TURUNAN as $k => $r) {
            $rules[$k] = 'if_exist|permit_empty|' . $r;
        }
        $v = \Config\Services::validation();
        $v->setRules($rules);
        if (! $v->run($data)) {
            return $this->gagal('Data tidak valid', 422, $v->getErrors());
        }
        $daftar = $this->bacaDaftar($data);
        if (isset($daftar['errors'])) {
            return $this->gagal('Data tidak valid', 422, $daftar['errors']);
        }

        $set = [];
        $val = [];
        foreach (static::BOLEH_UBAH as $k) {
            if (array_key_exists($k, $data)) {
                $set[] = "$k = ?";
                $val[] = $data[$k] === '' ? null : $data[$k];
            }
        }
        $adaTurunan = $daftar || array_intersect_key($data, static::ATURAN_TURUNAN);
        if (! $set && ! $adaTurunan) {
            return $this->gagal('Tidak ada field yang diubah', 400);
        }
        // updated_at selalu disentuh, sehingga version naik (trigger) walau
        // yang diubah hanya data turunan -> optimistic locking tetap berlaku.
        $set[] = 'updated_at = now()';
        $val[] = $nim;
        $val[] = (int) $data['version'];

        $db = \Config\Database::connect();
        try {
            $db->transException(true)->transBegin();
            $db->query('UPDATE akademik.mahasiswa SET ' . implode(', ', $set) . ' WHERE nim = ? AND version = ?', $val);

            if ($db->affectedRows() === 0) {
                $db->transRollback();
                if (! $this->ambil($nim)) {
                    return $this->gagal('Mahasiswa tidak ditemukan', 404);
                }
                return $this->gagal('Data sudah diubah pengguna lain, muat ulang lalu coba lagi', 409);
            }
            $this->simpanTurunan($db, $nim, $data, $daftar);
            $db->transCommit();

            return $this->sukses($this->ambil($nim), 'Mahasiswa berhasil diubah');
        } catch (\DomainException $e) {
            $db->transRollback();
            return $this->gagal($e->getMessage(), 422);
        } catch (\Throwable $e) {
            $db->transRollback();
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
        $db = \Config\Database::connect();
        try {
            // Akun login mahasiswa ikut dinonaktifkan dalam transaksi yang sama
            $db->transException(true)->transBegin();
            $db->query('UPDATE akademik.users SET is_active = FALSE WHERE nim = ?', [$nim]);
            $db->query('DELETE FROM akademik.mahasiswa WHERE nim = ?', [$nim]);
            if ($db->affectedRows() === 0) {
                $db->transRollback();
                return $this->gagal('Mahasiswa tidak ditemukan', 404);
            }
            $db->transCommit();
            return $this->sukses(null, 'Mahasiswa berhasil dihapus');
        } catch (\Throwable $e) {
            $db->transRollback();
            return $this->errorDb($e);
        }
    }

    // ---- pembantu ----
protected function nimValid($nim): bool
{
    return is_string($nim) && preg_match('/^\d{10}$/', $nim) === 1;
}

protected function body(): ?array
{
    $json = $this->request->getJSON(true);
    return is_array($json) ? $json : null;
}

// Baca atribut banyak-nilai dari body. Hasil: ['hobi' => ['Membaca', ...], ...]
// hanya untuk field yang dikirim, atau ['errors' => [...]] jika formatnya salah.
protected function bacaDaftar(array $data): array
{
    $hasil  = [];
    $errors = [];
    foreach (array_keys(static::DAFTAR) as $k) {
        if (! array_key_exists($k, $data)) {
            continue;
        }
        $nilai = $data[$k];
        if ($nilai === null) {
            $nilai = [];
        } elseif (is_string($nilai)) {
            $nilai = explode(',', $nilai);
        }
        if (! is_array($nilai)) {
            $errors[$k] = "$k harus berupa daftar teks";
            continue;
        }
        $bersih = [];
        foreach ($nilai as $item) {
            if (! is_string($item)) {
                $errors[$k] = "$k harus berupa daftar teks";
                continue 2;
            }
            $item = trim(preg_replace('/\s+/', ' ', $item));
            if ($item !== '') {
                $bersih[mb_strtolower($item)] ??= $item; // buang duplikat (yang pertama dipakai)
            }
        }
        if (count($bersih) > 20) {
            $errors[$k] = "$k maksimal 20 item";
            continue;
        }
        $hasil[$k] = array_values($bersih);
    }
    return $errors ? ['errors' => $errors] : $hasil;
}

// Simpan alamat, orang tua, dan atribut banyak-nilai.
// Dipanggil DI DALAM transaksi; jika ada error, pemanggil melakukan rollback.
protected function simpanTurunan($db, string $nim, array $data, array $daftar): void
{
    // 1. Alamat KTP & domisili (satu baris per jenis)
    foreach (['alamat_ktp' => 'KTP', 'alamat_domisili' => 'DOMISILI'] as $k => $jenis) {
        if (! array_key_exists($k, $data)) {
            continue;
        }
        $alamat = trim((string) $data[$k]);
        if ($alamat === '') {
            $db->query('DELETE FROM akademik.alamat_mahasiswa WHERE nim = ? AND jenis = ?', [$nim, $jenis]);
        } else {
            $db->query(
                'INSERT INTO akademik.alamat_mahasiswa (nim, jenis, alamat) VALUES (?, ?, ?)
                 ON CONFLICT (nim, jenis) DO UPDATE SET alamat = EXCLUDED.alamat',
                [$nim, $jenis, $alamat]
            );
        }
    }

    // 2. Orang tua (baris pertama milik mahasiswa ini)
    $kolomOrtu = ['nama_orang_tua' => 'nama', 'no_telepon_orang_tua' => 'no_telepon', 'alamat_orang_tua' => 'alamat'];
    if (array_intersect_key($data, $kolomOrtu)) {
        $ortu = $db->query('SELECT id FROM akademik.orang_tua WHERE nim = ? ORDER BY id LIMIT 1', [$nim])->getRowArray();
        $nama = array_key_exists('nama_orang_tua', $data) ? trim((string) $data['nama_orang_tua']) : null;

        $isiLain = trim((string) ($data['no_telepon_orang_tua'] ?? '')) !== ''
                || trim((string) ($data['alamat_orang_tua'] ?? '')) !== '';

        if ($nama === '' && $isiLain) {
            throw new \DomainException('nama_orang_tua wajib diisi jika mengisi data orang tua');
        } elseif ($nama === '') {
            $db->query('DELETE FROM akademik.orang_tua WHERE nim = ?', [$nim]);
        } elseif ($ortu) {
            $set = [];
            $val = [];
            foreach ($kolomOrtu as $field => $kolom) {
                if (array_key_exists($field, $data)) {
                    $isi   = trim((string) $data[$field]);
                    $set[] = "$kolom = ?";
                    $val[] = $isi === '' ? null : $isi;
                }
            }
            $val[] = $ortu['id'];
            $db->query('UPDATE akademik.orang_tua SET ' . implode(', ', $set) . ' WHERE id = ?', $val);
        } elseif ($nama !== null) {
            $telp   = trim((string) ($data['no_telepon_orang_tua'] ?? ''));
            $alamat = trim((string) ($data['alamat_orang_tua'] ?? ''));
            $db->query(
                'INSERT INTO akademik.orang_tua (nim, nama, no_telepon, alamat) VALUES (?, ?, ?, ?)',
                [$nim, $nama, $telp === '' ? null : $telp, $alamat === '' ? null : $alamat]
            );
        } elseif ($isiLain) {
            throw new \DomainException('nama_orang_tua wajib diisi jika mengisi data orang tua');
        }
    }

    // 3. Atribut banyak-nilai: ganti seluruh isi untuk field yang dikirim
    foreach ($daftar as $k => $items) {
        [$tabelRef, $tabelHubung, $fk] = static::DAFTAR[$k];
        $db->query("DELETE FROM akademik.$tabelHubung WHERE nim = ?", [$nim]);
        foreach ($items as $nama) {
            $row = $db->query("SELECT id FROM akademik.$tabelRef WHERE lower(nama) = lower(?) LIMIT 1", [$nama])->getRowArray();
            $id  = $row ? $row['id']
                : $db->query("INSERT INTO akademik.$tabelRef (nama) VALUES (?) RETURNING id", [$nama])->getRowArray()['id'];
            $db->query("INSERT INTO akademik.$tabelHubung (nim, $fk) VALUES (?, ?)", [$nim, $id]);
        }
    }
}

// Kode kelas milik mahasiswa (cth "TRPL 5B"), atau null jika tidak ditemukan.
protected function kelasMahasiswa($db, string $nim): ?string
{
    $row = $db->query(
        'SELECT k.kode FROM akademik.mahasiswa m JOIN akademik.kelas k ON k.id = m.kelas_id WHERE m.nim = ?',
        [$nim]
    )->getRowArray();

    return $row['kode'] ?? null;
}

// Akun login untuk mahasiswa baru: username = NIM, password awal = tanggal lahir (DDMMYYYY).
// Jika NIM pernah dihapus lalu ditambah lagi, akun lamanya diaktifkan kembali.
protected function buatAkunMahasiswa($db, string $nim, string $tanggalLahir): void
{
    $passwordAwal = date('dmY', strtotime($tanggalLahir));
    $db->query(
        "INSERT INTO akademik.users (username, password_hash, role_id, nim)
         SELECT ?, ?, r.id, ? FROM akademik.roles r WHERE r.nama = 'mahasiswa'
         ON CONFLICT (username) DO UPDATE
            SET nim = EXCLUDED.nim, password_hash = EXCLUDED.password_hash, is_active = TRUE
          WHERE akademik.users.role_id = EXCLUDED.role_id",
        [$nim, password_hash($passwordAwal, PASSWORD_DEFAULT), $nim]
    );
}

protected function ambil(string $nim): ?array
{
    return \Config\Database::connect()
        ->query('SELECT * FROM akademik.v_mahasiswa_detail WHERE nim = ?', [$nim])
        ->getRowArray();
}
}
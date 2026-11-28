<?php

namespace App\Controllers\Api;

/**
 * Statistik mahasiswa untuk dashboard Web Admin (admin & operator).
 * Sumber: view akademik.v_profil_statistik (lihat database/09_statistik.sql)
 * dan tabel penghubung atribut banyak-nilai (hobi, minat, keahlian, dll).
 *
 * Filter opsional di semua endpoint: ?kelas=TRPL 5B&angkatan=2024
 */
class Statistik extends BaseApi
{
    // Kolom view yang boleh dihitung sebarannya (nama kolom = nama kategori)
    private const KOLOM = [
        'jenis_kelamin', 'kelas', 'angkatan', 'status_akademik', 'agama', 'suku',
        'kota_asal', 'kecamatan_asal', 'kota_domisili', 'cita_cita',
    ];

    // Kategori ya/tidak
    private const YA_TIDAK = ['merantau', 'tinggal_bersama_ortu'];

    // Atribut banyak-nilai: kategori => [tabel referensi, tabel penghubung, kolom FK]
    private const DAFTAR = [
        'hobi'            => ['hobi', 'mahasiswa_hobi', 'hobi_id'],
        'minat_bakat'     => ['minat_bakat', 'mahasiswa_minat_bakat', 'minat_bakat_id'],
        'keahlian'        => ['keahlian', 'mahasiswa_keahlian', 'keahlian_id'],
        'bahasa'          => ['bahasa', 'mahasiswa_bahasa', 'bahasa_id'],
        'makanan_favorit' => ['makanan', 'mahasiswa_makanan', 'makanan_id'],
        'genre_musik'     => ['genre_musik', 'mahasiswa_genre_musik', 'genre_musik_id'],
    ];

    private const BATAS_TERATAS = 10;

    // GET /api/v1/statistik
    public function index()
    {
        try {
            $db = \Config\Database::connect();
            [$where, $param] = $this->filter();

            $total = (int) $db->query("SELECT count(*) AS n FROM akademik.v_profil_statistik v $where", $param)->getRow()->n;
            $hasil = ['total' => $total, 'filter' => $this->nilaiFilter()];

            foreach (['jenis_kelamin', 'kelas', 'angkatan', 'status_akademik', 'agama', 'suku', 'kota_domisili'] as $k) {
                $hasil[$k] = $this->sebaran($db, $k, $where, $param, $total, null);
            }
            // asal daerah & cita-cita: tampilkan yang terbanyak
            $hasil['kota_asal'] = $this->sebaran($db, 'kota_asal', $where, $param, $total, self::BATAS_TERATAS);
            $hasil['cita_cita'] = $this->sebaran($db, 'cita_cita', $where, $param, $total, self::BATAS_TERATAS);

            foreach (self::YA_TIDAK as $k) {
                $hasil[$k] = $this->yaTidak($db, $k, $where, $param, $total);
            }
            foreach (array_keys(self::DAFTAR) as $k) {
                $hasil[$k] = $this->sebaranDaftar($db, $k, $where, $param, $total);
            }

            return $this->sukses($hasil);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // GET /api/v1/statistik/mahasiswa?kategori=kota_asal&nilai=Kota Medan
    // Daftar mahasiswa di balik satu angka statistik (dipakai saat grafik diklik).
    public function mahasiswa()
    {
        $kategori = (string) $this->request->getGet('kategori');
        $nilai    = trim((string) $this->request->getGet('nilai'));

        $dikenal = array_merge(self::KOLOM, self::YA_TIDAK, array_keys(self::DAFTAR));
        if (! in_array($kategori, $dikenal, true)) {
            return $this->gagal('Data tidak valid', 422, ['kategori' => 'Kategori tidak dikenal: ' . implode(', ', $dikenal)]);
        }
        if ($nilai === '') {
            return $this->gagal('Data tidak valid', 422, ['nilai' => 'nilai wajib diisi']);
        }

        try {
            $db = \Config\Database::connect();
            [$where, $param] = $this->filter();
            $syarat = $where ? [substr($where, 6)] : []; // buang "WHERE "

            if (in_array($kategori, self::YA_TIDAK, true)) {
                if (! in_array($nilai, ['ya', 'tidak'], true)) {
                    return $this->gagal('Data tidak valid', 422, ['nilai' => 'nilai harus "ya" atau "tidak"']);
                }
                $syarat[] = "v.$kategori IS " . ($nilai === 'ya' ? 'TRUE' : 'FALSE');
            } elseif (isset(self::DAFTAR[$kategori])) {
                [$ref, $hubung, $fk] = self::DAFTAR[$kategori];
                $syarat[] = "EXISTS (SELECT 1 FROM akademik.$hubung t JOIN akademik.$ref r ON r.id = t.$fk
                                     WHERE t.nim = v.nim AND lower(r.nama) = lower(?))";
                $param[]  = $nilai;
            } else {
                $syarat[] = "lower(v.$kategori::text) = lower(?)";
                $param[]  = $nilai;
            }

            $rows = $db->query(
                'SELECT v.nim, v.nama, v.jenis_kelamin, v.kelas, v.angkatan, v.kota_asal, v.kota_domisili, v.cita_cita
                   FROM akademik.v_profil_statistik v
                  WHERE ' . implode(' AND ', $syarat) . '
                  ORDER BY v.nama',
                $param
            )->getResultArray();

            return $this->sukses(['kategori' => $kategori, 'nilai' => $nilai, 'jumlah' => count($rows), 'items' => $rows]);
        } catch (\Throwable $e) {
            return $this->errorDb($e);
        }
    }

    // ---------- pembantu ----------

    private function nilaiFilter(): array
    {
        $angkatan = $this->request->getGet('angkatan');

        return [
            'kelas'    => trim((string) $this->request->getGet('kelas')) ?: null,
            'angkatan' => ctype_digit((string) $angkatan) ? (int) $angkatan : null,
        ];
    }

    private function filter(): array
    {
        $f      = $this->nilaiFilter();
        $where  = [];
        $param  = [];
        if ($f['kelas'] !== null) {
            $where[] = 'v.kelas = ?';
            $param[] = $f['kelas'];
        }
        if ($f['angkatan'] !== null) {
            $where[] = 'v.angkatan = ?';
            $param[] = $f['angkatan'];
        }

        return [$where ? 'WHERE ' . implode(' AND ', $where) : '', $param];
    }

    private static function persen(int $jumlah, int $total): float
    {
        return $total > 0 ? round($jumlah * 100 / $total, 1) : 0.0;
    }

    // Sebaran satu kolom: [{label, jumlah, persen}], plus jumlah yang belum diisi
    private function sebaran($db, string $kolom, string $where, array $param, int $total, ?int $batas): array
    {
        $tambahan = ($where ? "$where AND" : 'WHERE') . " v.$kolom IS NOT NULL";
        // cita-cita dikelompokkan tanpa membedakan huruf besar-kecil
        $kunci = $kolom === 'cita_cita' ? 'lower(v.cita_cita)' : "v.$kolom";
        $label = $kolom === 'cita_cita' ? 'min(v.cita_cita)' : "v.$kolom";
        $sql   = "SELECT $label AS label, count(*) AS jumlah FROM akademik.v_profil_statistik v
                  $tambahan GROUP BY $kunci ORDER BY jumlah DESC, label";
        $rows  = $db->query($sql, $param)->getResultArray();

        $isi = array_map(static fn ($r) => [
            'label'  => (string) $r['label'],
            'jumlah' => (int) $r['jumlah'],
            'persen' => self::persen((int) $r['jumlah'], $total),
        ], $rows);
        $terisi = array_sum(array_column($isi, 'jumlah'));

        return [
            'data'        => $batas ? array_slice($isi, 0, $batas) : $isi,
            'jumlah_jenis' => count($isi),
            'tidak_diisi' => $total - $terisi,
        ];
    }

    private function yaTidak($db, string $kolom, string $where, array $param, int $total): array
    {
        $r = $db->query(
            "SELECT count(*) FILTER (WHERE v.$kolom IS TRUE) AS ya,
                    count(*) FILTER (WHERE v.$kolom IS FALSE) AS tidak
               FROM akademik.v_profil_statistik v $where",
            $param
        )->getRowArray();
        $ya    = (int) $r['ya'];
        $tidak = (int) $r['tidak'];

        return [
            'ya'            => $ya,
            'tidak'         => $tidak,
            'tidak_diketahui' => $total - $ya - $tidak,
            'persen_ya'     => self::persen($ya, $total),
            'persen_tidak'  => self::persen($tidak, $total),
        ];
    }

    private function sebaranDaftar($db, string $kategori, string $where, array $param, int $total): array
    {
        [$ref, $hubung, $fk] = self::DAFTAR[$kategori];
        $rows = $db->query(
            "SELECT r.nama AS label, count(DISTINCT t.nim) AS jumlah
               FROM akademik.$hubung t
               JOIN akademik.$ref r ON r.id = t.$fk
               JOIN akademik.v_profil_statistik v ON v.nim = t.nim
              $where
              GROUP BY r.nama ORDER BY jumlah DESC, r.nama LIMIT " . self::BATAS_TERATAS,
            $param
        )->getResultArray();

        return ['data' => array_map(static fn ($r) => [
            'label'  => (string) $r['label'],
            'jumlah' => (int) $r['jumlah'],
            'persen' => self::persen((int) $r['jumlah'], $total),
        ], $rows)];
    }
}

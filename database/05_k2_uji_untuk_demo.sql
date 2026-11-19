-- =====================================================================
-- K2 (bagian 3): SKRIP UJI / BAHAN DEMO
-- Tiap bagian menyebut user mana yang menjalankannya dan hasil yang diharapkan.
-- Di Neon SQL Editor, jalankan per bagian. Untuk berganti user, pakai
-- "SET ROLE app_api;" lalu "RESET ROLE;" (hanya bisa oleh pemilik database).
-- Semua pengujian memakai transaksi + ROLLBACK, jadi data asli tidak berubah.
-- =====================================================================
SET search_path = akademik;

-- ---------------------------------------------------------------------
-- 1. LEAST PRIVILEGE  (checklist demo: user dibedakan per aplikasi)
-- ---------------------------------------------------------------------
BEGIN;
SET LOCAL ROLE app_integrasi;
SELECT count(*) AS dari_view_publik FROM v_mahasiswa_publik;     -- BERHASIL: 470
SELECT * FROM v_rekap_per_kelas ORDER BY kelas LIMIT 3;           -- BERHASIL
-- Baris di bawah harus ERROR "permission denied for table mahasiswa":
-- SELECT * FROM mahasiswa LIMIT 1;
-- SELECT * FROM orang_tua LIMIT 1;
ROLLBACK;

BEGIN;
SET LOCAL ROLE app_api;
SELECT count(*) AS mahasiswa_dibaca_api FROM mahasiswa;           -- BERHASIL: 470
-- Baris di bawah harus ERROR "permission denied for table audit_log"
-- (log hanya bisa ditulis trigger, tidak bisa dipalsukan aplikasi):
-- DELETE FROM audit_log;
-- DROP TABLE mahasiswa;           -- ERROR: must be owner
ROLLBACK;

-- ---------------------------------------------------------------------
-- 2. TRANSAKSI ATOMIK  (checklist: transaksi gagal di tengah di-rollback)
--    Sengaja gagal di langkah ke-3: nama agama salah.
--    Hasil: mahasiswa TIDAK tersimpan setengah-setengah.
-- ---------------------------------------------------------------------
-- (a) Gagal -> harus ERROR, lalu cek bahwa data tidak ada:
-- CALL sp_tambah_mahasiswa('2605189999','UJI ROLLBACK','L','ujirollback@students.polmed.ac.id',
--      'TRPL 1A', 2026::smallint, 'Medan', DATE '2008-01-01', 'AGAMA SALAH',
--      'Jl. Contoh No. 1', 'ORTU UJI', '081200000000');
-- SELECT count(*) FROM mahasiswa WHERE nim = '2605189999';       -- 0

-- (b) Berhasil -> mahasiswa + alamat KTP + orang tua tersimpan bersamaan:
BEGIN;
CALL sp_tambah_mahasiswa('2605189999','UJI TRANSAKSI','L','ujitransaksi@students.polmed.ac.id',
     'TRPL 1A', 2026::smallint, 'Medan', DATE '2008-01-01', 'Islam',
     'Jl. Contoh No. 1', 'ORTU UJI', '081200000000');
SELECT (SELECT count(*) FROM mahasiswa        WHERE nim='2605189999') AS mhs,
       (SELECT count(*) FROM alamat_mahasiswa WHERE nim='2605189999') AS alamat,
       (SELECT count(*) FROM orang_tua        WHERE nim='2605189999') AS ortu;   -- 1 | 1 | 1
ROLLBACK;

-- ---------------------------------------------------------------------
-- 3. KONKURENSI / OPTIMISTIC LOCKING  (K7: dua user ubah data yang sama)
-- ---------------------------------------------------------------------
BEGIN;
SELECT nim, kelas, version FROM v_mahasiswa_detail WHERE nim = '2605181121';   -- versi saat dibaca
CALL sp_pindah_kelas('2605181121', 'TRPL 1B', 1);       -- BERHASIL (versi cocok)
SELECT nim, kelas, version FROM v_mahasiswa_detail WHERE nim = '2605181121';   -- versi naik jadi 2
-- Orang kedua masih memegang versi lama (1) -> harus ERROR SQLSTATE 40001:
-- CALL sp_pindah_kelas('2605181121', 'TRPL 1C', 1);
ROLLBACK;

-- ---------------------------------------------------------------------
-- 4. TRIGGER AUDIT  (checklist: trigger terpakai dalam alur aplikasi)
-- ---------------------------------------------------------------------
BEGIN;
UPDATE mahasiswa SET cita_cita = 'Uji Audit' WHERE nim = '2605181121';
SELECT aksi, kunci, data_lama->>'cita_cita' AS lama, data_baru->>'cita_cita' AS baru, user_db
FROM audit_log WHERE kunci = '2605181121' ORDER BY id DESC LIMIT 1;   -- UPDATE | ... | Uji Audit
ROLLBACK;

-- ---------------------------------------------------------------------
-- 5. FUNCTION & VIEW
-- ---------------------------------------------------------------------
SELECT fn_jumlah_mahasiswa_kelas('TRPL 1A') AS jumlah_1a;               -- 28
SELECT nim, nama, fn_umur(tanggal_lahir) AS umur FROM mahasiswa LIMIT 3;
SELECT * FROM v_rekap_per_kelas ORDER BY kelas;

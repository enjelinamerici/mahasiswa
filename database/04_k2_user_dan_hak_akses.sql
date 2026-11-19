-- =====================================================================
-- K2 (bagian 2): USER DATABASE & HAK AKSES (least privilege)
-- Jalankan SETELAH 03_k2_objek_database.sql, oleh pemilik database.
--
-- !!! GANTI password di bawah sebelum dijalankan, dan JANGAN commit
-- !!! file yang sudah berisi password asli ke GitHub.
--
-- Prinsip: tiap aplikasi memakai user sendiri dengan hak SEKECIL mungkin.
--   neondb_owner   : pemilik, hanya untuk migrasi/skema (tidak dipakai aplikasi)
--   app_api        : dipakai Web API utama (CRUD data mahasiswa)
--   app_integrasi  : dipakai endpoint untuk kelompok lain (HANYA baca view aman)
-- =====================================================================

SET search_path = akademik;

-- ---- 1. Buat user (login) -------------------------------------------
-- (aman dijalankan ulang: jika user sudah ada, hanya password yang diperbarui)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
        CREATE ROLE app_api LOGIN PASSWORD 'GANTI_PASSWORD_API';
    ELSE
        ALTER ROLE app_api PASSWORD 'GANTI_PASSWORD_API';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_integrasi') THEN
        CREATE ROLE app_integrasi LOGIN PASSWORD 'GANTI_PASSWORD_INTEGRASI';
    ELSE
        ALTER ROLE app_integrasi PASSWORD 'GANTI_PASSWORD_INTEGRASI';
    END IF;
END $$;

-- search_path otomatis, jadi query tidak perlu menulis "akademik."
ALTER ROLE app_api       SET search_path = akademik, public;
ALTER ROLE app_integrasi SET search_path = akademik, public;

-- ---- 2. Cabut hak bawaan, beri hak secara eksplisit ----------------
REVOKE ALL ON SCHEMA akademik FROM PUBLIC;
REVOKE ALL ON ALL TABLES    IN SCHEMA akademik FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA akademik FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA akademik FROM PUBLIC;
REVOKE ALL ON ALL PROCEDURES IN SCHEMA akademik FROM PUBLIC;

-- ---- 3. app_api: kelola data mahasiswa ------------------------------
GRANT USAGE ON SCHEMA akademik TO app_api;

-- tabel data: baca + tulis penuh
GRANT SELECT, INSERT, UPDATE, DELETE ON
    mahasiswa, alamat_mahasiswa, orang_tua,
    mahasiswa_minat_bakat, mahasiswa_hobi, mahasiswa_makanan,
    mahasiswa_bahasa, mahasiswa_genre_musik, mahasiswa_keahlian
TO app_api;

-- tabel referensi: baca + tambah (tanpa ubah/hapus)
GRANT SELECT, INSERT ON
    kelas, agama, suku, minat_bakat, hobi, makanan, bahasa, genre_musik, keahlian, roles
TO app_api;

-- akun login API: baca + tambah + ubah (tanpa hapus massal)
GRANT SELECT, INSERT, UPDATE ON users TO app_api;

-- audit_log: HANYA baca. Penulisan dilakukan trigger (SECURITY DEFINER)
GRANT SELECT ON audit_log TO app_api;

-- view dan objek lain
GRANT SELECT ON v_mahasiswa_publik, v_rekap_per_kelas, v_mahasiswa_detail TO app_api;
GRANT EXECUTE ON FUNCTION fn_jumlah_mahasiswa_kelas(TEXT), fn_umur(DATE) TO app_api;
GRANT EXECUTE ON PROCEDURE sp_tambah_mahasiswa(CHAR, VARCHAR, CHAR, VARCHAR, VARCHAR, SMALLINT,
                                               VARCHAR, DATE, VARCHAR, TEXT, VARCHAR, VARCHAR) TO app_api;
GRANT EXECUTE ON PROCEDURE sp_pindah_kelas(CHAR, VARCHAR, INTEGER) TO app_api;

-- sequence (agar INSERT dengan id otomatis berjalan)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA akademik TO app_api;

-- ---- 4. app_integrasi: hanya baca data yang aman -------------------
GRANT USAGE ON SCHEMA akademik TO app_integrasi;
GRANT SELECT ON v_mahasiswa_publik, v_rekap_per_kelas TO app_integrasi;
-- Sengaja TIDAK ada hak ke tabel mahasiswa, alamat_mahasiswa, orang_tua, users, dll.
-- View berjalan dengan hak pemilik, sehingga user ini tetap bisa membacanya.

-- ---- 5. Objek yang dibuat di masa depan tidak otomatis terbuka ------
ALTER DEFAULT PRIVILEGES IN SCHEMA akademik REVOKE ALL ON TABLES FROM PUBLIC;

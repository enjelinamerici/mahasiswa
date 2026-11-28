-- =====================================================================
-- AKUN LOGIN MAHASISWA (role "mahasiswa") untuk Portal Mahasiswa (App 2)
-- Username = NIM, password awal = tanggal lahir (DDMMYYYY, cth 15052005).
-- Mahasiswa diingatkan untuk mengganti password setelah login pertama.
-- Mahasiswa yang ditambah lewat API setelah ini otomatis dibuatkan akun.
-- Jalankan oleh pemilik database (neondb_owner), SETELAH data mahasiswa diimpor.
-- Aman dijalankan ulang: mahasiswa yang sudah punya akun dilewati.
-- =====================================================================
SET search_path = akademik, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (username, password_hash, role_id, nim)
SELECT m.nim,
       crypt(to_char(m.tanggal_lahir, 'DDMMYYYY'), gen_salt('bf', 10)),
       r.id,
       m.nim
FROM mahasiswa m
JOIN roles r ON r.nama = 'mahasiswa'
ON CONFLICT (username) DO NOTHING;

-- Cek jumlah akun mahasiswa
SELECT count(*) AS jumlah_akun_mahasiswa
FROM users u JOIN roles r ON r.id = u.role_id
WHERE r.nama = 'mahasiswa';

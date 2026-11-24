-- =====================================================================
-- AKUN LOGIN API (admin, operator, dan role "service" untuk kelompok lain)
-- Jalankan SETELAH 01_schema.sql, oleh pemilik database (neondb_owner).
--
-- Kelompok lain login lewat: POST /api/v1/auth/login
-- lalu memakai token Bearer untuk GET /api/v1/integrasi/...
--
-- !!! GANTI password sebelum dijalankan, JANGAN commit password asli.
-- Akun yang sudah ada TIDAK diubah (password lama tetap berlaku).
-- =====================================================================
SET search_path = akademik, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (username, password_hash, role_id)
SELECT v.username, crypt(v.password, gen_salt('bf', 10)), r.id
FROM (VALUES
    ('admin',      'GANTI_PASSWORD_ADMIN',    'admin'),
    ('operator',   'GANTI_PASSWORD_OPERATOR', 'operator'),
    ('svc_jadwal', 'GANTI_PASSWORD_JADWAL',   'service'),
    ('svc_dosen',  'GANTI_PASSWORD_DOSEN',    'service'),
    ('svc_matkul', 'GANTI_PASSWORD_MATKUL',   'service'),
    ('svc_ormawa', 'GANTI_PASSWORD_ORMAWA',   'service')
) AS v(username, password, role)
JOIN roles r ON r.nama = v.role
ON CONFLICT (username) DO NOTHING;

-- Cek hasil
SELECT u.username, r.nama AS role, u.nim, u.is_active
FROM users u JOIN roles r ON r.id = u.role_id
ORDER BY r.id, u.username;
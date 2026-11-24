-- =====================================================================
-- Lengkapi v_mahasiswa_detail: alamat KTP, orang tua, dan atribut M:N
-- (dipakai GET /api/v1/mahasiswa/{nim} - hanya admin, operator, dan
--  mahasiswa untuk dirinya sendiri)
-- Kolom baru ditambahkan di AKHIR, sehingga hak akses (GRANT) tetap.
-- Jalankan oleh pemilik database (neondb_owner).
-- =====================================================================
SET search_path = akademik;

CREATE OR REPLACE VIEW v_mahasiswa_detail AS
SELECT m.nim, m.nama, m.jenis_kelamin, m.email, k.kode AS kelas, m.angkatan,
       m.status_akademik, m.tempat_lahir, m.tanggal_lahir, a.nama AS agama,
       s.nama AS suku, m.no_telepon, m.cita_cita, m.version,
       (SELECT alamat FROM alamat_mahasiswa x WHERE x.nim = m.nim AND x.jenis = 'DOMISILI') AS alamat_domisili,
       (SELECT string_agg(ka.nama, ', ' ORDER BY ka.nama)
          FROM mahasiswa_keahlian mk JOIN keahlian ka ON ka.id = mk.keahlian_id
         WHERE mk.nim = m.nim) AS keahlian,
       -- ===== kolom baru =====
       (SELECT alamat FROM alamat_mahasiswa x WHERE x.nim = m.nim AND x.jenis = 'KTP') AS alamat_ktp,
       ot.nama       AS nama_orang_tua,
       ot.no_telepon AS no_telepon_orang_tua,
       ot.alamat     AS alamat_orang_tua,
       (SELECT string_agg(r.nama, ', ' ORDER BY r.nama)
          FROM mahasiswa_minat_bakat t JOIN minat_bakat r ON r.id = t.minat_bakat_id
         WHERE t.nim = m.nim) AS minat_bakat,
       (SELECT string_agg(r.nama, ', ' ORDER BY r.nama)
          FROM mahasiswa_bahasa t JOIN bahasa r ON r.id = t.bahasa_id
         WHERE t.nim = m.nim) AS bahasa,
       (SELECT string_agg(r.nama, ', ' ORDER BY r.nama)
          FROM mahasiswa_hobi t JOIN hobi r ON r.id = t.hobi_id
         WHERE t.nim = m.nim) AS hobi,
       (SELECT string_agg(r.nama, ', ' ORDER BY r.nama)
          FROM mahasiswa_makanan t JOIN makanan r ON r.id = t.makanan_id
         WHERE t.nim = m.nim) AS makanan_favorit,
       (SELECT string_agg(r.nama, ', ' ORDER BY r.nama)
          FROM mahasiswa_genre_musik t JOIN genre_musik r ON r.id = t.genre_musik_id
         WHERE t.nim = m.nim) AS genre_musik
FROM mahasiswa m
JOIN kelas k ON k.id = m.kelas_id
JOIN agama a ON a.id = m.agama_id
LEFT JOIN suku s ON s.id = m.suku_id
LEFT JOIN LATERAL (
    SELECT o.nama, o.no_telepon, o.alamat
    FROM orang_tua o WHERE o.nim = m.nim
    ORDER BY o.id LIMIT 1
) ot ON TRUE;
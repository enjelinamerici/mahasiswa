-- =====================================================================
-- STATISTIK MAHASISWA (dipakai dashboard Statistik di Web Admin)
-- Jalankan oleh pemilik database (neondb_owner) SETELAH 01–08.
-- Aman dijalankan ulang (CREATE OR REPLACE).
--
-- Format alamat di data: "Jl. ..., Kec. <kecamatan>, Kota/Kab. <nama>, <provinsi>"
-- Dari teks itu diambil kota/kabupaten, lalu dihitung:
--   kota_asal            : kota/kab. dari alamat KTP
--   kota_domisili        : kota/kab. dari alamat domisili
--   merantau             : kota domisili berbeda dengan kota asal (KTP)
--   tinggal_bersama_ortu : alamat domisili sama dengan alamat orang tua
-- =====================================================================
SET search_path = akademik;

-- Ambil "Kota ..." / "Kab. ..." dari teks alamat ("Kabupaten X" diseragamkan jadi "Kab. X")
CREATE OR REPLACE FUNCTION fn_kota_dari_alamat(p_alamat TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(
        regexp_replace(
            trim(substring(p_alamat FROM '((?:[Kk]ota|[Kk]ab\.?|[Kk]abupaten)\s+[^,]+)')),
            '^(kabupaten|kab\.?)\s+', 'Kab. ', 'i'),
        '')
$$;

-- Ambil nama kecamatan dari teks alamat
CREATE OR REPLACE FUNCTION fn_kecamatan_dari_alamat(p_alamat TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(trim(substring(p_alamat FROM '[Kk]ec(?:amatan|\.)?\s+([^,]+)')), '')
$$;

-- Seragamkan alamat untuk dibandingkan (huruf kecil, spasi & tanda baca diabaikan)
CREATE OR REPLACE FUNCTION fn_normal_alamat(p_alamat TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
    SELECT NULLIF(regexp_replace(lower(coalesce(p_alamat, '')), '[^a-z0-9]+', '', 'g'), '')
$$;

-- Satu baris per mahasiswa, berisi semua atribut yang dipakai statistik
CREATE OR REPLACE VIEW v_profil_statistik AS
SELECT m.nim, m.nama, m.jenis_kelamin, k.kode AS kelas, m.angkatan, m.status_akademik,
       a.nama AS agama, s.nama AS suku,
       NULLIF(trim(m.cita_cita), '')               AS cita_cita,
       fn_kota_dari_alamat(ktp.alamat)              AS kota_asal,
       fn_kecamatan_dari_alamat(ktp.alamat)         AS kecamatan_asal,
       fn_kota_dari_alamat(dom.alamat)              AS kota_domisili,
       CASE WHEN ktp.alamat IS NULL OR dom.alamat IS NULL THEN NULL
            ELSE fn_kota_dari_alamat(ktp.alamat) IS DISTINCT FROM fn_kota_dari_alamat(dom.alamat)
       END                                          AS merantau,
       CASE WHEN dom.alamat IS NULL OR ot.alamat IS NULL THEN NULL
            ELSE fn_normal_alamat(dom.alamat) = fn_normal_alamat(ot.alamat)
       END                                          AS tinggal_bersama_ortu
FROM mahasiswa m
JOIN kelas k ON k.id = m.kelas_id
JOIN agama a ON a.id = m.agama_id
LEFT JOIN suku s ON s.id = m.suku_id
LEFT JOIN alamat_mahasiswa ktp ON ktp.nim = m.nim AND ktp.jenis = 'KTP'
LEFT JOIN alamat_mahasiswa dom ON dom.nim = m.nim AND dom.jenis = 'DOMISILI'
LEFT JOIN LATERAL (
    SELECT o.alamat FROM orang_tua o WHERE o.nim = m.nim ORDER BY o.id LIMIT 1
) ot ON TRUE;

-- Hak akses (least privilege): hanya app_api yang boleh membaca statistik.
-- app_integrasi (kelompok lain) TIDAK diberi akses, karena berisi data pribadi.
REVOKE ALL ON FUNCTION fn_kota_dari_alamat(TEXT), fn_kecamatan_dari_alamat(TEXT), fn_normal_alamat(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fn_kota_dari_alamat(TEXT), fn_kecamatan_dari_alamat(TEXT), fn_normal_alamat(TEXT) TO app_api;
REVOKE ALL ON v_profil_statistik FROM PUBLIC;
GRANT SELECT ON v_profil_statistik TO app_api;

-- Cek cepat: harus 0 baris tanpa kota_asal jika semua alamat KTP berformat lengkap
SELECT count(*) AS total,
       count(*) FILTER (WHERE kota_asal IS NULL)             AS tanpa_kota_asal,
       count(*) FILTER (WHERE merantau)                      AS merantau,
       count(*) FILTER (WHERE tinggal_bersama_ortu IS FALSE) AS tidak_tinggal_bersama_ortu
FROM v_profil_statistik;

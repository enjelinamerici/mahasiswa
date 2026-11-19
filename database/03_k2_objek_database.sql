-- =====================================================================
-- K2 (bagian 1): OBJEK DATABASE - view, function, trigger, stored procedure
-- Jalankan SETELAH 01_schema.sql dan import data.
-- Dijalankan oleh pemilik database (neondb_owner), bukan user aplikasi.
-- =====================================================================
SET search_path = akademik;

-- ---------------------------------------------------------------------
-- A. VIEW
-- ---------------------------------------------------------------------

-- A1. Data AMAN untuk dibagikan ke kelompok lain / endpoint publik.
--     Tanpa alamat, telepon, tanggal lahir, dan data orang tua.
CREATE OR REPLACE VIEW v_mahasiswa_publik AS
SELECT m.nim, m.nama, m.jenis_kelamin, m.email,
       k.kode AS kelas, m.angkatan, m.status_akademik
FROM mahasiswa m
JOIN kelas k ON k.id = m.kelas_id;

-- A2. Rekap per kelas (dipakai dashboard / laporan)
CREATE OR REPLACE VIEW v_rekap_per_kelas AS
SELECT k.id AS kelas_id, k.kode AS kelas,
       count(m.nim)                                             AS jumlah_mahasiswa,
       count(*) FILTER (WHERE m.status_akademik = 'Aktif')      AS jumlah_aktif,
       count(*) FILTER (WHERE m.jenis_kelamin = 'L')            AS laki_laki,
       count(*) FILTER (WHERE m.jenis_kelamin = 'P')            AS perempuan
FROM kelas k
LEFT JOIN mahasiswa m ON m.kelas_id = k.id
GROUP BY k.id, k.kode;

-- A3. Detail lengkap (khusus admin) - gabungan banyak tabel dalam satu kueri
CREATE OR REPLACE VIEW v_mahasiswa_detail AS
SELECT m.nim, m.nama, m.jenis_kelamin, m.email, k.kode AS kelas, m.angkatan,
       m.status_akademik, m.tempat_lahir, m.tanggal_lahir, a.nama AS agama,
       s.nama AS suku, m.no_telepon, m.cita_cita, m.version,
       (SELECT alamat FROM alamat_mahasiswa x WHERE x.nim = m.nim AND x.jenis = 'DOMISILI') AS alamat_domisili,
       (SELECT string_agg(ka.nama, ', ' ORDER BY ka.nama)
          FROM mahasiswa_keahlian mk JOIN keahlian ka ON ka.id = mk.keahlian_id
         WHERE mk.nim = m.nim) AS keahlian
FROM mahasiswa m
JOIN kelas k ON k.id = m.kelas_id
JOIN agama a ON a.id = m.agama_id
LEFT JOIN suku s ON s.id = m.suku_id;

-- ---------------------------------------------------------------------
-- B. FUNCTION
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_jumlah_mahasiswa_kelas(p_kode_kelas TEXT)
RETURNS BIGINT LANGUAGE sql STABLE AS $$
    SELECT count(*) FROM mahasiswa m JOIN kelas k ON k.id = m.kelas_id
    WHERE k.kode = p_kode_kelas;
$$;

CREATE OR REPLACE FUNCTION fn_umur(p_tanggal_lahir DATE)
RETURNS INTEGER LANGUAGE sql STABLE AS $$
    SELECT date_part('year', age(CURRENT_DATE, p_tanggal_lahir))::int;
$$;

-- ---------------------------------------------------------------------
-- C. TRIGGER AUDIT: setiap INSERT/UPDATE/DELETE pada mahasiswa dicatat
--    SECURITY DEFINER: user aplikasi TIDAK perlu hak tulis ke audit_log,
--    sehingga log tidak bisa diubah/dihapus oleh aplikasi.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_mahasiswa() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = akademik, pg_temp AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (tabel, aksi, kunci, data_baru, user_db)
        VALUES (TG_TABLE_NAME, 'INSERT', NEW.nim, to_jsonb(NEW), session_user);
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (tabel, aksi, kunci, data_lama, data_baru, user_db)
        VALUES (TG_TABLE_NAME, 'UPDATE', NEW.nim, to_jsonb(OLD), to_jsonb(NEW), session_user);
        RETURN NEW;
    ELSE
        INSERT INTO audit_log (tabel, aksi, kunci, data_lama, user_db)
        VALUES (TG_TABLE_NAME, 'DELETE', OLD.nim, to_jsonb(OLD), session_user);
        RETURN OLD;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_mahasiswa_audit ON mahasiswa;
CREATE TRIGGER trg_mahasiswa_audit
AFTER INSERT OR UPDATE OR DELETE ON mahasiswa
FOR EACH ROW EXECUTE FUNCTION fn_audit_mahasiswa();

-- ---------------------------------------------------------------------
-- D. STORED PROCEDURE BERTRANSAKSI (ACID)
--    Satu CALL = satu transaksi. Jika ada langkah gagal, SEMUA dibatalkan.
-- ---------------------------------------------------------------------

-- D1. Tambah mahasiswa + alamat KTP + orang tua sekaligus (atomik)
CREATE OR REPLACE PROCEDURE sp_tambah_mahasiswa(
    p_nim          CHAR(10),
    p_nama         VARCHAR,
    p_jk           CHAR(1),
    p_email        VARCHAR,
    p_kelas_kode   VARCHAR,
    p_angkatan     SMALLINT,
    p_tempat_lahir VARCHAR,
    p_tanggal_lahir DATE,
    p_agama        VARCHAR,
    p_alamat_ktp   TEXT,
    p_nama_ortu    VARCHAR,
    p_telp_ortu    VARCHAR
) LANGUAGE plpgsql AS $$
DECLARE
    v_kelas SMALLINT;
    v_agama SMALLINT;
BEGIN
    SELECT id INTO v_kelas FROM kelas WHERE kode = p_kelas_kode;
    IF v_kelas IS NULL THEN
        RAISE EXCEPTION 'Kelas % tidak ditemukan', p_kelas_kode USING ERRCODE = 'P0002';
    END IF;
    SELECT id INTO v_agama FROM agama WHERE nama = p_agama;
    IF v_agama IS NULL THEN
        RAISE EXCEPTION 'Agama % tidak ditemukan', p_agama USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO mahasiswa (nim, nama, jenis_kelamin, email, kelas_id, angkatan,
                           tempat_lahir, tanggal_lahir, agama_id)
    VALUES (p_nim, p_nama, p_jk, p_email, v_kelas, p_angkatan,
            p_tempat_lahir, p_tanggal_lahir, v_agama);

    INSERT INTO alamat_mahasiswa (nim, jenis, alamat) VALUES (p_nim, 'KTP', p_alamat_ktp);
    INSERT INTO orang_tua (nim, nama, no_telepon)     VALUES (p_nim, p_nama_ortu, p_telp_ortu);
END;
$$;

-- D2. Pindah kelas dengan pengecekan versi (optimistic locking)
--     Jika data sudah diubah orang lain -> SQLSTATE 40001 (API membalas HTTP 409)
CREATE OR REPLACE PROCEDURE sp_pindah_kelas(
    p_nim        CHAR(10),
    p_kelas_baru VARCHAR,
    p_version    INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
    v_kelas SMALLINT;
    v_baris INTEGER;
BEGIN
    SELECT id INTO v_kelas FROM kelas WHERE kode = p_kelas_baru;
    IF v_kelas IS NULL THEN
        RAISE EXCEPTION 'Kelas % tidak ditemukan', p_kelas_baru USING ERRCODE = 'P0002';
    END IF;

    UPDATE mahasiswa SET kelas_id = v_kelas
    WHERE nim = p_nim AND version = p_version;
    GET DIAGNOSTICS v_baris = ROW_COUNT;

    IF v_baris = 0 THEN
        IF EXISTS (SELECT 1 FROM mahasiswa WHERE nim = p_nim) THEN
            RAISE EXCEPTION 'Data % sudah diubah pengguna lain (versi tidak cocok)', p_nim
                USING ERRCODE = '40001';
        ELSE
            RAISE EXCEPTION 'Mahasiswa % tidak ditemukan', p_nim USING ERRCODE = 'P0002';
        END IF;
    END IF;
END;
$$;

-- =====================================================================
-- DESAIN DATABASE (K1) - Kelompok Data Mahasiswa TRPL
-- DBMS   : PostgreSQL 14+
-- Sumber : Lengkap_Kali_Final-v2.xlsx (470 mahasiswa, 24 kolom)
-- Isi    : tabel, PK/FK/UNIQUE/CHECK, indeks, trigger updated_at/version
-- Catatan: view, function, stored procedure, user & privilege (K2)
--          dibuat di file terpisah.
-- =====================================================================

DROP SCHEMA IF EXISTS akademik CASCADE;
CREATE SCHEMA akademik;
SET search_path = akademik;

-- ---------------------------------------------------------------------
-- 1. TABEL REFERENSI (lookup)
-- ---------------------------------------------------------------------
CREATE TABLE agama (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE suku (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(30) NOT NULL UNIQUE
);

-- Excel: "TRPL 1A" dipecah menjadi tingkat (1/3/5/7) dan golongan (A-E)
CREATE TABLE kelas (
    id        SMALLSERIAL PRIMARY KEY,
    kode      VARCHAR(10) NOT NULL UNIQUE,              -- 'TRPL 1A' (kunci bersama antar-kelompok)
    tingkat   SMALLINT    NOT NULL CHECK (tingkat IN (1,3,5,7)),
    golongan  CHAR(1)     NOT NULL CHECK (golongan ~ '^[A-E]$'),
    UNIQUE (tingkat, golongan)
);

-- ---------------------------------------------------------------------
-- 2. TABEL UTAMA: MAHASISWA
-- ---------------------------------------------------------------------
CREATE TABLE mahasiswa (
    nim              CHAR(10)     PRIMARY KEY CHECK (nim ~ '^[0-9]{10}$'),
    nama             VARCHAR(100) NOT NULL,
    jenis_kelamin    CHAR(1)      NOT NULL CHECK (jenis_kelamin IN ('L','P')),
    email            VARCHAR(100) NOT NULL UNIQUE
                     CHECK (email ~* '^[a-z0-9._-]+@students\.polmed\.ac\.id$'),
    kelas_id         SMALLINT     NOT NULL REFERENCES kelas(id)
                     ON UPDATE CASCADE ON DELETE RESTRICT,
    angkatan         SMALLINT     NOT NULL CHECK (angkatan BETWEEN 2000 AND 2100),
    status_akademik  VARCHAR(15)  NOT NULL DEFAULT 'Aktif'
                     CHECK (status_akademik IN ('Aktif','Tidak Aktif','Cuti','Lulus')),
    tempat_lahir     VARCHAR(60)  NOT NULL,              -- dipecah dari "Tempat Tanggal Lahir"
    tanggal_lahir    DATE         NOT NULL CHECK (tanggal_lahir < CURRENT_DATE),
    agama_id         SMALLINT     NOT NULL REFERENCES agama(id),
    suku_id          SMALLINT     REFERENCES suku(id),
    no_telepon       VARCHAR(15)  CHECK (no_telepon ~ '^[0-9]{10,14}$'),
    cita_cita        VARCHAR(80),
    -- untuk konkurensi / optimistic locking (K7)
    version          INTEGER      NOT NULL DEFAULT 1,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- 2 digit awal NIM = 2 digit akhir tahun angkatan (cth. 26xxxxxxxx = 2026)
    CONSTRAINT ck_nim_angkatan CHECK (substr(nim,1,2) = lpad((angkatan % 100)::text, 2, '0'))
);

-- ---------------------------------------------------------------------
-- 3. DATA TURUNAN 1:N
--    (di Excel satu baris punya alamat KTP, domisili, ortu -> dipisah)
-- ---------------------------------------------------------------------
CREATE TABLE alamat_mahasiswa (
    id      SERIAL PRIMARY KEY,
    nim     CHAR(10) NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    jenis   VARCHAR(10) NOT NULL CHECK (jenis IN ('KTP','DOMISILI')),
    alamat  TEXT NOT NULL,
    UNIQUE (nim, jenis)
);

CREATE TABLE orang_tua (
    id          SERIAL PRIMARY KEY,
    nim         CHAR(10) NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    nama        VARCHAR(100) NOT NULL,
    hubungan    VARCHAR(20)  NOT NULL DEFAULT 'Orang Tua'
                CHECK (hubungan IN ('Ayah','Ibu','Wali','Orang Tua')),
    no_telepon  VARCHAR(15)  CHECK (no_telepon ~ '^[0-9]{10,14}$'),
    alamat      TEXT
);

-- ---------------------------------------------------------------------
-- 4. ATRIBUT MULTI-NILAI (M:N)
--    Di Excel berupa teks dipisah koma ("PHP, Laravel, MySQL") -> melanggar 1NF
--    Solusi: tabel referensi + tabel penghubung. Pola sama untuk 6 atribut.
-- ---------------------------------------------------------------------
CREATE TABLE minat_bakat (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_minat_bakat (
    nim           CHAR(10)  NOT NULL REFERENCES mahasiswa(nim)   ON UPDATE CASCADE ON DELETE CASCADE,
    minat_bakat_id SMALLINT NOT NULL REFERENCES minat_bakat(id)  ON DELETE RESTRICT,
    PRIMARY KEY (nim, minat_bakat_id)
);

CREATE TABLE hobi (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_hobi (
    nim      CHAR(10)  NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    hobi_id  SMALLINT  NOT NULL REFERENCES hobi(id)       ON DELETE RESTRICT,
    PRIMARY KEY (nim, hobi_id)
);

CREATE TABLE makanan (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_makanan (
    nim         CHAR(10) NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    makanan_id  SMALLINT NOT NULL REFERENCES makanan(id)    ON DELETE RESTRICT,
    PRIMARY KEY (nim, makanan_id)
);

CREATE TABLE bahasa (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_bahasa (
    nim        CHAR(10) NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    bahasa_id  SMALLINT NOT NULL REFERENCES bahasa(id)     ON DELETE RESTRICT,
    PRIMARY KEY (nim, bahasa_id)
);

CREATE TABLE genre_musik (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(60) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_genre_musik (
    nim            CHAR(10) NOT NULL REFERENCES mahasiswa(nim)   ON UPDATE CASCADE ON DELETE CASCADE,
    genre_musik_id SMALLINT NOT NULL REFERENCES genre_musik(id)  ON DELETE RESTRICT,
    PRIMARY KEY (nim, genre_musik_id)
);

CREATE TABLE keahlian (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE mahasiswa_keahlian (
    nim          CHAR(10) NOT NULL REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE CASCADE,
    keahlian_id  SMALLINT NOT NULL REFERENCES keahlian(id)   ON DELETE RESTRICT,
    PRIMARY KEY (nim, keahlian_id)
);

-- ---------------------------------------------------------------------
-- 5. AUTENTIKASI (dipakai Web API: JWT + role)
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id    SMALLSERIAL PRIMARY KEY,
    nama  VARCHAR(20) NOT NULL UNIQUE      -- admin, operator, mahasiswa, service
);

CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    username       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,   -- bcrypt/argon2, JANGAN plaintext
    role_id        SMALLINT     NOT NULL REFERENCES roles(id),
    nim            CHAR(10)     UNIQUE REFERENCES mahasiswa(nim) ON UPDATE CASCADE ON DELETE SET NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Jejak perubahan data (diisi trigger pada tahap K2)
CREATE TABLE audit_log (
    id          BIGSERIAL PRIMARY KEY,
    tabel       VARCHAR(50) NOT NULL,
    aksi        VARCHAR(10) NOT NULL CHECK (aksi IN ('INSERT','UPDATE','DELETE')),
    kunci       VARCHAR(50) NOT NULL,
    data_lama   JSONB,
    data_baru   JSONB,
    user_db     NAME        NOT NULL DEFAULT current_user,
    waktu       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. INDEKS (kolom yang sering dipakai filter / join / pencarian)
--    PK & UNIQUE sudah otomatis ber-indeks (nim, email, kode kelas, dst.)
-- ---------------------------------------------------------------------
CREATE INDEX idx_mahasiswa_kelas     ON mahasiswa (kelas_id);              -- GET /kelas/{id}/mahasiswa
CREATE INDEX idx_mahasiswa_angkatan  ON mahasiswa (angkatan, status_akademik); -- filter angkatan + status
CREATE INDEX idx_mahasiswa_nama      ON mahasiswa (lower(nama) text_pattern_ops); -- pencarian nama awalan
CREATE INDEX idx_mahasiswa_agama     ON mahasiswa (agama_id);
CREATE INDEX idx_mahasiswa_suku      ON mahasiswa (suku_id);
CREATE INDEX idx_orang_tua_nim       ON orang_tua (nim);
-- sisi kebalikan tabel penghubung (PK sudah mengindeks sisi nim)
CREATE INDEX idx_mm_minat    ON mahasiswa_minat_bakat (minat_bakat_id);
CREATE INDEX idx_mh_hobi     ON mahasiswa_hobi        (hobi_id);
CREATE INDEX idx_mk_makanan  ON mahasiswa_makanan     (makanan_id);
CREATE INDEX idx_mb_bahasa   ON mahasiswa_bahasa      (bahasa_id);
CREATE INDEX idx_mg_genre    ON mahasiswa_genre_musik (genre_musik_id);
CREATE INDEX idx_ma_keahlian ON mahasiswa_keahlian    (keahlian_id);
CREATE INDEX idx_audit_tabel_kunci ON audit_log (tabel, kunci, waktu DESC);

-- ---------------------------------------------------------------------
-- 7. TRIGGER updated_at + version (dasar optimistic locking, K7)
--    API: UPDATE ... WHERE nim=? AND version=? ; jika 0 baris -> HTTP 409
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    NEW.version    := OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_mahasiswa_updated
BEFORE UPDATE ON mahasiswa
FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ---------------------------------------------------------------------
-- 8. DATA AWAL TABEL REFERENSI TETAP
-- ---------------------------------------------------------------------
INSERT INTO roles (nama) VALUES ('admin'), ('operator'), ('mahasiswa'), ('service');
INSERT INTO agama (nama) VALUES ('Islam'), ('Kristen Protestan'), ('Katolik'),
                                ('Hindu'), ('Buddha'), ('Konghucu');
INSERT INTO kelas (kode, tingkat, golongan)
SELECT 'TRPL ' || t || g, t, g
FROM (VALUES (1),(3),(5),(7)) AS a(t), (VALUES ('A'),('B'),('C'),('D'),('E')) AS b(g)
WHERE NOT (t = 7 AND g = 'E');   -- di data, TRPL 7E tidak ada

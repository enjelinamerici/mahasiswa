"""
Import data mahasiswa dari Excel ke skema PostgreSQL (01_schema.sql).

Pemakaian:
  pip install pandas openpyxl psycopg2-binary
  python 02_import_excel.py Lengkap_Kali_Final-v2.xlsx "host=localhost dbname=mdcs user=postgres password=xxx"

Skrip aman dijalankan ulang pada DB yang baru dibuat; seluruh import berjalan
dalam SATU transaksi (gagal di tengah -> rollback, tidak ada data setengah masuk).
"""
import sys
from datetime import date

import pandas as pd
import psycopg2

BULAN = {"januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6,
         "juli": 7, "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12}

# kolom Excel -> (tabel referensi, tabel penghubung, kolom FK di penghubung)
MULTI = {
    "Minat Bakat":              ("minat_bakat", "mahasiswa_minat_bakat", "minat_bakat_id"),
    "Hobi":                     ("hobi",        "mahasiswa_hobi",        "hobi_id"),
    "Makanan Favorit":          ("makanan",     "mahasiswa_makanan",     "makanan_id"),
    "Bahasa yang Dikuasai":     ("bahasa",      "mahasiswa_bahasa",      "bahasa_id"),
    "Genre Musik yang Disukai": ("genre_musik", "mahasiswa_genre_musik", "genre_musik_id"),
    "Keahlian":                 ("keahlian",    "mahasiswa_keahlian",    "keahlian_id"),
}


def parse_ttl(teks: str):
    """'Medan, 17 September 2007' -> ('Medan', date(2007, 9, 17))"""
    tempat, tgl = [x.strip() for x in teks.rsplit(",", 1)]
    d, b, y = tgl.split()
    return tempat, date(int(y), BULAN[b.lower()], int(d))


def get_id(cur, cache, tabel, nama):
    """Ambil id dari tabel referensi; buat jika belum ada."""
    key = (tabel, nama)
    if key not in cache:
        cur.execute(f"INSERT INTO {tabel} (nama) VALUES (%s) "
                    f"ON CONFLICT (nama) DO UPDATE SET nama = EXCLUDED.nama RETURNING id", (nama,))
        cache[key] = cur.fetchone()[0]
    return cache[key]


def main(xlsx, dsn):
    df = pd.read_excel(xlsx, dtype=str).fillna("")
    conn = psycopg2.connect(dsn)
    cache = {}
    try:
        with conn, conn.cursor() as cur:           # 'with conn' = 1 transaksi (commit/rollback)
            cur.execute("SET search_path = akademik")
            cur.execute("SELECT kode, id FROM kelas")
            kelas = dict(cur.fetchall())
            cur.execute("SELECT nama, id FROM agama")
            agama = dict(cur.fetchall())

            for _, r in df.iterrows():
                tempat, tgl = parse_ttl(r["Tempat Tanggal Lahir"])
                suku_id = get_id(cur, cache, "suku", r["Suku"].strip()) if r["Suku"].strip() else None
                cur.execute("""
                    INSERT INTO mahasiswa (nim, nama, jenis_kelamin, email, kelas_id, angkatan,
                        status_akademik, tempat_lahir, tanggal_lahir, agama_id, suku_id,
                        no_telepon, cita_cita)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                    (r["NIM"], r["Nama"].strip(), r["JK"], r["Gmail"].strip().lower(),
                     kelas[r["Kelas"].strip()], int(r["Angkatan"]), r["Status Akademik"].strip(),
                     tempat, tgl, agama[r["Agama"].strip()], suku_id,
                     r["no_telepon_mahasiswa"] or None, r["Cita-Cita"].strip() or None))

                for jenis, kol in (("KTP", "alamat_ktp"), ("DOMISILI", "alamat_domisili")):
                    if r[kol].strip():
                        cur.execute("INSERT INTO alamat_mahasiswa (nim, jenis, alamat) VALUES (%s,%s,%s)",
                                    (r["NIM"], jenis, r[kol].strip()))

                if r["nama_orang_tua"].strip():
                    cur.execute("""INSERT INTO orang_tua (nim, nama, no_telepon, alamat)
                                   VALUES (%s,%s,%s,%s)""",
                                (r["NIM"], r["nama_orang_tua"].strip(),
                                 r["no_telepon_orang_tua"] or None, r["alamat_orang_tua"].strip() or None))

                for kol, (ref, pivot, fk) in MULTI.items():
                    for item in dict.fromkeys(x.strip() for x in r[kol].split(",") if x.strip()):
                        rid = get_id(cur, cache, ref, item)
                        cur.execute(f"INSERT INTO {pivot} (nim, {fk}) VALUES (%s,%s) ON CONFLICT DO NOTHING",
                                    (r["NIM"], rid))
        print(f"OK: {len(df)} mahasiswa berhasil diimport.")
    finally:
        conn.close()


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])

# API Mahasiswa TRPL

Web API data mahasiswa (CodeIgniter 4 + PostgreSQL/Neon) untuk proyek akhir Manajemen Database Client Server.
Data ini juga dipakai kelompok lain (API Jadwal, API Dosen, API Mata Kuliah, API Organisasi Mahasiswa).

## Aplikasi client

| Aplikasi | Alamat | Pengguna | Fungsi |
|---|---|---|---|
| **App 1 – Web Admin** | `/web/login.html` | admin, operator | Kelola data semua mahasiswa: cari, detail, tambah, edit, pindah kelas, hapus (admin), **dashboard statistik** |
| **App 2 – Portal Mahasiswa** | `/portal/login.html` | mahasiswa | Profil sendiri, edit sebagian data diri, ganti password, teman sekelas, jadwal & mata kuliah (API Jadwal), organisasi (API Ormawa) |

Kedua aplikasi hanya mengakses data lewat Web API ini (tidak ada akses database langsung) dan login lewat endpoint yang sama (`POST /api/v1/auth/login`).
Jadwal dan organisasi di Portal Mahasiswa diambil dari API kelompok lain; selama API mereka belum bisa diakses, portal menampilkan **data simulasi** yang diberi label jelas (lihat `public/portal/integrasi.js`).

## Instalasi

1. `composer install`
2. Buat file `.env` di folder utama proyek, lalu isi:
   ```
   CI_ENVIRONMENT = development
   JWT_SECRET = isi_dengan_string_acak_panjang

   database.default.hostname = <host neon>
   database.default.database = <nama database>
   database.default.username = app_api
   database.default.password = <password app_api>
   database.default.DBDriver = Postgre

   # opsional, untuk endpoint integrasi (least privilege)
   database.integrasi.hostname = <host neon>
   database.integrasi.database = <nama database>
   database.integrasi.username = app_integrasi
   database.integrasi.password = <password app_integrasi>
   ```
3. Jalankan script di folder `database/` berurutan (01 → 09).
4. `php spark serve`, lalu API tersedia di `http://localhost:8080/api/v1`.

## Role dan hak akses

| Role | Dipakai oleh | Hak |
|---|---|---|
| `admin` | Admin akademik | Semua endpoint, termasuk hapus mahasiswa |
| `operator` | Staf / operator | Lihat, tambah, ubah, pindah kelas (tidak bisa hapus) |
| `mahasiswa` | Mahasiswa | Profil sendiri (lihat & ubah sebagian), ganti password, daftar **teman sekelas saja**; detail **hanya data dirinya sendiri** |
| `service` | Kelompok lain | Hanya endpoint `/integrasi/...` (data publik, tanpa data pribadi) |

Request tanpa token → `401`. Role yang tidak punya hak → `403`.

## Endpoint

Semua response berformat `{ "status", "message", "data" }`.

| Method | Endpoint | Role |
|---|---|---|
| POST | `/auth/login` (maks. 5 percobaan/menit per username) | semua (tanpa token) |
| GET | `/mahasiswa?limit=&page=&kelas=` | admin, operator, mahasiswa (hanya kelasnya sendiri) |
| GET | `/mahasiswa/{nim}` | admin, operator, mahasiswa (diri sendiri) |
| POST | `/mahasiswa` | admin, operator |
| PUT | `/mahasiswa/{nim}` (wajib kirim `version`) | admin, operator |
| PATCH | `/mahasiswa/{nim}/kelas` | admin, operator |
| DELETE | `/mahasiswa/{nim}` | admin |
| GET | `/kelas`, `/agama`, `/suku` | admin, operator, mahasiswa |
| GET | `/kelas/{id}/mahasiswa` | admin, operator, mahasiswa (hanya kelasnya sendiri) |
| PUT | `/akun/password` | admin, operator, mahasiswa |
| GET | `/profil` | mahasiswa |
| PUT | `/profil` (wajib kirim `version`) | mahasiswa |
| GET | `/statistik?kelas=&angkatan=` | admin, operator |
| GET | `/statistik/mahasiswa?kategori=&nilai=&kelas=&angkatan=` | admin, operator |
| GET | `/integrasi/kelas` | service, admin |
| GET | `/integrasi/mahasiswa?nama=&kelas=&angkatan=&status=&limit=&page=` | service, admin |
| GET | `/integrasi/mahasiswa/{nim}` | service, admin |
| GET | `/integrasi/rekap` | service, admin |

## Untuk kelompok lain

1. Minta username/password akun service ke kelompok kami (`svc_jadwal`, `svc_dosen`, `svc_matkul`, `svc_ormawa`).
2. `POST /api/v1/auth/login` → ambil `data.token`.
3. Kirim header `Authorization: Bearer <token>` ke endpoint `/api/v1/integrasi/...`.
4. Token berlaku 1 jam. Jika mendapat `401`, login ulang.

Field yang dibagikan: `nim, nama, jenis_kelamin, email, kelas, angkatan, status_akademik`.


## Tambah / ubah mahasiswa beserta data turunan

`POST /mahasiswa` dan `PUT /mahasiswa/{nim}` juga menerima field opsional berikut.
Semuanya disimpan **dalam satu transaksi**: jika satu bagian gagal, seluruh perubahan dibatalkan (rollback).

| Field | Contoh | Keterangan |
|---|---|---|
| `alamat_ktp`, `alamat_domisili` | `"Jl. Sutomo No. 109"` | `""` saat ubah = hapus alamat |
| `nama_orang_tua` | `"BONAR SITANGGANG"` | wajib jika mengisi no. telepon/alamat orang tua |
| `no_telepon_orang_tua` | `"081300008300"` | 10–14 digit |
| `alamat_orang_tua` | `"Jl. Sutomo No. 109"` | |
| `minat_bakat`, `keahlian`, `bahasa`, `hobi`, `makanan_favorit`, `genre_musik` | `["Membaca", "Futsal"]` atau `"Membaca, Futsal"` | saat ubah, isi lama diganti seluruhnya; `[]` = kosongkan |

Contoh:
```json
{
  "nim": "2605189001", "nama": "UJI", "jenis_kelamin": "L",
  "email": "uji@students.polmed.ac.id", "kelas_id": 1, "angkatan": 2026,
  "status_akademik": "Aktif", "tempat_lahir": "Medan", "tanggal_lahir": "2008-01-01", "agama_id": 1,
  "alamat_ktp": "Jl. Contoh 1", "nama_orang_tua": "PAK UJI", "hobi": ["Renang", "Catur"]
}
```

Web admin tersedia di `/web/login.html` (login sebagai admin atau operator untuk tambah/ubah, admin untuk hapus).
Mahasiswa yang ditambahkan lewat API otomatis dibuatkan akun login (username = NIM, password awal = tanggal lahir `DDMMYYYY`); saat mahasiswa dihapus, akunnya dinonaktifkan.

## Akun mahasiswa & Portal Mahasiswa

- Login: `POST /auth/login` dengan `{"username": "<NIM>", "password": "<DDMMYYYY>"}`.
  Response berisi `role` dan `password_awal` (`true` jika masih memakai tanggal lahir → portal mengingatkan untuk menggantinya).
- `GET /profil` → biodata lengkap milik sendiri (NIM diambil dari token, bukan dari URL).
- `PUT /profil` → mahasiswa boleh mengubah data pribadi, kontak, alamat, orang tua, dan minat: `jenis_kelamin`, `tempat_lahir`, `tanggal_lahir`, `agama_id`, `suku_id`, `no_telepon`, `cita_cita`, `alamat_ktp`, `alamat_domisili`, `nama_orang_tua`, `no_telepon_orang_tua`, `alamat_orang_tua`, `keahlian`, `minat_bakat`, `bahasa`, `hobi`, `makanan_favorit`, `genre_musik`.
  Data akademik resmi (`nim`, `nama`, `kelas_id`, `angkatan`, `status_akademik`, `email`) ditolak `422`. Wajib mengirim `version`; jika data sudah diubah admin → `409`.
  Perubahan langsung terlihat di Web Admin dan ikut dihitung di statistik.
- `PUT /akun/password` → `{"password_lama": "...", "password_baru": "...", "konfirmasi_password": "..."}` (password baru minimal 8 karakter).

Contoh ubah profil:
```json
{ "version": 3, "no_telepon": "081234567890", "hobi": ["Membaca", "Futsal"], "alamat_domisili": "Jl. Kos No. 5" }
```


## Statistik (Web Admin → tab Statistik)

Dihitung dari view `v_profil_statistik` (`database/09_statistik.sql`). Kota/kabupaten diambil dari alamat berformat `Jl. ..., Kec. ..., Kota/Kab. ..., Provinsi`.

| Statistik | Cara menghitung |
|---|---|
| Asal daerah | kota/kab. dari alamat **KTP** |
| Kota domisili | kota/kab. dari alamat **domisili** |
| Merantau | kota domisili ≠ kota asal (KTP) |
| Tidak tinggal bersama orang tua | alamat domisili ≠ alamat orang tua (huruf besar-kecil, spasi & tanda baca diabaikan) |
| Cita-cita | dikelompokkan tanpa membedakan huruf besar-kecil, dengan persentase |
| Hobi, minat & bakat, keahlian, bahasa, makanan, genre musik | 10 terbanyak (satu mahasiswa bisa punya beberapa) |
| Kelas, angkatan, jenis kelamin, agama, suku, status | jumlah & persentase |

`GET /statistik/mahasiswa?kategori=<kategori>&nilai=<nilai>` mengembalikan daftar mahasiswa di balik satu angka, contoh
`kategori=tinggal_bersama_ortu&nilai=tidak`, `kategori=kota_asal&nilai=Kota Tebing Tinggi`, `kategori=hobi&nilai=Futsal`.

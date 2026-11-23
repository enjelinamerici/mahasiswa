# API Mahasiswa TRPL

Web API data mahasiswa (CodeIgniter 4 + PostgreSQL/Neon) untuk proyek akhir Manajemen Database Client Server.
Data ini juga dipakai kelompok lain (API Jadwal, API Dosen, API Mata Kuliah, API Organisasi Mahasiswa).

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
3. Jalankan script di folder `database/` berurutan (01 → 06).
4. `php spark serve`, lalu API tersedia di `http://localhost:8080/api/v1`.

## Role dan hak akses

| Role | Dipakai oleh | Hak |
|---|---|---|
| `admin` | Admin akademik | Semua endpoint, termasuk hapus mahasiswa |
| `operator` | Staf / operator | Lihat, tambah, ubah, pindah kelas (tidak bisa hapus) |
| `mahasiswa` | Mahasiswa | Daftar data publik; detail **hanya data dirinya sendiri** |
| `service` | Kelompok lain | Hanya endpoint `/integrasi/...` (data publik, tanpa data pribadi) |

Request tanpa token → `401`. Role yang tidak punya hak → `403`.

## Endpoint

Semua response berformat `{ "status", "message", "data" }`.

| Method | Endpoint | Role |
|---|---|---|
| POST | `/auth/login` | semua (tanpa token) |
| GET | `/mahasiswa?limit=&page=&kelas=` | admin, operator, mahasiswa |
| GET | `/mahasiswa/{nim}` | admin, operator, mahasiswa (diri sendiri) |
| POST | `/mahasiswa` | admin, operator |
| PUT | `/mahasiswa/{nim}` (wajib kirim `version`) | admin, operator |
| PATCH | `/mahasiswa/{nim}/kelas` | admin, operator |
| DELETE | `/mahasiswa/{nim}` | admin |
| GET | `/kelas`, `/kelas/{id}/mahasiswa`, `/agama`, `/suku` | admin, operator, mahasiswa |
| GET | `/integrasi/kelas` | service, admin |
| GET | `/integrasi/mahasiswa?kelas=&angkatan=&status=&limit=&page=` | service, admin |
| GET | `/integrasi/mahasiswa/{nim}` | service, admin |
| GET | `/integrasi/rekap` | service, admin |

## Untuk kelompok lain

1. Minta username/password akun service ke kelompok kami (`svc_jadwal`, `svc_dosen`, `svc_matkul`, `svc_ormawa`).
2. `POST /api/v1/auth/login` → ambil `data.token`.
3. Kirim header `Authorization: Bearer <token>` ke endpoint `/api/v1/integrasi/...`.
4. Token berlaku 1 jam. Jika mendapat `401`, login ulang.

Field yang dibagikan: `nim, nama, jenis_kelamin, email, kelas, angkatan, status_akademik`.git add README.md
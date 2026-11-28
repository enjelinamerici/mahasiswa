/* =====================================================================
 * PORTAL MAHASISWA TRPL (App 2)
 * Mahasiswa login dengan NIM, lalu melihat & mengelola data dirinya sendiri.
 * Semua data mahasiswa diambil lewat Web API (tidak ada akses database langsung).
 * Jadwal, mata kuliah, dan organisasi diambil dari API kelompok lain (integrasi.js).
 * ===================================================================== */
const KUNCI_TOKEN = 'portal_token';
const TOKEN = localStorage.getItem(KUNCI_TOKEN);
if (!TOKEN) location.replace('login.html');

const $ = (id) => document.getElementById(id);
const konten = $('konten');
const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tampil = (v) => (v == null || v === '' ? '-' : esc(v));
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tanggalIndo = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : '';
};

function keluar(pesan) {
  localStorage.removeItem(KUNCI_TOKEN);
  localStorage.removeItem('portal_password_awal');
  location.replace('login.html' + (pesan ? '?pesan=' + encodeURIComponent(pesan) : ''));
}
$('btnKeluar').addEventListener('click', () => keluar());

// ---------- Pemanggil Web API Mahasiswa ----------
async function api(method, path, body) {
  const res = await fetch('/api/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    keluar('Sesi Anda sudah berakhir, silakan masuk lagi.');
    throw new Error('401');
  }
  const json = await res.json().catch(() => ({}));
  return { kode: res.status, json };
}

// ---------- Data yang dipakai bersama (di-cache selama halaman terbuka) ----------
const cache = { profil: null, jadwal: null, teman: null, organisasi: null };

async function profil(segarkan) {
  if (!cache.profil || segarkan) {
    const r = await api('GET', '/profil');
    if (r.kode !== 200) throw new Error(r.json.message || 'Gagal memuat profil');
    cache.profil = r.json.data;
    isiHeader(cache.profil);
  }
  return cache.profil;
}
async function jadwal() {
  if (!cache.jadwal) cache.jadwal = await ambilJadwal((await profil()).kelas);
  return cache.jadwal;
}
async function teman() {
  if (!cache.teman) {
    // API hanya mengembalikan teman sekelas untuk role mahasiswa
    let semua = [], page = 1, total = 0;
    do {
      const r = await api('GET', '/mahasiswa?limit=100&page=' + page);
      if (r.kode !== 200) throw new Error(r.json.message || 'Gagal memuat teman sekelas');
      semua = semua.concat(r.json.data.items);
      total = r.json.data.total;
      page++;
    } while (semua.length < total);
    cache.teman = semua.sort((a, b) => a.nama.localeCompare(b.nama));
  }
  return cache.teman;
}
async function organisasi() {
  if (!cache.organisasi) cache.organisasi = await ambilOrganisasi((await profil()).nim);
  return cache.organisasi;
}

function isiHeader(p) {
  $('hNama').textContent = p.nama;
  $('hNim').textContent = p.nim + ' • ' + p.kelas;
  const kata = p.nama.trim().split(/\s+/);
  $('hAvatar').textContent = (kata[0][0] + (kata[1] ? kata[1][0] : '')).toUpperCase();
}

function badgeSumber(hasil) {
  return hasil.sumber === 'live'
    ? `<span class="sumber live">● Live dari ${esc(hasil.nama)}</span>`
    : `<span class="sumber simulasi">Data simulasi — ${esc(hasil.nama)} belum terhubung</span>`;
}
function infoPasswordAwal() {
  return localStorage.getItem('portal_password_awal') === '1'
    ? `<div class="info kuning">⚠️ <div>Anda masih memakai <b>password awal</b> (tanggal lahir). Demi keamanan, <a href="#akun">ganti password sekarang</a>.</div></div>`
    : '';
}
const hariIni = () => { const d = new Date().getDay(); return d >= 1 && d <= 5 ? HARI[d - 1] : null; };
const urutJam = (a, b) => a.mulai.localeCompare(b.mulai);

// =====================================================================
// HALAMAN
// =====================================================================
const HALAMAN = {
  // ---------- Beranda ----------
  async beranda() {
    const p = await profil();
    const jam = new Date().getHours();
    const salam = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam';
    konten.innerHTML = `
      ${infoPasswordAwal()}
      <section class="hero">
        <small>${salam},</small>
        <h1>${esc(p.nama)}</h1>
        <div class="hero-chip"><span>NIM ${esc(p.nim)}</span><span>${esc(p.kelas)}</span><span>Angkatan ${esc(p.angkatan)}</span><span>Status: ${esc(p.status_akademik)}</span></div>
      </section>
      <div class="grid grid-4" id="statBeranda"><div class="memuat">Memuat ringkasan…</div></div>
      <div class="kartu" style="margin-top:16px">
        <div class="kartu-judul"><h2>Kuliah hari ini</h2><span id="sumberHariIni"></span></div>
        <div id="kuliahHariIni"><div class="memuat">Memuat jadwal…</div></div>
      </div>`;

    const [j, t] = await Promise.all([jadwal(), teman().catch(() => [])]);
    const totalSks = [...new Map(j.data.map((s) => [s.kode, s.sks])).values()].reduce((a, b) => a + b, 0);
    $('statBeranda').innerHTML = [
      ['🎓', 'Kelas', esc(p.kelas)],
      ['📚', 'Mata kuliah', `${new Set(j.data.map((s) => s.kode)).size} <small style="font-size:13px">(${totalSks} SKS)</small>`],
      ['👥', 'Teman sekelas', t.length ? t.length - 1 : '-'],
      ['🏢', 'Status', esc(p.status_akademik)],
    ].map(([ikon, label, nilai]) => `<div class="kartu stat"><div class="stat-ikon">${ikon}</div><div><small>${label}</small><b>${nilai}</b></div></div>`).join('');

    $('sumberHariIni').innerHTML = badgeSumber(j);
    const h = hariIni();
    const sesi = h ? j.data.filter((s) => s.hari === h).sort(urutJam) : [];
    $('kuliahHariIni').innerHTML = !h
      ? '<div class="kosong">Hari ini akhir pekan, tidak ada jadwal kuliah. 🎉</div>'
      : sesi.length
        ? sesi.map(kartuSesi).join('')
        : `<div class="kosong">Tidak ada kuliah hari ${h}. <a href="#jadwal">Lihat jadwal minggu ini</a></div>`;
  },

  // ---------- Profil ----------
  async profil() {
    const p = await profil();
    const f = (label, nilai, opsi = {}) => `
      <div class="field${opsi.full ? ' full' : ''}">
        <small>${label}${opsi.kunci ? ' <span class="kunci" title="Hanya bisa diubah admin">🔒</span>' : ''}</small>
        <div>${tampil(nilai)}</div>
      </div>`;
    konten.innerHTML = `
      <div class="judul-hal" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div><h1>Profil Saya</h1><p>Data bertanda 🔒 (data akademik resmi) hanya bisa diubah oleh admin. Selebihnya bisa Anda ubah sendiri.</p></div>
        <button class="btn btn-utama" id="btnEdit" type="button">✏️ Edit Profil</button>
      </div>
      <div class="kartu"><div class="kartu-judul"><h2>Identitas & Akademik</h2></div><div class="field-grid">
        ${f('NIM', p.nim, { kunci: 1 })}${f('Nama Lengkap', p.nama, { kunci: 1 })}${f('Kelas', p.kelas, { kunci: 1 })}
        ${f('Angkatan', p.angkatan, { kunci: 1 })}${f('Status Akademik', p.status_akademik, { kunci: 1 })}
        ${f('Jenis Kelamin', p.jenis_kelamin === 'L' ? 'Laki-laki' : p.jenis_kelamin === 'P' ? 'Perempuan' : '')}
        ${f('Tempat, Tanggal Lahir', [p.tempat_lahir, tanggalIndo(p.tanggal_lahir)].filter(Boolean).join(', '))}
        ${f('Agama', p.agama)}${f('Suku', p.suku)}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Kontak & Alamat</h2></div><div class="field-grid">
        ${f('Email', p.email, { kunci: 1 })}${f('No. Telepon', p.no_telepon)}
        ${f('Alamat KTP', p.alamat_ktp, { full: 1 })}${f('Alamat Domisili', p.alamat_domisili, { full: 1 })}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Orang Tua / Wali</h2></div><div class="field-grid">
        ${f('Nama', p.nama_orang_tua)}${f('No. Telepon', p.no_telepon_orang_tua)}
        ${f('Alamat', p.alamat_orang_tua, { full: 1 })}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Minat, Keahlian & Cita-cita</h2></div><div class="field-grid">
        ${f('Minat & Bakat', p.minat_bakat)}${f('Keahlian', p.keahlian)}${f('Cita-cita', p.cita_cita)}
        ${f('Bahasa', p.bahasa)}${f('Hobi', p.hobi)}${f('Makanan Favorit', p.makanan_favorit)}${f('Genre Musik', p.genre_musik)}
      </div></div>`;
    $('btnEdit').addEventListener('click', () => halamanEditProfil());
  },

  // ---------- Jadwal ----------
  async jadwal() {
    const p = await profil();
    konten.innerHTML = `<div class="judul-hal"><h1>Jadwal Kuliah</h1><p>Kelas ${esc(p.kelas)} • diambil dari API Jadwal berdasarkan kelas Anda.</p></div>
      <div class="kartu"><div class="memuat">Memuat jadwal…</div></div>`;
    const j = await jadwal();
    const h = hariIni();
    const isi = HARI.map((hari) => {
      const sesi = j.data.filter((s) => s.hari === hari).sort(urutJam);
      return `<div class="hari${hari === h ? ' hari-ini' : ''}">
        <h3>${hari}${hari === h ? ' <span class="tag-hari-ini">Hari ini</span>' : ''}</h3>
        ${sesi.length ? sesi.map(kartuSesi).join('') : '<div class="hint" style="margin-bottom:8px">Tidak ada kuliah.</div>'}
      </div>`;
    }).join('');
    konten.querySelector('.kartu').innerHTML = `<div class="kartu-judul"><h2>Minggu ini</h2>${badgeSumber(j)}</div>${isi}`;
  },

  // ---------- Mata kuliah ----------
  async matkul() {
    const p = await profil();
    konten.innerHTML = `<div class="judul-hal"><h1>Mata Kuliah</h1><p>Mata kuliah kelas ${esc(p.kelas)} semester ini beserta dosen pengampunya.</p></div>
      <div class="kartu"><div class="memuat">Memuat mata kuliah…</div></div>`;
    const j = await jadwal();
    const mk = new Map();
    j.data.forEach((s) => {
      const ada = mk.get(s.kode) || { ...s, dosen: new Set(), pertemuan: [] };
      if (s.dosen) ada.dosen.add(s.dosen);
      ada.pertemuan.push(`${s.hari} ${s.mulai}`);
      mk.set(s.kode, ada);
    });
    const daftar = [...mk.values()].sort((a, b) => a.matkul.localeCompare(b.matkul));
    const total = daftar.reduce((a, m) => a + (m.sks || 0), 0);
    konten.querySelector('.kartu').innerHTML = `
      <div class="kartu-judul"><h2>${daftar.length} mata kuliah • ${total} SKS</h2>${badgeSumber(j)}</div>
      <div class="tabel-wrap"><table>
        <thead><tr><th>Kode</th><th>Mata Kuliah</th><th>SKS</th><th>Dosen Pengampu</th><th>Jadwal</th></tr></thead>
        <tbody>${daftar.map((m) => `<tr><td class="mono">${tampil(m.kode)}</td><td><b>${tampil(m.matkul)}</b></td>
          <td>${tampil(m.sks)}</td><td>${tampil([...m.dosen].join(', '))}</td><td>${esc(m.pertemuan.join(', '))}</td></tr>`).join('')
          || '<tr><td colspan="5" class="kosong">Belum ada data mata kuliah.</td></tr>'}</tbody>
        <tfoot><tr><td colspan="2">Total</td><td>${total}</td><td colspan="2"></td></tr></tfoot>
      </table></div>`;
  },

  // ---------- Teman sekelas ----------
  async teman() {
    const p = await profil();
    konten.innerHTML = `<div class="judul-hal"><h1>Teman Sekelas</h1><p>Mahasiswa di kelas ${esc(p.kelas)}.</p></div>
      <div class="kartu"><div class="memuat">Memuat…</div></div>`;
    const t = await teman();
    const kartu = konten.querySelector('.kartu');
    kartu.innerHTML = `<div class="kartu-judul"><h2>${t.length} mahasiswa</h2><span class="sumber sendiri">API Mahasiswa</span></div>
      <input class="input" id="cariTeman" placeholder="Cari nama atau NIM…" style="margin-bottom:14px">
      <div class="teman-grid" id="daftarTeman"></div>`;
    const gambar = (kata) => {
      const k = kata.toLowerCase();
      const hasil = t.filter((m) => m.nama.toLowerCase().includes(k) || m.nim.includes(k));
      $('daftarTeman').innerHTML = hasil.map((m) => {
        const w = m.nama.trim().split(/\s+/);
        return `<div class="teman${m.nim === p.nim ? ' saya' : ''}">
          <div class="avatar">${esc((w[0][0] + (w[1] ? w[1][0] : '')).toUpperCase())}</div>
          <div><b>${esc(m.nama)}${m.nim === p.nim ? ' (Anda)' : ''}</b><span class="mono">${esc(m.nim)}</span><br>
          <span>${m.jenis_kelamin === 'L' ? 'Laki-laki' : 'Perempuan'} • ${esc(m.email)}</span></div></div>`;
      }).join('') || '<div class="kosong">Tidak ditemukan.</div>';
    };
    gambar('');
    $('cariTeman').addEventListener('input', (e) => gambar(e.target.value.trim()));
  },

  // ---------- Organisasi ----------
  async organisasi() {
    konten.innerHTML = `<div class="judul-hal"><h1>Organisasi</h1><p>Organisasi kemahasiswaan yang Anda ikuti.</p></div>
      <div class="kartu"><div class="memuat">Memuat…</div></div>`;
    const o = await organisasi();
    konten.querySelector('.kartu').innerHTML = `<div class="kartu-judul"><h2>Keanggotaan</h2>${badgeSumber(o)}</div>
      ${o.data.length ? `<div class="tabel-wrap"><table><thead><tr><th>Organisasi</th><th>Jabatan</th><th>Periode</th></tr></thead>
        <tbody>${o.data.map((x) => `<tr><td><b>${tampil(x.organisasi)}</b></td><td>${tampil(x.jabatan)}</td><td>${tampil(x.periode)}</td></tr>`).join('')}</tbody></table></div>`
        : '<div class="kosong">Anda belum tercatat sebagai anggota organisasi mana pun.</div>'}`;
  },

  // ---------- Akun ----------
  async akun() {
    const p = await profil();
    konten.innerHTML = `
      <div class="judul-hal"><h1>Akun</h1><p>Login sebagai <b>${esc(p.nim)}</b> (${esc(p.nama)}).</p></div>
      ${infoPasswordAwal()}
      <div class="kartu" style="max-width:560px">
        <div class="kartu-judul"><h2>Ganti Password</h2></div>
        <div id="pesanAkun"></div>
        <form id="formPassword" class="form-grid" novalidate>
          ${inputForm('password_lama', 'Password Lama', '', { tipe: 'password', full: 1 })}
          ${inputForm('password_baru', 'Password Baru', '', { tipe: 'password', full: 1, hint: 'Minimal 8 karakter.' })}
          ${inputForm('konfirmasi_password', 'Ulangi Password Baru', '', { tipe: 'password', full: 1 })}
        </form>
        <div class="aksi"><button class="btn btn-utama" id="btnSimpanPw" type="button">Simpan Password</button></div>
      </div>`;
    $('btnSimpanPw').addEventListener('click', async () => {
      const data = bacaForm('formPassword');
      bersihkanError('formPassword');
      if (data.password_baru.length < 8) return tandaiError('formPassword', { password_baru: 'Password baru minimal 8 karakter' });
      if (data.password_baru !== data.konfirmasi_password) return tandaiError('formPassword', { konfirmasi_password: 'Konfirmasi tidak sama dengan password baru' });
      await kirimDenganTombol($('btnSimpanPw'), async () => {
        const r = await api('PUT', '/akun/password', data);
        if (r.kode === 200) {
          localStorage.setItem('portal_password_awal', '0');
          await HALAMAN.akun();
          $('pesanAkun').innerHTML = '<div class="info hijau">✅ Password berhasil diganti. Gunakan password baru saat login berikutnya.</div>';
        } else {
          tandaiError('formPassword', r.json.errors || {});
          $('pesanAkun').innerHTML = `<div class="info merah">${esc(r.json.message || 'Gagal mengganti password')}</div>`;
        }
      });
    });
  },
};

// ---------- Edit profil ----------
const FIELD_DAFTAR = ['minat_bakat', 'keahlian', 'bahasa', 'hobi', 'makanan_favorit', 'genre_musik'];

async function halamanEditProfil() {
  konten.innerHTML = '<div class="memuat">Memuat formulir…</div>';
  const [p, agama, suku] = await Promise.all([profil(true), referensi('/agama'), referensi('/suku')]);
  const idDari = (daftar, nama) => (daftar.find((x) => x.nama === nama) || {}).id || '';
  const daftarHint = 'Pisahkan dengan koma, cth. Membaca, Futsal';
  konten.innerHTML = `
    <div class="judul-hal"><h1>Edit Profil</h1>
      <p>NIM, nama, kelas, angkatan, status akademik, dan email kampus hanya bisa diubah admin. Hubungi admin jika ada yang keliru.</p></div>
    <div id="pesanEdit"></div>
    <form id="formProfil" novalidate>
      <div class="kartu"><div class="kartu-judul"><h2>Data Pribadi</h2></div><div class="form-grid">
        ${pilihanForm('jenis_kelamin', 'Jenis Kelamin', [['L', 'Laki-laki'], ['P', 'Perempuan']], p.jenis_kelamin)}
        ${inputForm('tempat_lahir', 'Tempat Lahir', p.tempat_lahir)}
        ${inputForm('tanggal_lahir', 'Tanggal Lahir', p.tanggal_lahir ? String(p.tanggal_lahir).slice(0, 10) : '', { tipe: 'date', hint: 'Mengubah tanggal lahir tidak mengubah password Anda.' })}
        ${pilihanForm('agama_id', 'Agama', agama.map((a) => [a.id, a.nama]), idDari(agama, p.agama))}
        ${pilihanForm('suku_id', 'Suku', suku.map((x) => [x.id, x.nama]), idDari(suku, p.suku), '-- pilih --')}
        ${inputForm('cita_cita', 'Cita-cita', p.cita_cita)}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Kontak & Alamat</h2></div><div class="form-grid">
        ${inputForm('no_telepon', 'No. Telepon', p.no_telepon, { hint: '10–14 digit angka, tanpa spasi atau +' })}
        ${inputForm('alamat_ktp', 'Alamat KTP', p.alamat_ktp, { full: 1, hint: 'Format: Jl. ..., Kec. ..., Kota/Kab. ..., Provinsi' })}
        ${inputForm('alamat_domisili', 'Alamat Domisili', p.alamat_domisili, { full: 1, hint: 'Tempat tinggal saat kuliah. Format sama seperti alamat KTP.' })}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Orang Tua / Wali</h2></div><div class="form-grid">
        ${inputForm('nama_orang_tua', 'Nama Orang Tua / Wali', p.nama_orang_tua)}
        ${inputForm('no_telepon_orang_tua', 'No. Telepon Orang Tua', p.no_telepon_orang_tua, { hint: '10–14 digit angka' })}
        ${inputForm('alamat_orang_tua', 'Alamat Orang Tua', p.alamat_orang_tua, { full: 1 })}
      </div></div>
      <div class="kartu"><div class="kartu-judul"><h2>Minat & Keahlian</h2></div><div class="form-grid">
        ${inputForm('minat_bakat', 'Minat & Bakat', p.minat_bakat, { hint: daftarHint })}
        ${inputForm('keahlian', 'Keahlian (Skill)', p.keahlian, { hint: daftarHint })}
        ${inputForm('bahasa', 'Bahasa yang Dikuasai', p.bahasa, { hint: daftarHint })}
        ${inputForm('hobi', 'Hobi', p.hobi, { hint: daftarHint })}
        ${inputForm('makanan_favorit', 'Makanan Favorit', p.makanan_favorit, { hint: daftarHint })}
        ${inputForm('genre_musik', 'Genre Musik', p.genre_musik, { hint: daftarHint })}
      </div></div>
    </form>
    <div class="aksi">
      <button class="btn btn-garis" id="btnBatal" type="button">Batal</button>
      <button class="btn btn-utama" id="btnSimpan" type="button">Simpan Perubahan</button>
    </div>`;
  $('btnBatal').addEventListener('click', () => HALAMAN.profil());
  $('btnSimpan').addEventListener('click', async () => {
    const data = bacaForm('formProfil');
    bersihkanError('formProfil');
    const salah = {};
    if (data.no_telepon && !/^\d{10,14}$/.test(data.no_telepon)) salah.no_telepon = 'No. telepon harus 10–14 digit angka';
    if (data.no_telepon_orang_tua && !/^\d{10,14}$/.test(data.no_telepon_orang_tua)) salah.no_telepon_orang_tua = 'No. telepon harus 10–14 digit angka';
    if (!data.nama_orang_tua && (data.no_telepon_orang_tua || data.alamat_orang_tua)) salah.nama_orang_tua = 'Isi nama orang tua/wali terlebih dahulu';
    if (!data.tempat_lahir) salah.tempat_lahir = 'Tempat lahir wajib diisi';
    if (!data.tanggal_lahir) salah.tanggal_lahir = 'Tanggal lahir wajib diisi';
    if (Object.keys(salah).length) {
      tandaiError('formProfil', salah);
      $('pesanEdit').innerHTML = '<div class="info merah">Periksa kembali isian yang ditandai merah.</div>';
      return;
    }
    FIELD_DAFTAR.forEach((k) => { data[k] = data[k].split(',').map((x) => x.trim()).filter(Boolean); });
    data.agama_id = Number(data.agama_id);
    if (data.suku_id) data.suku_id = Number(data.suku_id); else delete data.suku_id;
    data.version = Number(p.version); // optimistic locking: tolak jika data sudah diubah orang lain

    await kirimDenganTombol($('btnSimpan'), async () => {
      const r = await api('PUT', '/profil', data);
      if (r.kode === 200) {
        cache.profil = r.json.data;
        isiHeader(cache.profil);
        await HALAMAN.profil();
        konten.insertAdjacentHTML('afterbegin', '<div class="info hijau">✅ Profil berhasil diperbarui. Perubahan langsung terlihat oleh admin.</div>');
      } else if (r.kode === 409) {
        $('pesanEdit').innerHTML = `<div class="info merah">Data Anda baru saja diubah di tempat lain (misalnya oleh admin).
          <a href="#" id="muatUlang">Muat ulang data terbaru</a>, lalu ulangi perubahan Anda.</div>`;
        $('muatUlang').addEventListener('click', (e) => { e.preventDefault(); halamanEditProfil(); });
      } else {
        tandaiError('formProfil', r.json.errors || {});
        $('pesanEdit').innerHTML = `<div class="info merah">${esc(r.json.message || 'Gagal menyimpan')}</div>`;
      }
      window.scrollTo(0, 0);
    });
  });
}

const cacheReferensi = {};
async function referensi(path) {
  if (!cacheReferensi[path]) {
    const r = await api('GET', path);
    cacheReferensi[path] = r.kode === 200 ? r.json.data : [];
  }
  return cacheReferensi[path];
}

// ---------- Pembantu tampilan ----------
function kartuSesi(s) {
  return `<div class="sesi">
    <div class="jam">${esc(s.mulai)}–${esc(s.selesai)}</div>
    <div class="mk"><b>${tampil(s.matkul)}</b><span>${tampil(s.dosen)}${s.sks ? ' • ' + esc(s.sks) + ' SKS' : ''}</span></div>
    <div class="ruang">${tampil(s.ruang)}</div>
  </div>`;
}
function inputForm(nama, label, nilai, o = {}) {
  return `<div class="${o.full ? 'full' : ''}">
    <label class="lbl" for="in_${nama}">${label}</label>
    <input class="input" id="in_${nama}" name="${nama}" type="${o.tipe || 'text'}" value="${esc(nilai || '')}">
    ${o.hint ? `<div class="hint">${o.hint}</div>` : ''}
    <div class="err" data-err="${nama}"></div>
  </div>`;
}
function pilihanForm(nama, label, opsi, terpilih, kosong) {
  const daftar = (kosong ? `<option value="">${kosong}</option>` : '') + opsi.map(([v, t]) =>
    `<option value="${esc(v)}"${String(v) === String(terpilih) ? ' selected' : ''}>${esc(t)}</option>`).join('');
  return `<div><label class="lbl" for="in_${nama}">${label}</label>
    <select class="input" id="in_${nama}" name="${nama}">${daftar}</select>
    <div class="err" data-err="${nama}"></div></div>`;
}
function bacaForm(id) {
  const data = {};
  new FormData($(id)).forEach((v, k) => { data[k] = String(v).trim(); });
  return data;
}
function bersihkanError(id) { $(id).querySelectorAll('.err').forEach((e) => { e.textContent = ''; }); }
function tandaiError(id, errors) {
  Object.entries(errors).forEach(([k, v]) => {
    const el = $(id).querySelector(`[data-err="${k}"]`);
    if (el) el.textContent = v;
  });
}
async function kirimDenganTombol(btn, fn) {
  const teks = btn.textContent;
  btn.disabled = true; btn.textContent = 'Menyimpan…';
  try { await fn(); } finally { btn.disabled = false; btn.textContent = teks; }
}

// ---------- Navigasi ----------
async function render() {
  const hal = (location.hash || '#beranda').slice(1);
  const fungsi = HALAMAN[hal] || HALAMAN.beranda;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('aktif', a.dataset.hal === (HALAMAN[hal] ? hal : 'beranda')));
  window.scrollTo(0, 0);
  try {
    await fungsi();
  } catch (e) {
    if (e.message === '401') return;
    konten.innerHTML = `<div class="info merah">Gagal memuat halaman: ${esc(e.message)}.
      <a href="#" onclick="location.reload();return false">Coba lagi</a></div>`;
  }
}
window.addEventListener('hashchange', render);
// klik menu yang sedang aktif (mis. dari halaman Edit Profil) tetap memuat ulang halamannya
document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', () => {
  if (a.getAttribute('href') === (location.hash || '#beranda')) render();
}));
render();

/* =====================================================================
 * CRUD MAHASISWA (Web Admin)
 * Tambah, edit, pindah kelas, dan hapus mahasiswa lewat Web API.
 * Dimuat SETELAH script utama di mahasiswa.html, jadi bisa memakai
 * el(), state, muatSemua(), dan bukaDetail() dari sana.
 *
 * Hak akses mengikuti API:
 *   admin    : tambah, edit, pindah kelas, hapus
 *   operator : tambah, edit, pindah kelas
 *   lainnya  : hanya lihat (tombol tidak ditampilkan)
 * ===================================================================== */
(function () {
  // ---------- Role dari token JWT ----------
  function bacaToken() {
    try {
      const t = localStorage.getItem('token') || '';
      let b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      return JSON.parse(atob(b64));
    } catch (e) {
      return {};
    }
  }
  const role = bacaToken().role || '';
  const bolehUbah = role === 'admin' || role === 'operator';
  const bolehHapus = role === 'admin';
  if (!bolehUbah) {
    // Web Admin hanya untuk admin & operator (sesi lama role lain diarahkan ke login)
    localStorage.removeItem('token');
    location.href = 'login.html';
    return;
  }

  // ---------- Pemanggil API untuk POST / PUT / PATCH / DELETE ----------
  async function kirim(method, path, body) {
    const res = await fetch('/api/v1' + path, {
      method,
      headers: {
        Authorization: 'Bearer ' + localStorage.getItem('token'),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 401) {
      localStorage.removeItem('token');
      location.href = 'login.html';
      return { kode: 401, json: null };
    }
    let json = null;
    try { json = await res.json(); } catch (e) {}
    return { kode: res.status, json };
  }

  // ---------- Data referensi untuk dropdown ----------
  const ref = { kelas: [], agama: [], suku: [] };
  async function muatReferensi() {
    if (ref.kelas.length) return;
    const [k, a, s] = await Promise.all([api('/kelas'), api('/agama'), api('/suku')]);
    ref.kelas = (k && k.data) || [];
    ref.agama = (a && a.data) || [];
    ref.suku = (s && s.data) || [];
  }

  // ---------- Muat ulang tabel setelah data berubah ----------
  async function muatUlangTabel() {
    const sel = el('kelas');
    const dipilih = sel.value;
    while (sel.options.length > 1) sel.remove(1);
    state.semuaData = [];
    state.siapSemua = false;
    await muatSemua();
    sel.value = dipilih;
    renderTabel();
  }

  // ---------- Gaya tambahan ----------
  const css = document.createElement('style');
  css.textContent = `
    .btn-tambah { padding: 10px 18px; background: #16a34a; color: #fff; border: none;
      border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; margin-left: auto; }
    .btn-tambah:hover { background: #15803d; }
    .btn-danger { padding: 10px 18px; background: #dc2626; color: #fff; border: none;
      border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .btn-danger:hover { background: #b91c1c; }
    .aksi-kiri { display: flex; gap: 8px; margin-right: auto; flex-wrap: wrap; }
    .form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px 18px; }
    .form-grid .full { grid-column: 1 / -1; }
    .form-grid label { display: block; font-size: 12px; font-weight: 600; color: #475569; margin-bottom: 5px; }
    .form-grid .wajib::after { content: ' *'; color: #dc2626; }
    .form-grid select.input-field { cursor: pointer; }
    .form-hint { font-size: 11.5px; color: #64748b; margin-top: 4px; }
    .form-err { font-size: 11.5px; color: #dc2626; margin-top: 4px; min-height: 0; }
    .form-pesan { padding: 10px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 14px; display: none; }
    .form-pesan.err { display: block; background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
    .form-pesan.ok  { display: block; background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  `;
  document.head.appendChild(css);

  // ---------- Modal form (dipakai untuk tambah, edit, pindah kelas) ----------
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modalForm';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header">
        <div><h2 id="fJudul">Form Mahasiswa</h2><p id="fSub"></p></div>
        <button class="btn-close" id="fTutupX" title="Tutup">×</button>
      </div>
      <div class="modal-body">
        <div id="fPesan" class="form-pesan"></div>
        <form id="fForm" class="form-grid" novalidate></form>
      </div>
      <div class="modal-footer" style="gap:8px">
        <button class="btn-reset" id="fBatal" type="button">Batal</button>
        <button class="btn-primary" id="fSimpan" type="button">Simpan</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const tutupForm = () => modal.classList.remove('aktif');
  el('fTutupX').addEventListener('click', tutupForm);
  el('fBatal').addEventListener('click', tutupForm);
  modal.addEventListener('click', (e) => { if (e.target === modal) tutupForm(); });

  let simpanAktif = null; // fungsi simpan untuk mode yang sedang dibuka
  el('fSimpan').addEventListener('click', async () => {
    if (!simpanAktif) return;
    el('fSimpan').disabled = true;
    el('fSimpan').textContent = 'Menyimpan...';
    try { await simpanAktif(); } finally {
      el('fSimpan').disabled = false;
      el('fSimpan').textContent = 'Simpan';
    }
  });

  function pesan(teks, jenis) {
    const p = el('fPesan');
    p.className = 'form-pesan ' + (jenis || '');
    p.textContent = teks || '';
  }

  function opsi(daftar, nilaiTerpilih, kosong) {
    let html = kosong !== undefined ? `<option value="">${kosong}</option>` : '';
    daftar.forEach((o) => {
      const sel = String(o.value) === String(nilaiTerpilih) ? ' selected' : '';
      html += `<option value="${o.value}"${sel}>${o.label}</option>`;
    });
    return html;
  }

  // Definisi field form. "baru" = hanya muncul saat tambah.
  function fieldMahasiswa(d, mode) {
    const kelasOpsi = ref.kelas.map((k) => ({ value: k.id, label: k.kode }));
    const agamaOpsi = ref.agama.map((a) => ({ value: a.id, label: a.nama }));
    const sukuOpsi = ref.suku.map((s) => ({ value: s.id, label: s.nama }));
    const statusOpsi = ['Aktif', 'Tidak Aktif', 'Cuti', 'Lulus'].map((s) => ({ value: s, label: s }));
    const jkOpsi = [{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }];

    const idDari = (daftar, nama) => {
      const f = daftar.find((x) => String(x.nama || x.kode) === String(nama));
      return f ? f.id : '';
    };

    const f = [];
    if (mode === 'tambah') {
      f.push({ nama: 'nim', label: 'NIM', wajib: true, tipe: 'text', nilai: '',
        hint: '10 digit angka. 2 digit awal = tahun angkatan (cth. 24xxxxxxxx untuk 2024).' });
    }
    f.push({ nama: 'nama', label: 'Nama Lengkap', wajib: true, tipe: 'text', nilai: d.nama, full: true });
    f.push({ nama: 'jenis_kelamin', label: 'Jenis Kelamin', wajib: true, tipe: 'select',
      opsi: opsi(jkOpsi, d.jenis_kelamin, '-- pilih --') });
    f.push({ nama: 'email', label: 'Email', wajib: true, tipe: 'email', nilai: d.email,
      hint: 'Harus berakhiran @students.polmed.ac.id' });
    if (mode === 'tambah') {
      f.push({ nama: 'kelas_id', label: 'Kelas', wajib: true, tipe: 'select',
        opsi: opsi(kelasOpsi, '', '-- pilih --') });
    }
    f.push({ nama: 'angkatan', label: 'Angkatan', wajib: true, tipe: 'number', nilai: d.angkatan });
    f.push({ nama: 'status_akademik', label: 'Status Akademik', wajib: true, tipe: 'select',
      opsi: opsi(statusOpsi, d.status_akademik || 'Aktif') });
    f.push({ nama: 'tempat_lahir', label: 'Tempat Lahir', wajib: true, tipe: 'text', nilai: d.tempat_lahir });
    f.push({ nama: 'tanggal_lahir', label: 'Tanggal Lahir', wajib: true, tipe: 'date',
      nilai: d.tanggal_lahir ? String(d.tanggal_lahir).slice(0, 10) : '' });
    f.push({ nama: 'agama_id', label: 'Agama', wajib: true, tipe: 'select',
      opsi: opsi(agamaOpsi, idDari(ref.agama, d.agama), '-- pilih --') });
    f.push({ nama: 'suku_id', label: 'Suku', tipe: 'select',
      opsi: opsi(sukuOpsi, idDari(ref.suku, d.suku), '-- tidak diisi --') });
    f.push({ nama: 'no_telepon', label: 'No. Telepon', tipe: 'text', nilai: d.no_telepon,
      hint: '10–14 digit angka, tanpa spasi atau tanda +' });
    f.push({ nama: 'cita_cita', label: 'Cita-cita', tipe: 'text', nilai: d.cita_cita, full: true });

    // ----- Data turunan (disimpan ke tabel lain dalam satu transaksi) -----
    f.push({ tipe: 'judul', label: 'Alamat' });
    f.push({ nama: 'alamat_ktp', label: 'Alamat KTP', tipe: 'text', nilai: d.alamat_ktp, full: true });
    f.push({ nama: 'alamat_domisili', label: 'Alamat Domisili', tipe: 'text', nilai: d.alamat_domisili, full: true });

    f.push({ tipe: 'judul', label: 'Orang Tua / Wali' });
    f.push({ nama: 'nama_orang_tua', label: 'Nama Orang Tua', tipe: 'text', nilai: d.nama_orang_tua,
      hint: 'Wajib diisi jika mengisi no. telepon atau alamat orang tua' });
    f.push({ nama: 'no_telepon_orang_tua', label: 'No. Telepon Orang Tua', tipe: 'text', nilai: d.no_telepon_orang_tua,
      hint: '10–14 digit angka' });
    f.push({ nama: 'alamat_orang_tua', label: 'Alamat Orang Tua', tipe: 'text', nilai: d.alamat_orang_tua, full: true });

    f.push({ tipe: 'judul', label: 'Minat, Keahlian & Lainnya' });
    const hintDaftar = 'Pisahkan dengan koma, cth. Membaca, Futsal';
    f.push({ nama: 'minat_bakat', label: 'Minat & Bakat', tipe: 'text', nilai: d.minat_bakat, hint: hintDaftar });
    f.push({ nama: 'keahlian', label: 'Keahlian (Skill)', tipe: 'text', nilai: d.keahlian, hint: hintDaftar });
    f.push({ nama: 'bahasa', label: 'Bahasa yang Dikuasai', tipe: 'text', nilai: d.bahasa, hint: hintDaftar });
    f.push({ nama: 'hobi', label: 'Hobi', tipe: 'text', nilai: d.hobi, hint: hintDaftar });
    f.push({ nama: 'makanan_favorit', label: 'Makanan Favorit', tipe: 'text', nilai: d.makanan_favorit, hint: hintDaftar });
    f.push({ nama: 'genre_musik', label: 'Genre Musik', tipe: 'text', nilai: d.genre_musik, hint: hintDaftar });
    return f;
  }

  function gambarForm(fields) {
    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    el('fForm').innerHTML = fields.map((f) => {
      if (f.tipe === 'judul') return `<div class="full sec-title" style="margin:8px 0 0">${f.label}</div>`;
      const input = f.tipe === 'select'
        ? `<select class="input-field" name="${f.nama}">${f.opsi}</select>`
        : `<input class="input-field" name="${f.nama}" type="${f.tipe}" value="${esc(f.nilai)}">`;
      return `<div class="${f.full ? 'full' : ''}">
        <label class="${f.wajib ? 'wajib' : ''}">${f.label}</label>${input}
        ${f.hint ? `<div class="form-hint">${f.hint}</div>` : ''}
        <div class="form-err" data-err="${f.nama}"></div>
      </div>`;
    }).join('');
  }

  const DAFTAR = ['minat_bakat', 'keahlian', 'bahasa', 'hobi', 'makanan_favorit', 'genre_musik'];
  const TEKS_OPSIONAL = ['no_telepon', 'cita_cita', 'alamat_ktp', 'alamat_domisili',
    'nama_orang_tua', 'no_telepon_orang_tua', 'alamat_orang_tua'];

  // mode 'tambah': isian kosong tidak dikirim.
  // mode 'edit'  : isian kosong dikirim sebagai "" / [] agar data lama ikut dikosongkan.
  function bacaForm(mode) {
    const data = {};
    new FormData(el('fForm')).forEach((v, k) => { data[k] = String(v).trim(); });
    ['kelas_id', 'agama_id', 'suku_id', 'angkatan'].forEach((k) => {
      if (data[k] !== undefined && data[k] !== '') data[k] = Number(data[k]);
    });
    if (data.suku_id === '') delete data.suku_id; // suku tidak bisa dikosongkan lewat API
    DAFTAR.forEach((k) => {
      if (data[k] === undefined) return;
      data[k] = data[k].split(',').map((x) => x.trim()).filter(Boolean);
      if (mode !== 'edit' && data[k].length === 0) delete data[k];
    });
    if (mode !== 'edit') {
      TEKS_OPSIONAL.forEach((k) => { if (data[k] === '') delete data[k]; });
    }
    return data;
  }

  function tampilkanError(hasil) {
    document.querySelectorAll('#fForm .form-err').forEach((e) => { e.textContent = ''; });
    const j = hasil.json || {};
    if (j.errors) {
      Object.entries(j.errors).forEach(([k, v]) => {
        const box = document.querySelector(`#fForm [data-err="${k}"]`);
        if (box) box.textContent = v;
      });
    }
    let teks = j.message || ('Gagal menyimpan (HTTP ' + hasil.kode + ')');
    if (hasil.kode === 403) teks = 'Akun Anda tidak punya hak untuk aksi ini.';
    if (hasil.kode === 422 && !j.errors && teks.includes('melanggar aturan')) {
      teks += ' Periksa format email (@students.polmed.ac.id), NIM (2 digit awal = angkatan), dan no. telepon.';
    }
    pesan(teks, 'err');
  }

  function bukaForm(judul, sub, fields, onSimpan) {
    el('fJudul').textContent = judul;
    el('fSub').textContent = sub || '';
    pesan('');
    gambarForm(fields);
    simpanAktif = onSimpan;
    modal.classList.add('aktif');
  }

  // ---------- TAMBAH ----------
  async function formTambah() {
    await muatReferensi();
    bukaForm('Tambah Mahasiswa', 'Kolom bertanda * wajib diisi', fieldMahasiswa({}, 'tambah'), async () => {
      const data = bacaForm('tambah');
      const hasil = await kirim('POST', '/mahasiswa', data);
      if (hasil.kode === 201) {
        tutupForm();
        await muatUlangTabel();
        bukaDetail(data.nim, data.nama);
      } else {
        tampilkanError(hasil);
      }
    });
  }

  // ---------- EDIT ----------
  async function formEdit(nim) {
    await muatReferensi();
    const json = await api('/mahasiswa/' + encodeURIComponent(nim));
    if (!json || json.status !== 'success') { alert((json && json.message) || 'Gagal memuat data'); return; }
    const d = json.data;
    bukaForm('Edit Mahasiswa', 'NIM ' + d.nim + ' • versi data ' + d.version, fieldMahasiswa(d, 'edit'), async () => {
      const data = bacaForm('edit');
      data.version = Number(d.version); // optimistic locking (K7)
      const hasil = await kirim('PUT', '/mahasiswa/' + encodeURIComponent(nim), data);
      if (hasil.kode === 200) {
        tutupForm();
        await muatUlangTabel();
        bukaDetail(nim, data.nama);
      } else if (hasil.kode === 409) {
        pesan('Data ini baru saja diubah oleh pengguna lain. Tutup form, buka ulang detail, lalu edit lagi.', 'err');
      } else {
        tampilkanError(hasil);
      }
    });
  }

  // ---------- PINDAH KELAS ----------
  async function formPindahKelas(nim, kelasSekarang) {
    await muatReferensi();
    const kelasOpsi = ref.kelas.map((k) => ({ value: k.id, label: k.kode }));
    const idSekarang = (ref.kelas.find((k) => k.kode === kelasSekarang) || {}).id;
    bukaForm('Pindah Kelas', 'NIM ' + nim + ' • kelas sekarang ' + (kelasSekarang || '-'), [
      { nama: 'kelas_id', label: 'Kelas Baru', wajib: true, tipe: 'select', full: true,
        opsi: opsi(kelasOpsi, idSekarang) },
    ], async () => {
      const data = bacaForm();
      if (data.kelas_id === idSekarang) { pesan('Pilih kelas yang berbeda dari kelas sekarang.', 'err'); return; }
      const hasil = await kirim('PATCH', '/mahasiswa/' + encodeURIComponent(nim) + '/kelas', data);
      if (hasil.kode === 200) {
        tutupForm();
        await muatUlangTabel();
        bukaDetail(nim);
      } else {
        tampilkanError(hasil);
      }
    });
  }

  // ---------- HAPUS ----------
  async function hapus(nim, nama) {
    const ok = confirm('Hapus mahasiswa ' + (nama || nim) + ' (NIM ' + nim + ')?\n\n' +
      'Alamat, data orang tua, hobi, keahlian, dll. milik mahasiswa ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.');
    if (!ok) return;
    const hasil = await kirim('DELETE', '/mahasiswa/' + encodeURIComponent(nim));
    if (hasil.kode === 200) {
      el('modalDetail').classList.remove('aktif');
      await muatUlangTabel();
      alert('Mahasiswa ' + (nama || nim) + ' berhasil dihapus.');
    } else {
      alert((hasil.json && hasil.json.message) || ('Gagal menghapus (HTTP ' + hasil.kode + ')'));
    }
  }

  // ---------- Tombol "Tambah Mahasiswa" di toolbar ----------
  const btnTambah = document.createElement('button');
  btnTambah.className = 'btn-tambah';
  btnTambah.textContent = '+ Tambah Mahasiswa';
  btnTambah.addEventListener('click', formTambah);
  document.querySelector('#panelMahasiswa .toolbar').appendChild(btnTambah);

  // ---------- Tombol Edit / Pindah Kelas / Hapus di modal detail ----------
  const aksi = document.createElement('div');
  aksi.className = 'aksi-kiri';
  aksi.innerHTML = `
    <button class="btn-primary" id="dEdit" type="button">Edit</button>
    <button class="btn-secondary" id="dPindah" type="button">Pindah Kelas</button>
    ${bolehHapus ? '<button class="btn-danger" id="dHapus" type="button">Hapus</button>' : ''}`;
  const footerDetail = document.querySelector('#modalDetail .modal-footer');
  footerDetail.insertBefore(aksi, footerDetail.firstChild);

  // Catat mahasiswa yang sedang dibuka di modal detail
  const aktif = { nim: null, nama: null };
  const bukaDetailAsli = bukaDetail;
  bukaDetail = function (nim, nama) {
    aktif.nim = nim;
    aktif.nama = nama;
    return bukaDetailAsli(nim, nama);
  };

  el('dEdit').addEventListener('click', () => formEdit(aktif.nim));
  el('dPindah').addEventListener('click', () => {
    const m = state.semuaData.find((x) => x.nim === aktif.nim) || {};
    formPindahKelas(aktif.nim, m.kelas);
  });
  if (bolehHapus) {
    el('dHapus').addEventListener('click', () => {
      const m = state.semuaData.find((x) => x.nim === aktif.nim) || {};
      hapus(aktif.nim, m.nama || aktif.nama);
    });
  }
})();
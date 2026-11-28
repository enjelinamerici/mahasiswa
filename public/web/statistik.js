/* =====================================================================
 * STATISTIK MAHASISWA (Web Admin)
 * Menambah tab "Statistik" di mahasiswa.html. Data dari GET /api/v1/statistik.
 * Setiap baris grafik bisa diklik untuk melihat siapa saja mahasiswanya
 * (GET /api/v1/statistik/mahasiswa?kategori=...&nilai=...).
 * ===================================================================== */
(function () {
  const token = localStorage.getItem('token');
  if (!token) return;
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function ambil(path) {
    const res = await fetch('/api/v1' + path, { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 401) { localStorage.removeItem('token'); location.href = 'login.html'; throw new Error('401'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'HTTP ' + res.status);
    return json.data;
  }

  // ---------- Gaya ----------
  const css = document.createElement('style');
  css.textContent = `
    .st-filter { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .st-filter select { padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 10px; font: inherit; background: #f8fafc; min-width: 160px; }
    .st-kpi { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 18px; }
    .st-kpi-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
    .st-kpi-item small { color: #64748b; font-weight: 600; font-size: 12.5px; }
    .st-kpi-item b { display: block; font-size: 28px; color: #0f172a; margin: 2px 0; letter-spacing: -.5px; }
    .st-kpi-item span { font-size: 12.5px; color: #64748b; }
    .st-kpi-item.klik { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
    .st-kpi-item.klik:hover { border-color: #93c5fd; box-shadow: 0 4px 14px rgba(37,99,235,.12); }
    .st-kpi-item .lihat { color: #2563eb; font-weight: 600; }
    .st-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 16px; }
    .st-kartu { background: #fff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 20px; box-shadow: 0 1px 3px rgba(15,23,42,.04); }
    .st-kartu h3 { font-size: 15px; color: #0f172a; margin-bottom: 2px; }
    .st-kartu p.ket { font-size: 12.5px; color: #64748b; margin-bottom: 12px; }
    .st-bar { display: grid; grid-template-columns: minmax(110px, 38%) 1fr 92px; gap: 10px; align-items: center;
      padding: 6px 8px; border-radius: 8px; cursor: pointer; font-size: 13.5px; }
    .st-bar:hover { background: #eff6ff; }
    .st-bar .nm { color: #334155; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .st-bar .trek { height: 10px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
    .st-bar .isi { height: 100%; background: linear-gradient(90deg, #2563eb, #4f46e5); border-radius: 99px; }
    .st-bar .ang { text-align: right; color: #0f172a; font-weight: 700; white-space: nowrap; }
    .st-bar .ang small { color: #94a3b8; font-weight: 600; }
    .st-catatan { font-size: 12px; color: #94a3b8; margin-top: 8px; }
    .st-kosong { color: #94a3b8; font-size: 13px; padding: 8px; }
    .st-daftar td, .st-daftar th { padding: 9px 10px; font-size: 13.5px; border-bottom: 1px solid #f1f5f9; text-align: left; }
    .st-daftar th { font-size: 11.5px; text-transform: uppercase; color: #94a3b8; letter-spacing: .4px; }
  `;
  document.head.appendChild(css);

  // ---------- Tab & panel ----------
  const btnTab = document.createElement('button');
  btnTab.className = 'tab-btn';
  btnTab.dataset.target = 'panelStatistik';
  btnTab.textContent = 'Statistik';
  document.querySelector('.nav-tabs').appendChild(btnTab);

  const panel = document.createElement('section');
  panel.id = 'panelStatistik';
  panel.className = 'tab-panel';
  panel.innerHTML = `
    <div class="page-header">
      <div>
        <h1>Statistik Mahasiswa</h1>
        <p>Klik baris mana pun untuk melihat daftar mahasiswanya.</p>
      </div>
      <div class="st-filter">
        <select id="stKelas"><option value="">Semua Kelas</option></select>
        <select id="stAngkatan"><option value="">Semua Angkatan</option></select>
      </div>
    </div>
    <div id="stIsi"><div class="st-kosong">Memuat statistik…</div></div>`;
  document.querySelector('main.container').appendChild(panel);

  btnTab.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('aktif'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('aktif'));
    btnTab.classList.add('aktif');
    panel.classList.add('aktif');
    if (!sudahDimuat) muat();
  });

  // ---------- Modal daftar mahasiswa ----------
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.innerHTML = `
    <div class="modal-box">
      <div class="modal-header"><div><h2 id="stJudul">Daftar Mahasiswa</h2><p id="stSub"></p></div>
        <button class="btn-close" id="stTutup" title="Tutup">×</button></div>
      <div class="modal-body" id="stDaftar"></div>
    </div>`;
  document.body.appendChild(modal);
  const tutup = () => modal.classList.remove('aktif');
  $('stTutup').addEventListener('click', tutup);
  modal.addEventListener('click', (e) => { if (e.target === modal) tutup(); });

  const filterQuery = () => {
    const q = new URLSearchParams();
    if ($('stKelas').value) q.set('kelas', $('stKelas').value);
    if ($('stAngkatan').value) q.set('angkatan', $('stAngkatan').value);
    return q;
  };

  async function bukaDaftar(kategori, nilai, judul) {
    $('stJudul').textContent = judul;
    $('stSub').textContent = 'Memuat…';
    $('stDaftar').innerHTML = '';
    modal.classList.add('aktif');
    try {
      const q = filterQuery();
      q.set('kategori', kategori);
      q.set('nilai', nilai);
      const d = await ambil('/statistik/mahasiswa?' + q);
      $('stSub').textContent = d.jumlah + ' mahasiswa';
      $('stDaftar').innerHTML = `<div class="table-wrap"><table class="st-daftar">
        <thead><tr><th>NIM</th><th>Nama</th><th>Kelas</th><th>Asal → Domisili</th><th></th></tr></thead>
        <tbody>${d.items.map((m) => `<tr>
          <td class="nim-text">${esc(m.nim)}</td><td><b>${esc(m.nama)}</b></td><td>${esc(m.kelas)}</td>
          <td>${esc(m.kota_asal || '-')} → ${esc(m.kota_domisili || '-')}</td>
          <td><button class="btn-reset" data-nim="${esc(m.nim)}" data-nama="${esc(m.nama)}" type="button">Detail</button></td>
        </tr>`).join('') || '<tr><td colspan="5" class="st-kosong">Tidak ada data.</td></tr>'}</tbody></table></div>`;
      $('stDaftar').querySelectorAll('button[data-nim]').forEach((b) => b.addEventListener('click', () => {
        tutup();
        if (typeof bukaDetail === 'function') bukaDetail(b.dataset.nim, b.dataset.nama);
      }));
    } catch (e) {
      $('stSub').textContent = 'Gagal memuat: ' + e.message;
    }
  }

  // ---------- Komponen tampilan ----------
  const LABEL = {
    jenis_kelamin: (v) => (v === 'L' ? 'Laki-laki' : v === 'P' ? 'Perempuan' : v),
  };

  function kartuBar(kategori, judul, ket, s, opsi = {}) {
    const data = (s && s.data) || [];
    if (!data.length && opsi.sembunyikanJikaKosong) return '';
    const maks = Math.max(1, ...data.map((d) => d.persen));
    const fmt = LABEL[kategori] || ((v) => v);
    const baris = data.map((d) => `
      <div class="st-bar" data-kategori="${kategori}" data-nilai="${esc(d.label)}" data-judul="${esc(judul + ': ' + fmt(d.label))}">
        <div class="nm" title="${esc(fmt(d.label))}">${esc(fmt(d.label))}</div>
        <div class="trek"><div class="isi" style="width:${(d.persen / maks) * 100}%"></div></div>
        <div class="ang">${d.jumlah} <small>(${d.persen}%)</small></div>
      </div>`).join('');
    const catatan = [];
    if (s && s.jumlah_jenis > data.length) catatan.push(`Menampilkan ${data.length} teratas dari ${s.jumlah_jenis}.`);
    if (s && s.tidak_diisi) catatan.push(`${s.tidak_diisi} mahasiswa belum mengisi.`);
    return `<div class="st-kartu"><h3>${judul}</h3><p class="ket">${ket}</p>
      ${baris || '<div class="st-kosong">Belum ada data.</div>'}
      ${catatan.length ? `<div class="st-catatan">${catatan.join(' ')}</div>` : ''}</div>`;
  }

  function kpi(judul, nilai, ket, aksi) {
    return `<div class="st-kpi-item${aksi ? ' klik' : ''}" ${aksi ? `data-kategori="${aksi[0]}" data-nilai="${aksi[1]}" data-judul="${esc(aksi[2])}"` : ''}>
      <small>${judul}</small><b>${nilai}</b><span>${ket}${aksi ? ' • <span class="lihat">lihat siapa →</span>' : ''}</span></div>`;
  }

  // ---------- Muat & gambar ----------
  let sudahDimuat = false;
  async function muat() {
    sudahDimuat = true;
    $('stIsi').innerHTML = '<div class="st-kosong">Memuat statistik…</div>';
    try {
      const d = await ambil('/statistik?' + filterQuery());

      // isi pilihan filter sekali saja
      if ($('stKelas').options.length === 1) {
        const kelas = await ambil('/kelas');
        kelas.forEach((k) => $('stKelas').add(new Option(k.kode, k.kode)));
        d.angkatan.data.map((a) => a.label).sort().reverse().forEach((a) => $('stAngkatan').add(new Option('Angkatan ' + a, a)));
      }

      const jk = Object.fromEntries(d.jenis_kelamin.data.map((x) => [x.label, x]));
      const L = jk.L || { jumlah: 0, persen: 0 };
      const P = jk.P || { jumlah: 0, persen: 0 };
      const cita = d.cita_cita.data[0];

      $('stIsi').innerHTML = `
        <div class="st-kpi">
          ${kpi('Total mahasiswa', d.total, d.filter.kelas || d.filter.angkatan ? 'sesuai filter' : 'seluruh data')}
          ${kpi('Laki-laki / Perempuan', `${L.persen}% <small style="font-size:16px;color:#94a3b8">/ ${P.persen}%</small>`, `${L.jumlah} laki-laki, ${P.jumlah} perempuan`)}
          ${kpi('Tidak tinggal bersama orang tua', d.tinggal_bersama_ortu.persen_tidak + '%', `${d.tinggal_bersama_ortu.tidak} mahasiswa`,
            ['tinggal_bersama_ortu', 'tidak', 'Tidak tinggal bersama orang tua'])}
          ${kpi('Merantau', d.merantau.persen_ya + '%', `${d.merantau.ya} mahasiswa, domisili beda kota dari KTP`,
            ['merantau', 'ya', 'Mahasiswa merantau'])}
          ${cita ? kpi('Cita-cita terbanyak', `<span style="font-size:20px;line-height:1.25;display:block;margin:6px 0 4px">${esc(cita.label)}</span>`, `${cita.jumlah} mahasiswa (${cita.persen}%)`, ['cita_cita', cita.label, 'Cita-cita: ' + cita.label]) : ''}
        </div>
        <div class="st-grid">
          ${kartuBar('kota_asal', 'Asal daerah', 'Kota/kabupaten dari alamat KTP', d.kota_asal)}
          ${kartuBar('kota_domisili', 'Kota domisili', 'Tempat tinggal saat kuliah', d.kota_domisili)}
          ${kartuBar('cita_cita', 'Cita-cita', 'Persentase mahasiswa dengan cita-cita yang sama', d.cita_cita)}
          ${kartuBar('kelas', 'Sebaran kelas', 'Jumlah mahasiswa per kelas', d.kelas)}
          ${kartuBar('angkatan', 'Angkatan', 'Jumlah mahasiswa per angkatan', d.angkatan)}
          ${kartuBar('jenis_kelamin', 'Jenis kelamin', '', d.jenis_kelamin)}
          ${kartuBar('agama', 'Agama', '', d.agama)}
          ${kartuBar('suku', 'Suku', '', d.suku, { sembunyikanJikaKosong: true })}
          ${kartuBar('status_akademik', 'Status akademik', '', d.status_akademik)}
          ${kartuBar('hobi', 'Hobi terpopuler', 'Satu mahasiswa bisa punya beberapa hobi', d.hobi, { sembunyikanJikaKosong: true })}
          ${kartuBar('minat_bakat', 'Minat & bakat', '', d.minat_bakat, { sembunyikanJikaKosong: true })}
          ${kartuBar('keahlian', 'Keahlian', '', d.keahlian, { sembunyikanJikaKosong: true })}
          ${kartuBar('bahasa', 'Bahasa', '', d.bahasa, { sembunyikanJikaKosong: true })}
          ${kartuBar('makanan_favorit', 'Makanan favorit', '', d.makanan_favorit, { sembunyikanJikaKosong: true })}
          ${kartuBar('genre_musik', 'Genre musik', '', d.genre_musik, { sembunyikanJikaKosong: true })}
        </div>`;

      $('stIsi').querySelectorAll('[data-kategori]').forEach((x) => x.addEventListener('click', () => {
        bukaDaftar(x.dataset.kategori, x.dataset.nilai, x.dataset.judul);
      }));
    } catch (e) {
      if (e.message !== '401') $('stIsi').innerHTML = `<div class="st-kosong">Gagal memuat statistik: ${esc(e.message)}</div>`;
    }
  }

  $('stKelas').addEventListener('change', muat);
  $('stAngkatan').addEventListener('change', muat);
})();

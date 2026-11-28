/* =====================================================================
 * INTEGRASI API KELOMPOK LAIN (Portal Mahasiswa)
 *
 * Jadwal kuliah (beserta mata kuliah & dosen pengampu) dan organisasi
 * BUKAN milik API Mahasiswa, melainkan milik API kelompok lain.
 *
 * mode 'simulasi' : memakai data contoh di bawah (ditandai jelas di layar)
 * mode 'live'     : memanggil API kelompok lain (isi url, dan token jika perlu)
 *
 * Ganti ke 'live' hanya jika API mereka sudah bisa diakses dari aplikasi
 * dan mengizinkan CORS. Fungsi normalisasi di bawah menerima beberapa
 * kemungkinan nama field, jadi format JSON mereka tidak harus sama persis.
 * ===================================================================== */
const INTEGRASI = {
  jadwal: {
    mode: 'simulasi',
    nama: 'API Jadwal',
    url: '',   // cth: 'http://192.168.1.20:8080/api/v1/jadwal'  (dipanggil dengan ?kelas=TRPL 5B)
    token: '',
  },
  ormawa: {
    mode: 'simulasi',
    nama: 'API Ormawa',
    url: '',   // cth: 'http://192.168.1.21:8080/api/v1/anggota'  (dipanggil dengan ?nim=2405181042)
    token: '',
  },
};

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat'];

// ---------- Pemanggil API kelompok lain ----------
async function ambilEksternal(cfg, query) {
  const url = cfg.url + (cfg.url.includes('?') ? '&' : '?') + new URLSearchParams(query);
  const res = await fetch(url, { headers: cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {} });
  if (!res.ok) throw new Error(cfg.nama + ' menjawab HTTP ' + res.status);
  const json = await res.json();
  const isi = json.data !== undefined ? json.data : json;
  return Array.isArray(isi) ? isi : (isi.items || isi.data || []);
}

const pilih = (o, ...kunci) => {
  for (const k of kunci) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return '';
};

function normalisasiSesi(o) {
  const mk = typeof o.mata_kuliah === 'object' && o.mata_kuliah ? o.mata_kuliah : {};
  const ds = typeof o.dosen === 'object' && o.dosen ? o.dosen : {};
  return {
    hari: String(pilih(o, 'hari', 'day')),
    mulai: String(pilih(o, 'jam_mulai', 'mulai', 'jamMulai', 'start')).slice(0, 5),
    selesai: String(pilih(o, 'jam_selesai', 'selesai', 'jamSelesai', 'end')).slice(0, 5),
    kode: String(pilih(o, 'kode_matkul', 'kode_mk', 'id_matkul') || pilih(mk, 'kode', 'kode_matkul', 'id')),
    matkul: String(pilih(o, 'nama_matkul', 'matkul', 'nama_mk') || pilih(mk, 'nama', 'nama_matkul') || (typeof o.mata_kuliah === 'string' ? o.mata_kuliah : '')),
    sks: Number(pilih(o, 'sks') || pilih(mk, 'sks')) || 0,
    dosen: String(pilih(o, 'nama_dosen', 'dosen_pengampu') || pilih(ds, 'nama', 'nama_dosen') || (typeof o.dosen === 'string' ? o.dosen : '')),
    ruang: String(pilih(o, 'ruang', 'nama_ruang', 'kode_ruang')),
  };
}

function normalisasiOrganisasi(o) {
  return {
    organisasi: String(pilih(o, 'nama_organisasi', 'organisasi', 'nama_ormawa', 'nama_ukm', 'ukm', 'nama')),
    jabatan: String(pilih(o, 'jabatan', 'posisi', 'divisi', 'role') || 'Anggota'),
    periode: String(pilih(o, 'periode', 'tahun', 'angkatan')),
  };
}

// ---------- Data simulasi (contoh, BUKAN data asli) ----------
const MATKUL_SIMULASI = {
  1: [['TRPL101', 'Algoritma dan Pemrograman', 3], ['TRPL102', 'Matematika Diskrit', 2], ['TRPL103', 'Pengantar Teknologi Informasi', 2], ['TRPL104', 'Bahasa Inggris I', 2], ['TRPL105', 'Basis Data Dasar', 3], ['TRPL106', 'Desain Web', 3]],
  3: [['TRPL301', 'Pemrograman Berorientasi Objek', 3], ['TRPL302', 'Struktur Data', 3], ['TRPL303', 'Sistem Operasi', 2], ['TRPL304', 'Analisis dan Desain Sistem', 3], ['TRPL305', 'Statistika', 2], ['TRPL306', 'Pemrograman Web Lanjut', 3]],
  5: [['PLMKB502', 'Manajemen Database Client Server', 3], ['TRPL502', 'Interaksi Manusia dan Komputer', 3], ['TRPL503', 'Rekayasa Perangkat Lunak', 3], ['TRPL504', 'Pemrograman Mobile', 3], ['TRPL505', 'Keamanan Perangkat Lunak', 2], ['TRPL506', 'Metodologi Penelitian', 2]],
  7: [['TRPL701', 'Proyek Perangkat Lunak', 4], ['TRPL702', 'Manajemen Proyek TI', 2], ['TRPL703', 'Kecerdasan Buatan Terapan', 3], ['TRPL704', 'Pengujian Perangkat Lunak', 3], ['TRPL705', 'Etika Profesi', 2]],
};
const DOSEN_SIMULASI = ['Rina Hutapea, M.Kom', 'Andi Saragih, M.T.', 'Maya Lubis, M.Kom', 'Joko Purba, M.Kom', 'Dewi Sinaga, M.Pd', 'Fajar Nasution, M.Kom'];
const SLOT = [['08:00', '10:30'], ['10:40', '12:20'], ['13:30', '15:10']];
const RUANG = ['Lab Komputer 1', 'Lab Komputer 2', 'R. TRPL 3.1', 'R. TRPL 3.2'];

function semesterDariKelas(kelas) {
  const m = String(kelas || '').match(/(\d)/);
  return m ? Number(m[1]) : null;
}

function jadwalSimulasi(kelas) {
  const sem = semesterDariKelas(kelas);
  const daftar = MATKUL_SIMULASI[sem] || MATKUL_SIMULASI[5];
  const geser = String(kelas || '').charCodeAt(String(kelas || '').length - 1) || 0; // A/B/C... beda urutan
  return daftar.map(([kode, matkul, sks], i) => {
    // sebar ke 5 hari; kelas berbeda (A/B/C...) mendapat urutan hari berbeda
    const slot = SLOT[(Math.floor(i / HARI.length) + geser) % SLOT.length];
    return {
      hari: HARI[(i + geser) % HARI.length],
      mulai: slot[0], selesai: slot[1],
      kode, matkul, sks,
      dosen: DOSEN_SIMULASI[(i + geser) % DOSEN_SIMULASI.length],
      ruang: RUANG[(i + geser) % RUANG.length],
    };
  });
}

function organisasiSimulasi(nim) {
  const n = Number(String(nim).slice(-2)) || 0;
  const pilihan = [
    { organisasi: 'HIMA TRPL', jabatan: 'Anggota Divisi Kominfo', periode: '2026/2027' },
    { organisasi: 'UKM Paduan Suara', jabatan: 'Anggota', periode: '2026/2027' },
    { organisasi: 'UKM Robotika', jabatan: 'Sekretaris', periode: '2026/2027' },
  ];
  return n % 3 === 0 ? [] : pilihan.slice(0, (n % 2) + 1);
}

// ---------- Fungsi yang dipakai portal ----------
async function ambilJadwal(kelas) {
  const cfg = INTEGRASI.jadwal;
  if (cfg.mode === 'live' && cfg.url) {
    const rows = await ambilEksternal(cfg, { kelas });
    return { sumber: 'live', nama: cfg.nama, data: rows.map(normalisasiSesi) };
  }
  return { sumber: 'simulasi', nama: cfg.nama, data: jadwalSimulasi(kelas) };
}

async function ambilOrganisasi(nim) {
  const cfg = INTEGRASI.ormawa;
  if (cfg.mode === 'live' && cfg.url) {
    const rows = await ambilEksternal(cfg, { nim });
    return { sumber: 'live', nama: cfg.nama, data: rows.map(normalisasiOrganisasi) };
  }
  return { sumber: 'simulasi', nama: cfg.nama, data: organisasiSimulasi(nim) };
}

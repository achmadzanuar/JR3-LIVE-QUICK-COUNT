# JR3 Live Quick Count — Vercel

Dashboard publik untuk Pemilihan Ketua Paguyuban Java Residence Cluster 3
2026–2027. Frontend HTML/CSS/JavaScript vanilla dan satu Vercel
Function Node.js. Tidak menggunakan Apps Script atau database tambahan.

**Default: SIMULASI / spreadsheet dummy.** Belum ada suara yang ditampilkan
sebelum akses Google terhubung. Label berubah menjadi HASIL SEMENTARA hanya
pada konfigurasi produksi. Grafik calon menampilkan persen saja, skala tetap
0–100%; total suara sah berada di kartu statistik terpisah.

## Koneksi Google satu kali

Ikuti [koneksi OIDC tanpa key](docs/CONNECT-OIDC.md): gunakan identitas sementara
Vercel melalui Google Workload Identity Federation, lalu bagikan spreadsheet
sebagai Viewer ke service account. Tidak perlu private key atau Apps Script.
Kode tetap mendukung key JSON untuk lingkungan yang mengizinkannya.

ID spreadsheet dummy dan GID telah diisi sebagai default server. Header dibaca
dan diverifikasi otomatis dari header aktual; kolom tidak dipilih berdasarkan
posisi. Header harus cocok dengan judul pertanyaan Form atau konfigurasi
override eksplisit. Header hilang/duplikat menghasilkan error tanpa suara nol
palsu. Spreadsheet tetap Restricted; jangan Publish to web.

## Variabel Vercel

| Nama | Penggunaan |
|---|---|
| `GOOGLE_AUTH_MODE` | `vercel_oidc` tanpa key; `service_account` untuk alternatif key JSON |
| `GCP_PROJECT_NUMBER` | Nomor project Google Cloud untuk OIDC |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | Pool khusus aplikasi untuk OIDC |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | Provider OIDC Vercel |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Email akun pembaca spreadsheet untuk OIDC |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Hanya mode `service_account`: JSON key sebagai Secret |
| `GOOGLE_SPREADSHEET_ID` | Opsional untuk dummy; wajib diisi ID spreadsheet utama saat produksi |
| `GOOGLE_SHEET_GID` | Opsional untuk dummy; wajib diisi GID tab respons utama saat produksi |
| `ELECTION_MODE` | `dummy` (default) atau `production` |
| `REGISTERED_VOTERS` | Opsional: bilangan bulat positif, jumlah rumah/KK berhak pilih |
| `CHOICE_HEADER` | Opsional: override header pilihan lengkap jika judul berbeda |
| `ADDRESS_HEADER` | Opsional: override header alamat jika judul berbeda |
| `TIMESTAMP_HEADER` | Opsional: override header timestamp jika judul berbeda |
| `GOOGLE_ADDRESS_CORRECTIONS_JSON` | Opsional: koreksi alamat yang dikonfirmasi panitia, Sensitive dan hanya server |

Header otomatis yang didukung: judul pilihan **Daftar Calon Ketua Paguyuban
Periode 2026-2027**, alamat **Blok & Nomor Rumah**, timestamp **Timestamp**,
**Stempel waktu**, atau **Cap waktu**. Kapitalisasi, Unicode, dan spasi
dinormalisasi. Jika lebih dari satu kolom memenuhi pemetaan, sumber ditolak.

## Beralih ke spreadsheet utama

1. Berikan akses **Viewer** pada spreadsheet utama kepada service account yang sama.
2. Isi `GOOGLE_SPREADSHEET_ID` dan `GOOGLE_SHEET_GID` utama di Vercel.
3. Untuk OIDC gunakan `ELECTION_MODE=production` di environment Production;
   cocokkan agregat dengan pemeriksaan panitia sebelum acara. OIDC sengaja
   menolak preview/development. Uji sintetis berjalan terpisah melalui `npm test`.
4. Redeploy setiap kali mengubah environment variables. Kode tidak perlu diubah.

Mode production sengaja menolak ID dummy bawaan atau sumber yang belum
ditentukan eksplisit, sehingga pergantian label saja tidak menjadikan hasil
dummy tampak sebagai hasil nyata. Respons baru pada spreadsheet aktif tidak
memerlukan redeploy; polling membaca pembaruan setiap 10 detik.

## Perilaku aplikasi

- Urutan calon 01–07 selalu tetap; slideshow 15 detik, navigasi, pause, fullscreen.
- Tampilan mengikuti referensi Quick Count: latar biru gelap, judul bertumpuk,
  aksen oranye, tujuh batang persentase vertikal dengan poster asli di bawahnya.
  Klik poster untuk melihat profil. Pada ponsel grafik dapat digeser horizontal.
  Grafik HTML/CSS tidak membutuhkan library eksternal atau Google Charts.
- Polling mempertahankan fokus keyboard pada tombol calon, serta hasil dan
  posisi grafik ketika koneksi gagal. Persentase tidak berubah menjadi jumlah suara.
- Blok XI/11, IV/4, VI/6 setara; nomor rumah 11, 11A, 11B tetap berbeda.
- Pemisah `&`, awalan `Block`, penanda `nomer`, dan titik sebelum `No` dikenali
  bila batas blok/rumah jelas. Romawi tidak baku dan nomor rumah Romawi tetap
  ditolak secara umum. [Koreksi khusus](docs/ADDRESS-CORRECTIONS.md) memerlukan
  konfirmasi panitia dan tidak dikirim ke browser.
- Hitung respons valid paling awal per rumah. Pilihan tidak dikenal atau
  metadata tidak valid tidak menghabiskan hak suara rumah tersebut.
- Timestamp Google Sheets dibaca sebagai serial, tanpa menebak tanggal teks.
  Timestamp dibandingkan dalam urutan waktu sumber; tanggal respons tidak
  dikirim ke browser. Jam dashboard dan waktu sinkronisasi memakai WIB.
- Duplikat, tidak terpetakan, dan alamat/waktu bermasalah dihitung terpisah.
- Pemetaan memakai label pilihan Form lengkap yang telah diverifikasi.
  Data profil terpisah dari agregasi; poster asli ada di `public/assets`.
- Data pribadi tidak keluar dari server. Endpoint `/api/results` tidak
  menerima spreadsheet ID dari browser dan tidak memiliki operasi tulis/hapus.
- Scope Google hanya `spreadsheets.readonly`, dengan akses file melalui Viewer.
- Cache instance dan CDN berbagi anggaran maksimum lima detik sejak pembacaan
  sumber. Tidak menggunakan stale-while-revalidate. Error tidak di-cache.
- Polling tidak bertumpuk, timeout browser 15 detik, hasil terakhir dipertahankan
  saat gagal, status data lama setelah 25 detik. Timer berhenti saat pagehide.
- Tidak ada suara sintetis dalam mode dummy: dummy tetap membaca spreadsheet
  dummy sebenarnya. Data sintetis hanya berada dalam tes terisolasi.

## Pengembangan dan deployment

```sh
npm ci
npm run build
npm test
npm run dev
```

Buka `http://127.0.0.1:8767`. Tanpa credential, profil asli tetap tampil,
angka hasil berupa `—`, dan API mengembalikan `SOURCE_NOT_CONFIGURED`.
Untuk env lokal pada Node 22, gunakan `node --env-file=.env tools/dev-server.mjs`.
`.env` dan JSON credential tidak boleh masuk Git; `.gitignore` sudah disiapkan.

Repository GitHub: https://github.com/achmadzanuar/JR3-LIVE-QUICK-COUNT

Di Vercel pilih framework **Other**, build `npm run build`, output `public`,
Node.js **22.x**. Konfigurasi ini sudah berada di `vercel.json`. Hubungkan
repository GitHub untuk deployment otomatis dari branch `main`.

## Pemeriksaan produksi

Pastikan API berhasil membaca sheet yang benar, total kategori konsisten,
suara sah sesuai pemeriksaan panitia, grafis dan foto cocok, akses anonim
berfungsi, dan tidak ada data pribadi di respons browser. Uji jumlah pengunjung
yang diharapkan sebelum acara; kuota Sheets API dan penggunaan Vercel tetap
bergantung pada akun yang digunakan.

Lihat [sumber poster](docs/POSTER-SOURCES.md). Footer poster Rizky menyebut
2026–2028; poster dipertahankan asli dan judul dashboard mengikuti brief/Form
2026–2027. Ejaan calon 06 pada jawaban Form adalah Syaifudin Nizar, sedangkan
tampilan mengikuti brief/poster: Syaifuddin Nizar.

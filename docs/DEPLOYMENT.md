# Deployment JR3

Website: https://jr3-live-quick-count.vercel.app

Project: https://vercel.com/achmadzanuars-projects/jr3-live-quick-count

Repository: https://github.com/achmadzanuar/JR3-LIVE-QUICK-COUNT

Deployment awal pada 17 Oktober 2026 berhasil. Halaman publik mengembalikan
HTTP 200 tanpa login. Profil dan tujuh poster asli tersedia. Pemeriksaan
desktop 1920×1080 dan ponsel dilakukan pada website yang sudah diterbitkan.
Tampilan telah diperbarui mengikuti referensi Quick Count: warna biru gelap,
judul bertumpuk, batang persentase vertikal, dan tujuh poster asli. Grafik
responsif dapat digeser pada ponsel. Klik poster untuk mengganti profil.
24 tes backend (termasuk autentikasi OIDC) dan 17 tes browser lulus.

## Status sumber

**Siap diuji; Google Sheets belum terhubung.** Default kode adalah `dummy`.
Konfigurasi Vercel telah diganti ke spreadsheet utama yang diberikan panitia,
dengan ID/GID eksplisit dan `ELECTION_MODE=production`.
`/api/results` mengembalikan HTTP 503 dengan `SHEET_ACCESS_DENIED` pada
17 Oktober 2026 setelah autentikasi Google berhasil. Hasil tampil `—`, bukan
nol atau suara buatan. Halaman publik tetap HTTP 200 tanpa login.

Service account JR3 Sheet Reader dan Sheets API sudah dibuat/diaktifkan.
Header utama sudah diperiksa melalui akun panitia. Kebijakan organisasi
`iam.disableServiceAccountKeyCreation` memblokir key JSON; tidak ada key yang
dibuat dan kebijakan tetap aktif. WIF pool `jr3-vercel`, provider `vercel`, dan
delegasi Workload Identity User pada akun pembaca sudah aktif. Condition
membatasi ID akun/project Vercel dan environment production; preview dan
development ditolak. Konfigurasi Production sudah terpasang dan diterbitkan.

**Tersisa:** pemilik spreadsheet memberikan Viewer kepada
`jr3-sheet-reader@project-592ba6d4-dadb-4276-8e1.iam.gserviceaccount.com`.
Akun manusia saat setup hanya Viewer dan tidak dapat mengelola sharing.
Tidak ada permintaan sharing atau pesan ke pemilik yang dikirim otomatis.
General access tetap Restricted. Setelah sharing selesai, verifikasi pembacaan
nyata, total, dan persentase sebelum acara. Ikuti [koneksi OIDC](CONNECT-OIDC.md).

Saat beralih ke spreadsheet utama, ganti ID dan GID serta bagikan sheet utama
kepada service account yang sama. Untuk OIDC gunakan environment Production dan
`ELECTION_MODE=production`, lalu redeploy dan verifikasi. Aplikasi tidak perlu
ditulis ulang.

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
20 tes backend dan 17 tes browser lulus untuk tampilan ini.

## Status sumber

**Siap diuji; Google Sheets belum terhubung.** Default kode adalah `dummy`.
Konfigurasi Vercel telah diganti ke spreadsheet utama yang diberikan panitia,
dengan ID/GID eksplisit dan `ELECTION_MODE=production`.
`/api/results` mengembalikan HTTP 503 dengan `SOURCE_NOT_CONFIGURED` sampai
service account dipasang. Hasil tampil `—`, bukan nol atau suara buatan.

Ikuti [koneksi Google](CONNECT-GOOGLE.md). Simpan JSON key hanya pada Sensitive
environment variable Vercel, bagikan sheet sebagai Viewer ke service account,
lalu redeploy. Pembacaan sumber nyata, header, dan hitungan harus diverifikasi
setelah langkah tersebut selesai sebelum dipakai untuk acara.

Saat beralih ke spreadsheet utama, ganti ID dan GID serta bagikan sheet utama
kepada service account yang sama. Uji dahulu; kemudian set
`ELECTION_MODE=production` dan redeploy. Aplikasi tidak perlu ditulis ulang.

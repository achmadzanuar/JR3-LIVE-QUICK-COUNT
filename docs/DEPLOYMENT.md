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
30 tes backend (termasuk OIDC dan koreksi alamat) lulus. Tampilan sebelumnya
lulus 17 tes browser dan tidak berubah pada perbaikan alamat ini.

## Status sumber

**Google Sheets sudah terhubung dan hasil produksi telah diverifikasi.** Default kode adalah `dummy`.
Konfigurasi Vercel telah diganti ke spreadsheet utama yang diberikan panitia,
dengan ID/GID eksplisit dan `ELECTION_MODE=production`.
Setelah pemilik memberikan Viewer ke akun pembaca, `/api/results` berhasil
HTTP 200 pada 17 Oktober 2026. Halaman publik juga HTTP 200 tanpa login.
Hasil awal: 96 respons, 85 suara sah, 2 duplikat, 9 alamat belum dikenali.
Perbaikan format alamat yang jelas dan dua koreksi yang dikonfirmasi panitia
menghasilkan 94 suara sah, 2 duplikat, dan 0 metadata bermasalah pada snapshot
96 respons tersebut. Persentase dihitung dari 94 suara sah. Data dapat bertambah
setelah snapshot; angka ini merupakan bukti verifikasi saat perbaikan.

Service account JR3 Sheet Reader dan Sheets API sudah dibuat/diaktifkan.
Header utama sudah diperiksa melalui akun panitia. Kebijakan organisasi
`iam.disableServiceAccountKeyCreation` memblokir key JSON; tidak ada key yang
dibuat dan kebijakan tetap aktif. WIF pool `jr3-vercel`, provider `vercel`, dan
delegasi Workload Identity User pada akun pembaca sudah aktif. Condition
membatasi ID akun/project Vercel dan environment production; preview dan
development ditolak. Konfigurasi Production sudah terpasang dan diterbitkan.

Akun manusia saat setup hanya Viewer. Akun pembaca sudah mendapat Viewer dan
pembacaan sumber nyata berhasil. General access tetap Restricted. Koreksi
khusus berada di Sensitive environment variable server; spreadsheet asli tidak
diubah. Timestamp, pilihan, dan aturan respons valid paling awal tidak diubah.
Ikuti [koneksi OIDC](CONNECT-OIDC.md) dan [koreksi alamat](ADDRESS-CORRECTIONS.md).

Saat beralih ke spreadsheet utama, ganti ID dan GID serta bagikan sheet utama
kepada service account yang sama. Untuk OIDC gunakan environment Production dan
`ELECTION_MODE=production`, lalu redeploy dan verifikasi. Aplikasi tidak perlu
ditulis ulang.

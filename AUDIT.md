# Audit hasil pemilihan JR3

Halaman `/analisis` adalah ruang privat panitia. Dashboard `/` dan `/api/results` tetap memakai aturan sebelumnya; hasilnya bukan arsip final audit.

## Mulai dan tinjau

1. Masuk memakai password panitia. Sesi berlaku 8 jam. Tema tidak memengaruhi data.
2. Pilih **Ambil salinan sumber**. Sumber diambil satu kali; tidak ada polling yang mengganti salinan selama pemeriksaan. Pilihan ini membuat audit baru dan mengganti draf aktif setelah konfirmasi.
3. Periksa kategori **Perlu pemeriksaan**. Tombol **Tinjau** dapat memperbaiki alamat yang sudah dipastikan, menolak respons, atau membatalkan keputusan sebelumnya. Alasan wajib diisi. Pilihan calon dan waktu sumber tidak dapat diedit.
4. Tinjau kelompok duplikat dan perolehan calon. Setiap rumah mendapat satu poin dari respons valid paling awal sebelum atau tepat pada **23 Oktober 2026 19.00 WIB**. Timestamp sama diputuskan berdasarkan urutan baris sumber. Nomor respons adalah nomor baris spreadsheet, bukan nomor urut suara sah.
5. Pilih **Simpan Berkas Draf**, masukkan password panitia, dan pastikan berkas `.jr3audit` tersimpan. Draf di halaman tidak disimpan otomatis. Penanda perubahan dan peringatan meninggalkan halaman membantu mengingatkan ekspor.
6. Untuk melanjutkan di perangkat lain: masuk, pilih **Buka Berkas Audit**, pilih berkas, dan masukkan password yang dipakai saat ekspor. Impor mengganti draf aktif setelah konfirmasi; tidak menggabungkan keputusan.

Koreksi alamat hanya menyelesaikan masalah alamat. Pilihan tidak dikenali atau timestamp tidak valid harus ditolak dengan alasan jika tidak dapat diselesaikan melalui sumber audit baru. Alamat ambigu tidak ditebak. Kelayakan warga tetap ditentukan panitia berdasarkan bukti resmi.

## Final dan revisi

**Kunci Hasil Final** tersedia bila tidak ada respons berstatus perlu pemeriksaan. Server memvalidasi tanda tangan dan menghitung ulang sebelum menandatangani final. Simpan arsip final terenkripsi yang dihasilkan. Arsip final tidak dapat diedit; **Buat revisi draf** menghasilkan versi berikutnya dengan rujukan ID dan tanda tangan final sebelumnya.

Panitia menentukan berkas final resmi secara manual. Tidak ada status final bersama antarperangkat, daftar audit di server, database, atau penyimpanan keputusan di spreadsheet. Dua berkas draf dapat bercabang; jangan menganggap versi lebih tinggi otomatis resmi. Sumber ulang membuat ID audit baru. Simpan arsip sebelumnya sebelum mengganti audit aktif.

## Aturan dan keamanan

- Lima kategori saling eksklusif: ditolak panitia terlebih dahulu, lalu lewat waktu, perlu pemeriksaan, dihitung/duplikat. Respons dengan timestamp valid setelah penutupan masuk lewat waktu meskipun kolom lain bermasalah. Hanya respons layak dihitung yang mengonsumsi hak rumah.
- Serial tanggal Sheets adalah waktu lokal dalam `properties.timeZone`, kemudian dikonversi ke instant UTC untuk dibandingkan dengan batas WIB. Teks tanggal lokal tidak ditebak; waktu DST ambigu/tidak ada memerlukan pemeriksaan.
- Snapshot hanya mengambil timestamp, alamat dan pilihan; nama dan kontak tidak diminta. Snapshot dan keputusan hanya dikirim melalui API terautentikasi, tidak dimasukkan ke aset publik atau log.
- Snapshot, draf, final, dan sesi memakai HMAC SHA-256 dengan domain tipe berbeda. Server menolak modifikasi sumber atau keputusan tanpa tanda tangan. Riwayat mencatat nilai sebelum/sesudah, alasan, waktu server, dan keterangan identitas panitia bersama tidak terverifikasi.
- Berkas terenkripsi AES-256-GCM, salt 128 bit, nonce 96 bit, dan PBKDF2-SHA256 310.000 iterasi. Password tidak ada dalam berkas. Login menggunakan hash scrypt ber-salt. Berkas terenkripsi tetap bersifat privat.
- Cookie `HttpOnly; Secure; SameSite=Strict`, berlaku 8 jam. Semua API privat menggunakan POST, pemeriksaan Origin, sesi (kecuali login), serta `Cache-Control: no-store`. Pembatasan 5 kegagalan login per 15 menit per IP hanya berlaku per proses, bukan lintas instance Vercel. Ini bukan pengganti password kuat yang dirahasiakan.
- Password atau audit tidak disimpan dalam localStorage. localStorage hanya menyimpan pilihan tema. Kunci berkas diproses dalam memori browser.
- Pengaturan dibatasi pada 5.000 baris sumber, 3 MB permintaan API dan 10.000 peristiwa keputusan per draf. Simpan berkas secara berkala; audit sangat besar perlu pemecahan pendekatan oleh pengelola sebelum melampaui batas.

## Konfigurasi Vercel

Gunakan variabel sumber Google/OIDC yang sudah ada. Tambahkan sebagai **Sensitive**, target Production:

| Variabel | Isi |
|---|---|
| `ANALYSIS_PASSWORD_HASH` | `scrypt$<salt hex 32>$<hash hex 128>` |
| `ANALYSIS_SIGNING_KEY` | minimal 32 byte acak ditulis sebagai hex |
| `ANALYSIS_ORIGIN` | `https://jr3-live-quick-count.vercel.app` |

Kunci penandatanganan harus stabil agar berkas lama tetap dapat diverifikasi. Menggantinya membuat semua arsip sebelumnya tidak dapat dibuka oleh server ini. Cadangkan kunci pada penyimpanan rahasia pengelola. Mengganti hash password membatalkan sesi lama; berkas lama tetap memerlukan password lama untuk dekripsi. Jangan menaruh password atau signing key di Git/GitHub, aset publik, atau chat.

Untuk mengatur password baru, gunakan `passwordHash()` dari `lib/analysis/security.js` melalui skrip lokal yang membaca input privat dan mengirim hash ke Secret Vercel. Jangan menuliskan password ke argumen command line atau riwayat shell. Redeploy setelah mengubah env. Alias/domain baru harus memperbarui `ANALYSIS_ORIGIN`.

## Verifikasi

`npm test` mencakup batas penutupan, zona sumber/DST, normalisasi dan deduplikasi, koreksi, penolakan, peringkat seri, konsistensi kategori, autentikasi, asal permintaan, sesi kedaluwarsa, tanda tangan, enkripsi dan revisi final. `npm run build` memverifikasi aset dashboard. Jalankan `npm run test:audit-ui`, buka `http://127.0.0.1:8771/qa.html`, dan pilih **Run end-to-end UI checks** untuk 19 pemeriksaan antarmuka memakai sumber sintetis. Server QA hanya mendengarkan localhost dan tidak membaca Google Sheets. Fixture dan harness berada di luar folder publik. Pengujian sumber nyata cukup mengambil salinan dan memeriksa perhitungan; keputusan panitia dan penguncian hasil resmi tetap dilakukan panitia.

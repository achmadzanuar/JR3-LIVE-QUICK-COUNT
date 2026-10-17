# Hubungkan spreadsheet privat ke Vercel — satu kali

**Untuk JR3 gunakan [koneksi OIDC tanpa key](CONNECT-OIDC.md).** Kebijakan
organisasi memblokir key JSON. Panduan di bawah merupakan alternatif untuk
lingkungan yang memang mengizinkan key; jangan menonaktifkan kebijakan tersebut.

Tidak perlu Apps Script. Setelah selesai, penggantian sumber dilakukan dari
environment variables Vercel, tanpa mengubah berkas aplikasi.

## 1. Buat akun pembaca Google

1. Masuk [Google Cloud Console](https://console.cloud.google.com/) menggunakan
   akun panitia. Buat/pilih project **JR3 Quick Count**.
2. Buka [Google Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com)
   pada project tersebut dan klik **Enable**.
3. Buka [IAM & Admin → Service Accounts](https://console.cloud.google.com/iam-admin/serviceaccounts).
   Klik **Create service account**, beri nama `jr3-sheet-reader`, lalu **Done**.
   Tidak perlu memberi role Owner/Editor project atau domain-wide delegation.
4. Buka service account tadi. Salin email yang berakhir
   `@...iam.gserviceaccount.com`.
5. Tab **Keys → Add key → Create new key → JSON**. Google mengunduh berkas key.
   Simpan berkas tersebut secara privat; jangan kirim isinya ke chat/GitHub.

## 2. Beri akses spreadsheet

1. Buka spreadsheet dummy dengan akun yang memiliki hak membagikannya.
2. Klik **Share**, masukkan email service account, pilih **Viewer**, lalu simpan.
3. **General access tetap Restricted.** Tidak perlu Publish to web atau Anyone.

Service account dapat membaca hanya file yang dibagikan kepadanya. Role IAM
project Google Cloud tidak otomatis memberi akses ke spreadsheet.

## 3. Simpan key di Vercel

1. Buka project **jr3-live-quick-count** di Vercel.
2. **Settings → Environment Variables → Add**.
3. Nama: **`GOOGLE_SERVICE_ACCOUNT_JSON`**.
4. Buka file JSON yang diunduh dengan editor teks, lalu salin **seluruh isinya**
   sebagai nilai. Aktifkan **Sensitive/Secret**, pilih environment **Production**,
   lalu simpan. Jangan gunakan awalan `NEXT_PUBLIC_`.
5. Buka **Deployments → deployment terbaru → Redeploy**.

ID dan GID dummy sudah tersedia sebagai default server. Jika file dummy yang
dipakai berbeda, tambahkan `GOOGLE_SPREADSHEET_ID` dan `GOOGLE_SHEET_GID` yang
benar. Pertahankan `ELECTION_MODE=dummy` selama pengujian.

Setelah dashboard menampilkan **Terhubung · live**, cocokkan hasil dengan sheet.
Jika API mengembalikan `SHEET_ACCESS_DENIED`, periksa email Viewer. Jika
`GOOGLE_API_DISABLED`, aktifkan Sheets API pada project pemilik key. Jika
`HEADER_INVALID`, periksa header sebenarnya dan isi override header yang sesuai.

## Saat menggunakan spreadsheet utama

Bagikan sheet utama kepada email service account yang sama sebagai Viewer.
Ubah ID dan GID di Vercel, uji dahulu dengan label dummy, kemudian set
`ELECTION_MODE=production` dan redeploy. Key yang sama tidak perlu dibuat ulang.

Referensi resmi:
- [Service account dan sharing file](https://developers.google.com/workspace/guides/create-credentials#service-account)
- [Scope Sheets API](https://developers.google.com/workspace/sheets/api/scopes)
- [Secret environment variables Vercel](https://vercel.com/docs/environment-variables/sensitive-environment-variables)

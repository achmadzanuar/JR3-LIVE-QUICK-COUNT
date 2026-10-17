# Koreksi alamat yang ditinjau panitia

Normalisasi menerima blok angka/Romawi baku, awalan Blok/Block, penanda
No/Nomor/Nomer/Nmr, pemisah slash/koma/strip/ampersand, dan titik sebelum No.
Nomor rumah tetap angka dengan satu akhiran huruf opsional. Tidak ada konversi
otomatis untuk Romawi salah atau nomor rumah Romawi.

Jika panitia mengonfirmasi maksud suatu isian ambigu, gunakan environment
variable **Sensitive, Production** bernama `GOOGLE_ADDRESS_CORRECTIONS_JSON`:

```json
{
  "spreadsheetId": "ID_SUMBER_YANG_DITINJAU",
  "gid": 123456,
  "entries": [
    {
      "row": 2,
      "expectedAddress": "ISIAN_ASLI_YANG_DITINJAU",
      "correctedAddress": "7/4A"
    }
  ]
}
```

Contoh ini sintetis. Jangan menaruh isian pemilih sebenarnya pada repository,
folder public, browser payload, log, atau dokumentasi. Konfigurasi dibaca hanya
di server; tidak ada endpoint untuk mengakses koreksi.

`row` adalah nomor baris sumber termasuk header di baris 1. Koreksi berlaku
hanya jika spreadsheet ID, GID, nomor baris, dan teks alamat asli cocok.
Target wajib format numerik kanonis `blok/rumah`, dengan akhiran huruf opsional.
Mengganti sumber membuat koreksi sumber lama tidak berlaku.

Koreksi diterapkan pada salinan data di server sebelum deduplikasi dan tidak
mengubah spreadsheet asli. Respons valid paling awal per rumah tetap dihitung
satu kali. Timestamp dan pilihan calon tidak diubah.

Jika sumber diurutkan, baris dihapus, atau alamat berubah ke rumah berbeda,
server mengembalikan `CORRECTION_STALE` agar panitia meninjau ulang. Perubahan
oleh pemilik ke alamat kanonis yang sama tetap diterima. Mengubah konfigurasi
memerlukan redeploy dan membatalkan cache hasil sebelumnya.

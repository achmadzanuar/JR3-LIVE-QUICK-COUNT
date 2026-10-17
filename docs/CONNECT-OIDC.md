# Koneksi Google tanpa private key

Workload Identity Federation (WIF) menukar identitas Vercel dengan token Google
sementara. Kebijakan larangan key tetap aktif. Tidak perlu Apps Script.

## Akun pembaca dan API

1. Aktifkan Google Sheets API, Security Token Service API, dan IAM Service
   Account Credentials API pada project Google Cloud panitia.
2. Buat service account `jr3-sheet-reader`, tanpa role Owner/Editor project,
   domain-wide delegation, atau key JSON.
3. Pemilik spreadsheet membagikan file kepada email service account sebagai
   **Viewer**. General access tetap **Restricted**. Akun manusia yang hanya
   Viewer mungkin perlu meminta pemilik file menyelesaikan langkah ini.

## Identitas Vercel yang dibatasi

1. Periksa OIDC project Vercel sudah aktif dan issuer mode sebenarnya. Mode Team
   menggunakan `https://oidc.vercel.com/TEAM_SLUG`.
2. Google Cloud → IAM & Admin → Workload Identity Federation → buat pool khusus
   aplikasi (`jr3-vercel`) dan provider OpenID Connect (`vercel`).
3. Isi issuer tadi, tanpa JWK manual. Allowed audience:
   `https://vercel.com/TEAM_SLUG`.
4. Mapping `google.subject` ke `assertion.sub`. Condition memakai **ID stabil**:

   ```text
   assertion.owner_id == 'TEAM_ID' && assertion.project_id == 'PROJECT_ID' && assertion.environment == 'production'
   ```

5. Pada **service account tersebut saja**, beri role
   `roles/iam.workloadIdentityUser` ke principal produksi yang tepat:

   ```text
   principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:TEAM_SLUG:project:PROJECT_NAME:environment:production
   ```

Jangan memberi akses seluruh pool, project lain, preview, atau development.
WIF mengizinkan server memakai service account; akses ke file tetap bergantung
pada sharing Viewer. Bagikan hanya file yang diperlukan kepada akun pembaca.

## Environment Production Vercel

| Nama | Nilai |
|---|---|
| `GOOGLE_AUTH_MODE` | `vercel_oidc` |
| `GCP_PROJECT_NUMBER` | Nomor project Google Cloud, bukan project ID |
| `GCP_WORKLOAD_IDENTITY_POOL_ID` | ID pool |
| `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` | ID provider |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Email akun pembaca |
| `GOOGLE_SPREADSHEET_ID` | ID spreadsheet utama |
| `GOOGLE_SHEET_GID` | GID tab respons utama |
| `ELECTION_MODE` | `production` |

`VERCEL_ENV` disediakan Vercel; jangan membuat override manual. Tidak diperlukan
`GOOGLE_SERVICE_ACCOUNT_JSON`, token OIDC manual, atau `NEXT_PUBLIC_*`.
Redeploy setelah mengubah environment. Endpoint dan scope ditentukan kode,
sehingga konfigurasi tidak dapat mengarahkan token ke host lain.

## Verifikasi

`/api/results` harus HTTP 200 dengan agregat dan waktu baca nyata, tanpa data
pemilih atau token. Header diverifikasi berdasarkan judul pertanyaan, tanpa
menebak posisi kolom. Cocokkan total kategori dan persentase sebelum acara.
Hasil tetap `—` sampai pembacaan pertama berhasil.

- `GOOGLE_AUTH_INVALID`: periksa issuer, audience, condition, principal,
  environment, dan delegasi service account.
- `SHEET_ACCESS_DENIED`: pemilik perlu memberi Viewer ke service account.
- `GOOGLE_API_DISABLED`: aktifkan API pada project yang sesuai.
- `HEADER_INVALID`: periksa header aktual dan override eksplisit bila perlu.

Untuk mengganti spreadsheet, bagikan sumber baru ke akun yang sama, ubah ID/GID
Production, lalu redeploy dan verifikasi agregat kembali.

Referensi: [Vercel OIDC untuk Google Cloud](https://vercel.com/docs/oidc/gcp),
[klaim Vercel](https://vercel.com/docs/oidc/reference),
[Google WIF](https://cloud.google.com/iam/docs/workload-identity-federation),
[scope Sheets](https://developers.google.com/workspace/sheets/api/scopes).

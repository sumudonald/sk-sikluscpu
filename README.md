# MPI Siklus CPU — GitHub Pages Mobile Ready

Versi ini diaudit untuk laptop, tablet, dan HP (portrait/landscape).

## Struktur

```text
index.html
css/style.css
js/app.js
.nojekyll
```

## Upload

Upload seluruh isi folder ke root repository GitHub. Aktifkan **Settings → Pages → Deploy from a branch → main → /(root)**.

## Perbaikan mobile

- Login dapat discroll pada layar pendek dan memakai safe area/notch.
- Navbar HP memakai menu hamburger; navbar desktop tetap horizontal.
- Judul, card, tombol, kuis, HOTS, refleksi, dan modal diskalakan untuk lebar 320–430 px.
- CPU CRISIS dioptimalkan untuk portrait; landscape bersifat opsional.
- Mode Fokus tetap tersedia tanpa Fullscreen API.
- Video YouTube tetap responsif.

## Penyimpanan progres

GitHub Pages adalah hosting statis. Versi ini menyimpan progres di **localStorage browser/perangkat**. Kode Siswa/NIS digunakan untuk membedakan data progres pada perangkat tersebut, tetapi belum menyinkronkan progres antarperangkat. Untuk itu diperlukan database online (misalnya Firebase/Supabase).

## Setelah mengganti file di GitHub

Tunggu deployment Pages selesai lalu lakukan hard refresh (`Ctrl+F5` pada desktop). Di HP, tutup tab lama atau hapus cache halaman jika perubahan belum terlihat.

# Yozora Desktop (Electron)

Aplikasi desktop Windows untuk nonton anime sub Indo — hasil `.exe` mandiri,
bukan website. Dibangun pakai Electron, jadi seluruh logic scraping (yang
sama seperti `otaku-cli` versi Node.js sebelumnya) bisa dipakai langsung
tanpa portir ke bahasa lain.

## Tampilan

Sudah diperbarui mengikuti referensi desain sidebar + tema ungu:
sidebar navigasi kiri, hero banner, baris "Lanjutkan Menonton" & "Episode
Terbaru", halaman detail dengan tab (Episode/Detail — tab
Karakter/Rekomendasi/Komentar dinonaktifkan karena situs sumber tidak
punya data itu), dan panel kontrol player (Server/Resolusi).

**Fitur yang genuinely berfungsi:**
- Riwayat tontonan, Bookmark, dan Koleksi Saya (Tonton Nanti) — disimpan
  lokal lewat `localStorage` (bukan dari server, karena situs sumber tidak
  punya sistem akun)
- Ganti server/mirror lewat dropdown (resolve AJAX+nonce asli)
- Fullscreen player
- **Jadwal Rilis** — data asli, di-scrape langsung dari halaman
  `/jadwal-rilis/` milik situs sumber (dikelompokkan per hari)
- **Tab Karakter** — dicocokkan otomatis lewat [Jikan API](https://jikan.moe)
  (API tidak resmi untuk MyAnimeList). Karena situs sumber tidak punya ID
  MyAnimeList untuk tiap anime, pencocokan dilakukan berdasarkan judul —
  untuk judul yang tidak umum/disingkat, hasilnya bisa saja meleset ke
  anime lain yang judulnya mirip. Aplikasi menampilkan judul yang
  berhasil dicocokkan supaya kamu bisa langsung tahu kalau salah.
- **Auto Lanjut Episode** — toggle di halaman nonton. Otomatis lanjut ke
  episode berikutnya (ditentukan dari nomor episode, bukan asal urutan
  list) begitu video selesai, dengan overlay countdown 5 detik yang bisa
  dibatalkan. Cara kerjanya: preload khusus (`webview-preload.js`)
  disuntikkan ke dalam halaman iframe milik situs sumber untuk mendeteksi
  event `ended` pada tag `<video>`-nya.
  > **Keterbatasan:** ini hanya berfungsi kalau player di server yang
  > dipilih menampilkan `<video>` langsung di halaman itu. Sebagian mirror
  > server menaruh video sebenarnya di dalam iframe bersarang lagi, yang
  > tidak bisa dideteksi dari sini karena batasan keamanan browser
  > (cross-origin) — kalau itu terjadi, toggle auto-next tetap ada tapi
  > tidak akan pernah trigger untuk server tersebut (gagal secara diam-diam,
  > tidak mengganggu fitur lain).
- **Notifikasi update episode** — ikon lonceng di kanan atas. Aplikasi
  mengecek berkala (saat dibuka, lalu tiap 20 menit) episode terbaru dari
  setiap anime yang ada di **Bookmark** dan **Koleksi Saya**, dibandingkan
  dengan episode terakhir yang tercatat. Kalau ada episode baru, muncul
  notifikasi asli sistem operasi (Windows notification) + tercatat di
  panel lonceng (badge angka merah = jumlah belum dibaca, klik salah satu
  notifikasi untuk langsung nonton episode itu, atau "Hapus semua" untuk
  membersihkan daftarnya).
  > Catatan: pengecekan pertama kali (5 detik setelah aplikasi dibuka)
  > sengaja dibuat *silent* (tidak memicu notifikasi OS) — itu cuma untuk
  > merekam "episode terakhir yang diketahui" per anime sebagai baseline,
  > supaya anime yang baru saja kamu bookmark tidak langsung dianggap
  > "update baru" di pengecekan pertamanya.
- **Discord Rich Presence** — menampilkan "Menonton [judul anime] — Episode
  X" di profil Discord kamu saat aplikasi Discord desktop sedang berjalan.
  Aktif otomatis saat mulai nonton episode, hilang lagi saat kembali ke
  halaman lain. **Wajib setup Client ID dulu** — lihat bagian
  [Setup Discord Rich Presence](#setup-discord-rich-presence-opsional) di
  bawah. Kalau tidak di-setup, fitur ini otomatis nonaktif tanpa
  mengganggu fitur lain (aplikasi tetap jalan normal).
- **Download episode (bisa ditonton offline)** — klik ikon download di
  samping episode manapun di halaman detail untuk membuka pemilihan
  **resolusi & server** (data asli dari situs sumber: Mp4/MKV per
  resolusi, host Filedon/Pdrain/Acefile/GoFile/Mega/VikingFile, lengkap
  ukuran filenya). Episode yang sudah diunduh otomatis diputar dari file
  lokal saat kamu buka lagi (pakai `<video>` asli — kontrol play/pause/
  seek beneran jalan, malah lebih baik daripada versi streaming online
  yang cuma lewat iframe). Progres, status, dan tombol hapus ada di
  halaman **Download** di sidebar.
  - **Soal host yang butuh langkah manual:** banyak host file-hosting
    (terutama yang gratisan) menampilkan halaman perantara dulu (timer
    tunggu, iklan, tombol "klik di sini") sebelum file aslinya bisa
    diunduh — ini tidak bisa diotomasi begitu saja lewat request HTTP
    biasa, beda-beda pula caranya per host. Aplikasi ini mendeteksi hal
    ini secara otomatis (mengecek `Content-Type` dari responsnya): kalau
    ternyata dapat halaman web biasa bukan file asli, link itu otomatis
    dibuka di **jendela baru dalam aplikasi ini** (bukan Chrome/browser
    sistem). Begitu file sebenarnya mulai terdownload di jendela itu
    (lewat event `will-download` Electron), aplikasi **mencegatnya**,
    mengarahkan tujuannya ke folder download Yozora, melacak progresnya
    secara real-time, dan otomatis mendaftarkannya ke manifest — hasilnya
    episode itu langsung bisa diputar di aplikasi begitu selesai, sama
    seperti download otomatis biasa, tanpa perlu buka folder manual.
  - **Soal "Download Semua Episode" (tombol di halaman detail):** ini
    **bukan** mengunduh file arsip batch gabungan dari situs sumber —
    fitur ini mengunduh **setiap episode satu per satu secara
    otomatis**, masing-masing dengan kualitas menengah + host pertama
    yang tersedia (dipilih otomatis karena tidak ada dialog pemilihan
    per-episode di proses massal). Hasilnya: anime yang "di-download
    batch" tetap bisa diputar per-episode individual, karena memang
    tersimpan sebagai file terpisah per-episode.
  - **Folder tujuan download bisa diubah** lewat halaman **Pengaturan**
    di sidebar → tombol "Ganti Folder" (pilih folder mana saja lewat
    dialog folder picker bawaan Windows). Default-nya folder
    `Downloads/Yozora/<judul anime>/` di sistem kamu.


## Desain Yozoranime (tema ungu)

Tampilan mengikuti mockup: sidebar dengan logo bulan sabit, hero carousel,
Lanjutkan Menonton, Anime Terbaru (chip Ongoing/Completed/Semua), halaman
detail bertab, halaman nonton dengan panel Server/Subtitle/Kualitas/Auto Next,
dan Download Manager.

Yang sengaja dibuat jujur (tidak memalsukan data yang tidak ada):
- **Progress "Lanjutkan Menonton"** hanya muncul kalau pemutar benar-benar
  melaporkan posisi tontonan (video hasil download, atau server streaming
  yang menampilkan `<video>` langsung). Kalau tidak, yang tampil waktu
  terakhir ditonton.
- **Hero** memakai poster anime (blur sebagai latar + poster di kanan),
  karena situs sumber hanya menyediakan poster, bukan banner lebar.
- **Download Manager**: tombol *pause* tidak ada (belum didukung), tapi
  *batalkan*, *Buka Folder*, *Hapus Selesai*, kecepatan, dan ukuran
  semuanya nyata. Opsi "Download subtitle otomatis" tidak ada karena
  subtitle sudah menyatu di video.
- **Kualitas Video** (360p/480p/720p) mengikuti mirror yang tersedia di
  episode itu; "Auto" memakai Player Default.
- Tombol panah kembali sekarang benar-benar kembali ke halaman sebelumnya.

## Setup Discord Rich Presence (opsional)

1. Buka [discord.com/developers/applications](https://discord.com/developers/applications)
   (login pakai akun Discord kamu)
2. Klik **New Application**, kasih nama bebas (misal "Yozora")
3. Di halaman **General Information** aplikasi itu, copy nilai
   **Application ID**
4. Buka `src/discordConfig.js` di project ini, isi:
   ```js
   module.exports = {
     clientId: "TEMPEL_APPLICATION_ID_DI_SINI",
   };
   ```
5. *(Opsional, supaya ada ikon logo)* — di halaman yang sama, buka menu
   **Rich Presence → Art Assets**, upload gambar apa saja, kasih nama key
   persis **`yozora_logo`** (harus sama persis, itu yang dipanggil dari
   kode)
6. Simpan, jalankan ulang `npm start`

**Cara cek berhasil atau tidak:** buka episode apa saja, lalu lihat profil
Discord kamu sendiri (klik avatar kamu di Discord) — harus muncul "Menonton
[judul anime]". Kalau tidak muncul, cek terminal tempat `npm start`
dijalankan — akan ada log `[discord-rpc] ...` yang menjelaskan kenapa (Client
ID belum diisi, atau Discord desktop app tidak sedang berjalan).

> Rich Presence butuh **aplikasi Discord desktop** yang sedang berjalan di
> komputer yang sama (bukan Discord versi browser) — ini keterbatasan dari
> sistem Discord sendiri, bukan dari aplikasi ini.

**Yang sengaja dibuat sebagai placeholder/dinonaktifkan** (bukan bug — situs
sumber memang tidak menyediakan data ini): tab Rekomendasi, Komentar,
halaman Download, halaman Pengaturan, dropdown Subtitle (situs sumber cuma
punya 1 bahasa: Indonesia).

**Kenapa tidak ada tombol play/pause/seek pada player:** video dimuat lewat
`<webview>` yang menampilkan iframe milik situs sumber (cross-origin) —
kontrol video yang sebenarnya (play/pause/seek) dijalankan oleh player
JavaScript milik situs itu sendiri di dalam iframe, bukan oleh aplikasi
ini. Menambahkan tombol play/pause palsu yang terlihat seperti berfungsi
padahal tidak akan menyesatkan, jadi sengaja tidak dibuat.

## Struktur project

```
otaku-electron/
├── main.js              # proses utama Electron: bikin window, IPC handler
├── preload.js           # jembatan aman antara main process & renderer
├── src/
│   └── scraper.js        # logic scraping (axios + cheerio), sama seperti otaku-cli
├── renderer/             # UI (murni HTML/CSS/JS biasa)
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── package.json
```

## Cara jalankan (mode development)

```bash
npm install
npm start
```

Ini akan membuka jendela aplikasi langsung (bukan browser) — sudah bisa
dipakai penuh dari sini.

## Cara build jadi `.exe`

```bash
npm run dist
```

Hasilnya muncul di folder `dist/`:
- **`Yozora Setup x.x.x.exe`** — installer (Next → Next → Finish, bikin
  shortcut otomatis)
- **`Yozora x.x.x.exe`** (portable) — langsung jalan tanpa install

> Build `.exe` untuk Windows idealnya dilakukan **di Windows** (build lintas
> platform dari Linux/Mac ke Windows kadang butuh konfigurasi Wine
> tambahan). Kalau kamu develop di Windows, `npm run dist` langsung bisa
> jalan tanpa setup ekstra.

## Fitur

- Beranda (ongoing), Tamat, Genre, Pencarian — sama seperti versi CLI/web
- Detail anime + daftar episode
- Nonton episode: player utama otomatis, atau pilih server/resolusi lain
  (360p/480p/720p) — pakai mekanisme resolve AJAX+nonce yang sama seperti
  versi CLI
- Deteksi otomatis kalau endpoint ternyata link batch/lengkap (bukan
  episode individual)
- Video ditampilkan lewat tag `<webview>` bawaan Electron (chromium
  langsung, tanpa perlu mpv/ffplay/browser eksternal seperti versi CLI)
- **Picture-in-Picture (PiP)** — tombol PiP di halaman nonton.
  - Untuk **episode hasil download**: selalu berfungsi penuh, karena itu
    `<video>` asli milik aplikasi ini sendiri (pakai Picture-in-Picture
    API standar browser).
  - Untuk **streaming online** (lewat `<webview>`): bekerja dengan cara
    menjalankan skrip kecil ke dalam halaman iframe situs sumber (teknik
    yang sama seperti fitur Auto Lanjut Episode) untuk memicu PiP pada
    tag `<video>` di halaman itu.
    > **Keterbatasan:** sama seperti Auto Lanjut Episode, ini cuma
    > berfungsi kalau server yang dipilih menampilkan `<video>` langsung
    > di halaman itu (bukan di dalam iframe bersarang lagi). Kalau tidak
    > ditemukan, aplikasi akan kasih tahu jelas lewat pesan, dan
    > menyarankan coba server/mirror lain.

## Kenapa lebih besar dari aplikasi Windows biasa

Electron membundel Chromium + Node.js runtime ke dalam `.exe`-nya, jadi
ukuran installer wajar di kisaran 60-150 MB. ini trade-off standar untuk
kemudahan development lintas platform pakai HTML/CSS/JS.

## Kalau domain sumber berubah

Situs sumber beberapa kali ganti domain. Ganti lewat DevTools console
aplikasi ini (`Ctrl+Shift+I` untuk buka, kalau devtools disembunyikan bisa
diaktifkan dulu di `main.js`) dengan:
```js
await window.otaku.setBaseUrl("https://domain-baru.tld")
```
Atau, cara permanen: ubah nilai default `BASE_URL` di `src/scraper.js`.

## Ikon aplikasi

Project ini belum menyertakan file ikon `.ico` khusus (folder `build/`
kosong) — electron-builder akan pakai ikon default Electron kalau tidak
diisi. Untuk ikon custom, taruh file `icon.ico` (ukuran 256x256
direkomendasikan) di folder `build/`, lalu tambahkan baris berikut ke
bagian `"win"` di `package.json`:
```json
"win": { "icon": "build/icon.ico", "target": [...] }
```

## Keterbatasan

- Belum ada fitur download link (bisa ditambahkan menyusul, logic
  ekstraksinya sudah ada di `scraper.js` fungsi `getBatchLink` dan
  `extractEpisodeDownloads`, tinggal ditambahkan UI-nya)
- Belum dites langsung build jadi `.exe` di lingkungan Windows asli (dibuat
  di sandbox Linux tanpa Windows) — kemungkinan ada penyesuaian kecil versi
  `electron-builder`/Node saat pertama kali build di komputer kamu

## Disclaimer

Proyek ini murni untuk pembelajaran. Seluruh konten anime, judul, gambar,
dan hak cipta terkait adalah milik studio/pemegang lisensi masing-masing.

# 🌌 Yozoranime

<p align="center">
  <strong>Desktop Anime Streaming Application</strong>
</p>

<p align="center">
  Aplikasi desktop Windows untuk menonton anime subtitle Indonesia menggunakan Electron.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-31-47848F?style=for-the-badge&logo=electron&logoColor=white">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img src="https://img.shields.io/badge/Node.js-Required-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/Platform-Windows-0078D4?style=for-the-badge&logo=windows&logoColor=white">
</p>

---

## 📖 About

**Yozoranime** adalah aplikasi desktop anime streaming berbasis **Electron** yang dibuat untuk memberikan pengalaman menonton anime langsung dari aplikasi Windows tanpa perlu membuka browser secara terpisah.

Aplikasi menggunakan sistem scraping untuk mengambil informasi anime seperti:

* Anime ongoing
* Anime completed
* Search
* Genre
* Jadwal rilis
* Detail anime
* Episode
* Server / mirror streaming
* Resolusi video
* Link download

Video streaming ditampilkan menggunakan **Electron WebView**, sehingga pengguna tidak membutuhkan player eksternal seperti `mpv` atau `ffplay`.

---

# ✨ Features

## 🏠 Home

Menampilkan berbagai informasi anime dari source yang digunakan.

Fitur:

* Anime ongoing
* Anime completed
* Anime terbaru
* Search
* Genre
* Jadwal rilis
* Continue watching
* Watchlist
* Bookmark

---

## 🔎 Search

Cari anime langsung dari aplikasi.

Contoh:

```text
Naruto
One Piece
Bleach
Solo Leveling
```

Search dilakukan melalui scraper dan hasilnya ditampilkan langsung di aplikasi.

---

## 📚 Anime Detail

Setiap anime memiliki halaman detail yang berisi:

* Poster / thumbnail
* Judul anime
* Deskripsi
* Genre
* Total episode
* Daftar episode
* Character
* Tombol watch
* Download episode
* Download semua episode

---

## 🎬 Anime Streaming

Yozoranime memiliki player streaming berbasis **Electron WebView**.

Alur streaming:

```text
Anime
   ↓
Episode
   ↓
Server / Mirror
   ↓
Resolution
   ↓
Streaming Player
```

Resolusi yang tersedia bergantung pada source dan mirror:

```text
360p
480p
720p
```

Source dapat menyediakan kualitas yang berbeda.

---

## 🔄 Server / Mirror Selection

Jika sebuah episode memiliki beberapa server, pengguna dapat memilih server yang tersedia.

Contoh:

```text
Server
├── Mirror 1
├── Mirror 2
└── Mirror 3
```

Resolusi juga dapat dipilih berdasarkan data yang tersedia dari source.

---

# ⏭️ Auto Next Episode

Yozoranime memiliki fitur:

**Auto Lanjut Episode**

Ketika episode selesai, aplikasi dapat mendeteksi episode berikutnya dan melanjutkan playback secara otomatis.

Alurnya:

```text
Episode 01
   ↓
Selesai
   ↓
Detect Episode 02
   ↓
Countdown
   ↓
Episode 02
```

Fitur ini dapat diaktifkan atau dinonaktifkan dari halaman player.

---

# 🖼️ Picture-in-Picture

Yozoranime mendukung **Picture-in-Picture (PiP)**.

### Local Video

Untuk episode yang sudah didownload, video diputar menggunakan HTML `<video>` milik aplikasi sehingga PiP dapat menggunakan Picture-in-Picture API.

### Online Streaming

Untuk streaming online, Yozoranime mencoba memicu PiP pada video yang terdapat di halaman streaming melalui WebView.

> PiP online bergantung pada struktur player dari server/mirror yang digunakan.

Jika player menggunakan nested iframe atau struktur yang tidak dapat diakses, PiP mungkin tidak tersedia pada server tersebut.

---

# 📥 Download Manager

Yozoranime memiliki sistem download terintegrasi.

Pengguna dapat:

* Download satu episode
* Download semua episode
* Memilih kualitas
* Memilih host
* Melihat progress download
* Menghapus download
* Memutar episode yang sudah didownload

Contoh:

```text
Downloads
│
├── Anime A
│   ├── Episode 01
│   ├── Episode 02
│   └── Episode 03
│
└── Anime B
    ├── Episode 01
    └── Episode 02
```

---

## 📊 Download Progress

Progress download ditampilkan secara realtime.

Contoh:

```text
Episode 05
██████████████░░░░░░ 72%
```

Informasi yang dapat ditampilkan:

* Status
* Persentase
* Downloaded bytes
* Total bytes
* Error status

---

# 💾 Offline Playback

Episode yang telah berhasil didownload dapat diputar langsung dari aplikasi.

```text
Downloaded Episode
       ↓
Downloads
       ↓
Play
       ↓
Local Video
```

Pemutaran file lokal tidak membutuhkan koneksi internet.

---

# 📂 Custom Download Folder

Lokasi penyimpanan download dapat diubah dari halaman Settings.

Default folder:

```text
Downloads/Yozoranime
```

Pengguna dapat memilih folder lain melalui folder picker bawaan Electron.

---

# 📌 Watch History

Yozoranime menyimpan history episode yang telah ditonton.

Contoh:

```text
History

One Piece
Episode 1135

Naruto
Episode 220

Bleach
Episode 366
```

History digunakan untuk membantu pengguna melanjutkan anime yang sebelumnya ditonton.

---

# 🔖 Bookmark

Anime dapat disimpan sebagai bookmark.

Bookmark digunakan untuk menyimpan anime yang ingin ditonton kembali.

```text
Anime Detail
     ↓
Bookmark
     ↓
Bookmarks
```

---

# 📺 Watchlist

Selain bookmark, Yozoranime memiliki watchlist untuk menyimpan anime yang ingin ditonton.

Data lokal disimpan menggunakan browser storage milik renderer.

---

# 🔔 Episode Notification

Yozoranime dapat mendeteksi episode baru dari anime yang sebelumnya sudah ditonton.

Ketika episode baru tersedia, aplikasi dapat menampilkan:

* Notification
* Notification badge
* Notification panel

Contoh:

```text
🔔 New Episode

One Piece
Episode 1136 is now available
```

---

# 📅 Release Schedule

Yozoranime menyediakan halaman:

**Jadwal Rilis**

yang menampilkan jadwal anime berdasarkan hari.

Contoh:

```text
Monday
├── Anime A
└── Anime B

Tuesday
├── Anime C
└── Anime D
```

---

# 👤 Character Information

Informasi character diperoleh menggunakan **Jikan API / MyAnimeList data**.

Pada halaman anime tersedia tab:

```text
Episode
Character
```

Informasi character dapat mencakup:

* Character name
* Character image
* Matched anime title

Pencarian character dilakukan berdasarkan judul anime.

---

# 🎮 Discord Rich Presence

Yozoranime mendukung **Discord Rich Presence**.

Saat menonton anime, status Discord dapat menampilkan:

```text
Watching
One Piece

Episode 1135
```

Contoh konsep:

```text
Discord
┌─────────────────────────┐
│ Yozora                  │
│ Watching One Piece      │
│ Episode 1135            │
└─────────────────────────┘
```

Discord Rich Presence membutuhkan:

* Discord Desktop
* Discord Application
* Client ID
* Rich Presence Asset

### Setup Discord RPC

Buka:

```text
src/discordConfig.js
```

Kemudian isi:

```javascript
module.exports = {
  clientId: "YOUR_DISCORD_CLIENT_ID"
};
```

Buat Discord Application melalui:

[Discord Developer Portal](https://discord.com/developers/applications?utm_source=chatgpt.com)

Kemudian pada:

```text
Rich Presence
→ Art Assets
```

upload asset yang digunakan oleh aplikasi.

Jika kode menggunakan asset:

```text
yozora_logo
```

maka nama asset di Discord harus:

```text
yozora_logo
```

Discord Desktop harus berjalan pada komputer yang sama dengan Yozoranime.

---

# 🏗️ Architecture

Yozoranime menggunakan arsitektur Electron yang memisahkan:

```text
Main Process
     │
     ├── Scraper
     ├── Downloader
     ├── Discord RPC
     ├── Settings
     └── MAL / Jikan
     
     ↓ IPC

Preload
     ↓

Renderer
     │
     ├── UI
     ├── Navigation
     ├── Search
     ├── Player
     ├── History
     ├── Bookmark
     ├── Watchlist
     └── Downloads
```

---

# 📁 Project Structure

```text
otaku-electron/
│
├── main.js
├── preload.js
├── package.json
│
├── src/
│   ├── scraper.js
│   ├── downloader.js
│   ├── discordRpc.js
│   ├── discordConfig.js
│   ├── mal.js
│   └── settings.js
│
├── renderer/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── icons.js
│   └── webview-preload.js
│
└── build/
```

---

# 🧩 Main Components

## `main.js`

Main Electron process.

Bertanggung jawab terhadap:

* Membuat BrowserWindow
* IPC handlers
* Scraper
* Downloader
* Discord RPC
* Settings
* External links

Window default:

```text
1200 × 800
```

Minimum:

```text
900 × 600
```

---

## `preload.js`

Menjadi jembatan aman antara renderer dan Electron main process.

Menggunakan:

```javascript
contextBridge
ipcRenderer
```

Renderer mengakses API melalui:

```javascript
window.otaku
```

Contoh:

```javascript
window.otaku.search(query);
```

---

## `scraper.js`

Core scraping engine Yozoranime.

Menangani:

```text
Ongoing
Completed
Search
Genres
Genre Pages
Schedule
Anime Detail
Episode
Mirror Resolution
Batch Downloads
```

Scraper menggunakan:

```text
Axios
Cheerio
```

dan mekanisme retry serta request handling untuk source website.

---

## `downloader.js`

Menangani seluruh proses download.

Fitur:

```text
Single Episode Download
Bulk Download
Download Progress
Download Manifest
Local File Detection
Delete Download
```

Manifest download disimpan di:

```text
downloads-manifest.json
```

pada Electron user data directory.

---

## `discordRpc.js`

Menangani Discord Rich Presence.

Fungsi utama:

```text
Initialize RPC
Set Activity
Clear Activity
Reconnect / Connection handling
```

---

## `mal.js`

Mengambil informasi character menggunakan:

```text
Jikan API
```

Data diperoleh berdasarkan pencarian judul anime.

---

## `settings.js`

Mengelola konfigurasi aplikasi seperti lokasi folder download.

---

# 🛠️ Tech Stack

| Technology       | Usage                        |
| ---------------- | ---------------------------- |
| Electron         | Desktop application          |
| JavaScript       | Application logic            |
| HTML             | UI structure                 |
| CSS              | UI styling                   |
| Node.js          | Backend/main process runtime |
| Axios            | HTTP requests                |
| Cheerio          | HTML parsing                 |
| Discord RPC      | Discord Rich Presence        |
| Jikan API        | Character information        |
| WebView          | Online video playback        |
| Electron Builder | Windows packaging            |

---

# 📦 Requirements

Untuk menjalankan project dari source code:

* Windows
* Node.js
* npm
* Git
* Discord Desktop *(optional, hanya untuk Rich Presence)*

Direkomendasikan menggunakan Node.js versi LTS.

---

# 🚀 Installation

Clone repository:

```bash
git clone https://github.com/USERNAME/Yozora.git
```

Masuk ke folder:

```bash
cd Yozora
```

Install dependencies:

```bash
npm install
```

Jalankan aplikasi:

```bash
npm start
```

---

# 🧪 Development

Untuk menjalankan aplikasi dalam development mode:

```bash
npm start
```

Electron akan membuka aplikasi secara langsung.

Tidak diperlukan browser eksternal.

---

# 🏗️ Build Windows `.exe`

Project menggunakan:

```text
electron-builder
```

Untuk membuat build Windows:

```bash
npm run dist
```

Package akan dibuat berdasarkan konfigurasi pada:

```text
package.json
```

Target Windows:

```text
NSIS Installer
Portable
```

Konfigurasi saat ini:

```json
"win": {
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    },
    {
      "target": "portable",
      "arch": ["x64"]
    }
  ]
}
```

---

# 📦 Build Output

Setelah menjalankan:

```bash
npm run dist
```

hasil build berada di:

```text
dist/
```

Dengan target:

```text
Yozora Setup x.x.x.exe
```

untuk installer Windows.

Dan:

```text
Yozora x.x.x.exe
```

untuk portable version.

---

# 🖼️ Custom Application Icon

Custom icon dapat ditambahkan ke:

```text
build/icon.ico
```

Kemudian konfigurasi Windows pada `package.json`:

```json
"win": {
  "icon": "build/icon.ico",
  "target": [
    {
      "target": "nsis",
      "arch": ["x64"]
    },
    {
      "target": "portable",
      "arch": ["x64"]
    }
  ]
}
```

Direkomendasikan menggunakan icon `.ico` dengan ukuran hingga:

```text
256 × 256
```

---

# 🌐 Changing Source Domain

Jika domain source berubah, base URL dapat diubah melalui aplikasi.

API yang tersedia:

```javascript
window.otaku.setBaseUrl("https://new-domain.example");
```

Atau ubah default URL pada:

```text
src/scraper.js
```

---

# 🔐 Security

Renderer process tidak memiliki:

```text
nodeIntegration
```

dan menggunakan:

```text
contextIsolation: true
```

Communication antara renderer dan main process dilakukan menggunakan:

```text
IPC
Context Bridge
```

API yang tersedia pada renderer diekspos melalui:

```text
window.otaku
```

---

# ⚠️ Limitations

Beberapa fitur bergantung pada website/source pihak ketiga.

Perubahan pada website dapat menyebabkan:

* Scraper tidak menemukan anime
* Episode tidak muncul
* Server streaming berubah
* Link download berubah
* Mirror tidak dapat di-resolve
* Cloudflare / anti-bot muncul
* Beberapa fitur berhenti bekerja

Khusus streaming:

> Kontrol video seperti play/pause/seek berasal dari player pada halaman streaming pihak ketiga. Karena player dapat berada pada iframe/cross-origin WebView, Yozora tidak selalu dapat mengontrol semua fungsi player secara langsung.

PiP online juga bergantung pada struktur player dari server yang digunakan.

---

# 📝 Roadmap

* [x] Anime ongoing
* [x] Anime completed
* [x] Search
* [x] Genre
* [x] Release schedule
* [x] Anime detail
* [x] Episode list
* [x] Streaming
* [x] Server selection
* [x] Resolution selection
* [x] Auto next episode
* [x] Picture-in-Picture
* [x] Watch history
* [x] Bookmark
* [x] Watchlist
* [x] Download manager
* [x] Bulk episode download
* [x] Offline playback
* [x] Custom download directory
* [x] Discord Rich Presence
* [x] Character information
* [ ] Cross-device synchronization
* [ ] Cloud library
* [ ] More streaming sources
* [ ] Automatic application updater
* [ ] Subtitle selection dari multiple language source

---

# 🤝 Contributing

Contribution sangat terbuka.

Jika ingin menambahkan fitur atau memperbaiki bug:

1. Fork repository
2. Buat branch baru

```bash
git checkout -b feature/new-feature
```

3. Lakukan perubahan
4. Commit

```bash
git add .
git commit -m "Add new feature"
```

5. Push branch

```bash
git push origin feature/new-feature
```

6. Buat Pull Request

---

# ⚖️ Disclaimer

Yozoranime dibuat untuk **tujuan pembelajaran dan penggunaan pribadi**.

Aplikasi ini tidak memiliki, menyimpan, atau mendistribusikan konten anime secara langsung.

Informasi anime, gambar, video, streaming server, dan link download berasal dari sumber pihak ketiga.

Seluruh hak cipta atas anime, karakter, gambar, video, dan materi terkait tetap menjadi milik masing-masing studio, publisher, distributor, atau pemegang hak cipta.

Pengguna bertanggung jawab untuk memastikan penggunaan aplikasi sesuai dengan hukum dan Terms of Service yang berlaku di wilayah masing-masing.

Jika source pihak ketiga mengubah struktur website, API, domain, atau sistem keamanan mereka, beberapa fitur Yozoranime dapat berhenti berfungsi.

---

# 📄 License

Project ini dibuat untuk tujuan pembelajaran dan penggunaan pribadi.

Jika repository ini akan didistribusikan secara publik, silakan tambahkan lisensi sesuai kebutuhan project.

---

<p align="center">

### 🌌 Yozoranime

**Watch anime. Explore the night.**

</p>

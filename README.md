# 🚀 PulseCall - Görüntülü Görüşme & Anlık Sohbet Uygulaması

PulseCall; React Native (Expo), Node.js (Socket.IO signaling), WebRTC ve Supabase (Auth, PostgreSQL, Realtime & Storage) kullanılarak geliştirilmiş, **tamamen ücretsiz ve açık kaynak teknolojilere dayalı** modern bir görüntülü sohbet ve anlık mesajlaşma platformudur.

---

## 🛠️ Teknoloji Mimarisi

- **Mobil & Web İstemci:** React Native + Expo (TypeScript, Expo Linear Gradient, Lucide Icons)
- **Veritabanı & Kimlik Doğrulama:** Supabase (PostgreSQL, Supabase Auth, Row Level Security)
- **Anlık Mesajlaşma (Realtime):** Supabase Realtime (WebSocket tabanlı)
- **Görüntülü / Sesli Görüşme:** WebRTC (Peer-to-Peer doğrudan şifreli medya akışı)
- **Sinyalleşme Sunucusu (Signaling):** Node.js + Express + Socket.IO (Port 5000)
- **Medya / Profil Depolama:** Supabase Storage (`avatars` public bucket)

---

## 📋 Gereksinimler

- [Node.js](https://nodejs.org/) (v18 veya üzeri önerilir)
- npm veya yarn
- [Expo Go](https://expo.dev/go) mobil uygulaması (Telefonla test etmek için iOS App Store veya Google Play Store'dan ücretsiz indirilebilir)
- Ücretsiz [Supabase](https://supabase.com) hesabı

---

## 🚀 Projeyi Sıfırdan Ayağa Kaldırma Adımları

### 1. Supabase Kurulumu (Veritabanı, Realtime & Storage)

1. [Supabase](https://supabase.com) üzerinde oturum açın ve ücretsiz yeni bir proje oluşturun.
2. **Tabloları Oluşturma:**
   - Sol menüden **SQL Editor** bölümüne gidin.
   - Proje kök dizininde yer alan [`supabase_schema.sql`](./supabase_schema.sql) dosyasının içeriğini kopyalayıp SQL Editor'e yapıştırın ve **Run** butonuna basarak çalıştırın.
3. **Storage (Profil Fotoğrafları Depolama) Alanı:**
   - SQL Editor'de yeni bir sekme açın ve [`storage_setup.sql`](./storage_setup.sql) dosyasının içeriğini çalıştırın.
   *(Bu işlem `avatars` adında herkese açık depolama alanını ve okuma/yükleme izinlerini oluşturur).*
4. **E-posta Onayını Kapatma (Geliştirme Kolaylığı İçin):**
   - **Authentication -> Providers -> Email** bölümüne gidin.
   - **"Confirm email"** seçeneğini kapatıp kaydedin (Böylece kullanıcılar kayıt olduğu anda doğrulama beklemeden giriş yapabilir).
5. **API Anahtarlarını Alma:**
   - **Project Settings -> API** bölümüne gidin.
   - `Project URL` ve `anon public` anahtarınızı kopyalayın.

---

### 2. İstemci (Mobile) Ortam Ayarları

Mobil uygulamanın Supabase ve sinyalleşme sunucusuna bağlanması için:

1. `mobile/src/services/supabase.ts` dosyasını açın:
   - `SUPABASE_URL` alanına kendi proje URL'nizi girin.
   - `SUPABASE_ANON_KEY` alanına kendi anon public anahtarınızı girin.
2. `mobile/src/services/socket.ts` dosyasını açın:
   - Bilgisayarınızın yerel IP adresini (örneğin `http://192.168.1.XXX:5000`) sinyalleşme adresi olarak kontrol edin.

---

### 3. Sinyalleşme Sunucusunu Başlatma (Signaling Server)

WebRTC çağrı sinyalleri için Node.js sunucusunu çalıştırın:

```powershell
# 1. Server klasörüne gidin
cd server

# 2. Gerekli paketleri kurun (ilk kez yapılıyorsa)
npm install

# 3. Sunucuyu başlatın
npm start
```
*Sunucu varsayılan olarak `http://0.0.0.0:5000` portunda dinlemeye başlayacaktır.*

---

### 4. Mobil / Web Uygulamasını Başlatma (Expo)

Ayrı bir terminal penceresi açın:

```powershell
# 1. Mobile klasörüne gidin
cd mobile

# 2. Paketleri kurun (ilk kez yapılıyorsa)
npm install

# 3. Uygulamayı başlatın
npx expo start
```

#### Uygulamayı Test Etme Seçenekleri:

- **Bilgisayar Tarayıcısında (Web):**
  Terminalde klavyeden **`w`** tuşuna basın (veya `npx expo start --web`). Uygulama `http://localhost:8081` adresinde açılır.
- **Gerçek Telefonda (Expo Go):**
  - Bilgisayarınız ve telefonunuz aynı Wi-Fi ağına bağlıyken terminaldeki QR kodu **Expo Go** uygulamasıyla taratın.
  - Veya uzak ağlardan bağlanmak için:
    ```powershell
    npx expo start --tunnel
    ```

---

## 📱 Özellikler & Fonksiyonlar

- [x] **Kayıt Ol / Giriş Yap:** E-posta ve şifre tabanlı modern kimlik doğrulama.
- [x] **Kullanıcılar & Sohbetler Listesi:** Aktif hikayeler çubuğu (stories strip), canlı kişi arama ve son mesaj atanların en üste sıralanması.
- [x] **Anlık Mesajlaşma (Chat):** Supabase Realtime ile çift taraflı canlı mesaj iletimi, iletildi (tek gri tik) ve okundu (çift mavi tik) durumları.
- [x] **Global Yüzen Bildirimler (In-App Push):** Kullanıcı ana ekrandayken mesaj geldiğinde üstten açılan iOS/Telegram tarzı etkileşimli bildirim kartı.
- [x] **WebRTC Görüntülü & Sesli Arama:** P2P şifreli akış, gelen arama penceresi, canlı görüşme süresi sayacı (`00:00`), kamera/mikrofon sessize alma.
- [x] **Profil & Depolama Yönetimi:** Galeriden fotoğraf seçip Supabase Storage'a yükleme, kullanıcı adı/ad soyad düzenleme ve şifre güncelleme.


exe:
1. Terminal (Arama & Sinyalleşme Sunucusu İçin):
powershell
cd server
npm start

2. Terminal (Mobil/Web Arayüzü İçin):

Yeni bir terminal sekmesi aç ve şunu yaz:
powershell
cd mobile
npx expo start --web
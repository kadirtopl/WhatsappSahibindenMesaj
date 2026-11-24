# WhatsApp Bot for Real Estate

Firebase Realtime Database ve WhatsApp Web API kullanarak geliştirilmiş emlak ilanları için otomatik mesajlaşma botu.

## Özellikler

- Firebase Realtime Database entegrasyonu
- Otomatik mesaj gönderimi
- Bölgeye göre ilan filtreleme
- Günlük mesaj limiti kontrolü
- Gönderilen müşteri takibi
- Otomatik QR kod ile WhatsApp bağlantısı

## Kurulum

1. Gerekli bağımlılıkları yükleyin:
```bash
npm install
```

2. `.env` dosyasını düzenleyin:
```env
# Firebase Yapılandırması
FIREBASE_DATABASE_URL=your_database_url

# WhatsApp Bot Ayarları
WHATSAPP_SESSION_PATH=./whatsapp-session
WHATSAPP_AUTH_PATH=./.wwebjs_auth
```

3. Botu başlatın:
```bash
npm start
```

## Kullanım

1. Bot başlatıldığında QR kod görüntülenecek
2. QR kodu WhatsApp'tan okutun
3. ENTER tuşuna basarak manuel mesaj gönderimi yapabilirsiniz
4. 2 dakika bekleyerek otomatik gönderime geçebilirsiniz
5. Günlük maksimum 40 mesaj gönderilir

## Firebase Veri Yapısı

```json
{
    "basiskele": {
        "ilan_id": {
            "baslik": "İlan Başlığı",
            "fiyat": "5.000 TL",
            "link": "https://ilan.link",
            "bolge": "Başiskele",
            "odaSayisi": "3+1",
            "metrekare": "120",
            "iletisimIsmi": "Ahmet Yılmaz"
        }
    },
    "izmit": {
        "ilan_id": {
            // ... ilan bilgileri
        }
    }
}
```

## Notlar

- Her gün maksimum 40 mesaj gönderilir
- Aynı müşteriye tekrar mesaj gönderilmez
- İlanlar bölgeye ve müşteri tercihlerine göre filtrelenir
- Otomatik gönderim 2 dakika aralıklarla çalışır


## Güvenlik
Firebase servis hesabı anahtarı, WhatsApp oturumu ve toplanan kişisel veriler depoya eklenmez. Ayarlar ortam değişkenlerinden (`FIREBASE_DATABASE_URL`, `FIREBASE_CREDENTIALS`, `TARGET_NUMBER`) okunur.

# Liste

Windows için sade, yerel bir günlük yapılacaklar + mini lead CRM uygulaması. Electron ile yazıldı; verin bilgisayarında bir JSON dosyasında durur — hesap yok, bulut yok, internet yok.

*A minimal local-first daily todo + lead CRM desktop app for Windows (Electron). Your data lives in a local JSON file — no account, no cloud.*

![Electron](https://img.shields.io/badge/Electron-koyu%20tema-ff7a2f)

## Özellikler

- **Günlük sayfa** — her gün otomatik yeni sayfa; bitmeyen işler ertesi güne kendiliğinden devreder ve "N gündür taşınıyor" rozeti alır
- **Ekran görüntüsü yapıştırma** — Ctrl+V ile görsel doğrudan göreve eklenir
- **Hatırlatmalar** — görev başına tarih/saat; pencere kapalıyken bile Windows bildirimi düşer
- **Kenar oku** — ekran kenarında duran yarı saydam ok: tıkla → panel açılır (Ctrl+Alt+L), sürükle → istediğin kenara taşı; aktif görevlerde parlar
- **Dashboard** — aktif görev, günlük ilerleme, haftalık bitirme yüzdesi, 7 gün grafiği
- **Lead (mini CRM)** — aşamalı pipeline (Yeni → Görüşüldü → Teklif → Dönüş bekleniyor → Satış/Kayıp), görüşmeye 30 dk kala + saatinde bildirim, takip hatırlatıcıları, not günlüğü, "sonraki adım yok" uyarısı
- **Silinenler arşivi** — silinen kayıtlar 30 gün geri alınabilir
- **Sistem tepsisi** — kapatınca tepsiye küçülür, Windows açılışında sessizce başlar

## Kurulum

```bash
git clone https://github.com/KULLANICI/liste.git
cd liste
npm install
npm start
```

## Veri

Tüm veri uygulama klasöründeki `veri.json` dosyasında tutulur (ilk çalıştırmada oluşur). Yapıştırılan görseller `gorseller/` klasörüne kaydedilir. Dosya formatı ve dış araçlarla entegrasyon için `BENIOKU.md`'ye bak.

## Lisans

MIT

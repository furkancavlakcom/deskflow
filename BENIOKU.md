# Liste — veri formatı ve dış araç entegrasyonu

Electron masaüstü uygulaması. Sistem tepsisinde yaşar, pencere kapansa da hatırlatma bildirimi atar, Windows açılışında `--gizli` bayrağıyla tepside başlar.

Bu doküman, dış bir araçtan (betik, otomasyon, AI asistanı vb.) uygulamaya veri yazmak isteyenler içindir.

## Görev nasıl yazılır

Veri tek dosyada: `veri.json`. Uygulama bu dosyayı izler (1,5 sn'de bir) — dışarıdan yazılan görev arayüzde kendiliğinden belirir, uygulamayı yeniden başlatmak gerekmez.

`maddeler` dizisine şu şemayla obje eklenir:

```json
{
  "id": "benzersiz-string",
  "gun": "YYYY-MM-DD",
  "metin": "görev metni",
  "bitti": false,
  "bittiZaman": null,
  "hatirlatma": null,
  "hatirlatildi": false,
  "gorseller": [],
  "olusturma": 1785440000000
}
```

- `gun`: görevin görüneceği gün (genelde bugün). Bitmemiş görevler her gün otomatik bugüne devredilir (`ilkGun` alanına ilk günü yazılır).
- `hatirlatma`: epoch **milisaniye**; vakti gelince uygulama Windows bildirimi atar. İstenmiyorsa `null`.
- `gorseller`: `gorseller/` klasöründeki dosya adları.
- `olusturma`: epoch ms — sıralama bunun üstünden.
- `silindi` (opsiyonel): epoch ms — doluysa görev "Silinenler" arşivindedir (listede/istatistikte görünmez, 30 gün sonra kalıcı temizlenir). Silme = bu alanı doldurmak, geri alma = alanı silmek.

## Lead (mini CRM) — `leadler` dizisi

Dosyada `maddeler`in yanında `leadler` dizisi var:

```json
{
  "id": "lead-1722400000000-ab12",
  "marka": "Marka Adı",
  "detay": "bütçe, sektör, nereden geldi, notlar (opsiyonel)",
  "gorusme": 1722445200000,
  "durum": "yeni",
  "takip": null,
  "takipNot": "",
  "takipUyarildi": false,
  "notlar": [],
  "uyarildi30": false,
  "uyarildi0": false,
  "olusturma": 1722400000000
}
```

- `gorusme`: görüşmenin tarihi-saati, epoch **milisaniye**; opsiyonel (`null` = henüz planlanmadı). Uygulama 30 dk kala ve tam saatinde bildirim atar (`uyarildi30`/`uyarildi0` bayraklarını kendisi işler — dışarıdan yazarken `false` bırak).
- `durum` (CRM aşaması): `yeni` | `gorusuldu` | `teklif` (teklif iletildi) | `donus` (dönüş bekleniyor) | `satis` (satış alındı) | `kayip` (kaybedildi). `satis`/`kayip` lead'i kapatır (bildirim gitmez, sayaçtan düşer). Durumu `satis` yaparken `satisZaman` (epoch ms) da yazılır — Dashboard "bu ay satış" bunu okur.
- `takip` (epoch ms|null) + `takipNot` (string): "sonraki adım" hatırlatıcısı — saatinde bildirim atılır (`takipUyarildi` bayrağını uygulama işler). İlke: **aktif lead'de ya gelecekte görüşme ya da takip olmalı**; ikisi de yoksa arayüz "sonraki adım yok" uyarısı basar.
- `notlar`: `[{t: epoch_ms, metin: "..."}]` — görüşme/telefon özetleri.
- `silindi` alanı görevlerle aynı mantık.

## Yazma kuralları

- ⚠️ **`maddeler` VE `leadler`i birlikte koru** — tüm dosyayı oku, ilgili diziye ekle, tamamını geri yaz. Tek diziyi yazıp diğerini düşürmek veri kaybıdır.
- ⚠️ **Dosya BOM'suz UTF-8 yazılmalı.** PowerShell `Out-File -Encoding utf8` başa BOM koyar ve uygulama dosyayı okuyamaz hale gelir (liste boş görünür). Node (`fs.writeFileSync` + `JSON.stringify`) gibi BOM'suz yazan bir yol kullan.
- Not: Bildirimler tepsi balonu (`tray.displayBalloon`) üzerinden gider — standart Electron `Notification` bazı Windows kurulumlarında sessizce yutulabiliyor.

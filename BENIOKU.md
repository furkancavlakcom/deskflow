# Liste — Furkan'ın günlük yapılacaklar uygulaması

Electron masaüstü uygulaması. Sistem tepsisinde yaşar, pencere kapansa da hatırlatma bildirimi atar, Windows açılışında `--gizli` bayrağıyla tepside başlar.

## Claude için: buraya görev nasıl yazılır

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
- `hatirlatma`: epoch **milisaniye** (Türkiye yereli); vakti gelince uygulama Windows bildirimi atar. İstenmiyorsa `null`.
- `gorseller`: `gorseller/` klasöründeki dosya adları.
- `olusturma`: epoch ms — sıralama bunun üstünden.
- `silindi` (opsiyonel): epoch ms — doluysa görev "Silinenler" arşivindedir (listede/istatistikte görünmez, 30 gün sonra kalıcı temizlenir). Silme = bu alanı doldurmak, geri alma = alanı silmek.

## Lead (görüşme takibi) — `leadler` dizisi

Dosyada `maddeler`in yanında `leadler` dizisi var. Furkan "lead ekle / X markasıyla görüşmem var" derse buraya yazılır:

```json
{
  "id": "lead-1722400000000-ab12",
  "marka": "Marka Adı",
  "detay": "bütçe, sektör, nereden geldi, notlar (opsiyonel)",
  "gorusme": 1722445200000,
  "bitti": false,
  "uyarildi30": false,
  "uyarildi0": false,
  "olusturma": 1722400000000
}
```

- `gorusme`: görüşmenin tarihi-saati, epoch **milisaniye**. Uygulama 30 dk kala ve tam saatinde bildirim atar (`uyarildi30`/`uyarildi0` bayraklarını kendisi işler — sen `false` yaz).
- `durum` (CRM aşaması): `yeni` | `gorusuldu` | `teklif` (teklif iletildi) | `donus` (dönüş bekleniyor) | `satis` (satış alındı) | `kayip` (kaybedildi). Yeni lead'de `"yeni"` yaz. `satis`/`kayip` lead'i kapatır (bildirim gitmez, sayaçtan düşer). Durumu `satis` yaparken `satisZaman` (epoch ms) da yaz — Dashboard "bu ay satış" bunu okur.
- `gorusme` artık OPSIYONEL (`null` olabilir — görüşme henüz planlanmadıysa).
- `takip` (epoch ms|null) + `takipNot` (string): "sonraki adım" hatırlatıcısı — saatinde bildirim atılır (`takipUyarildi` bayrağını uygulama işler, sen `false` yaz). İlke: **aktif lead'de ya gelecekte görüşme ya da takip olmalı**; ikisi de yoksa arayüz "sonraki adım yok" uyarısı basar.
- `notlar`: `[{t: epoch_ms, metin: "..."}]` — görüşme/telefon özetleri buraya eklenir (Furkan "Piermoda notu ekle: ..." derse buraya push'la).
- `silindi` alanı görevlerle aynı mantık.
- ⚠️ **Dosyaya yazarken `maddeler` VE `leadler`i birlikte koru** — tüm dosyayı oku, ilgili diziye ekle, tamamını geri yaz. Tek diziyi yazıp diğerini düşürmek veri kaybıdır.

Yazarken JSON'u bozma: dosyayı oku → diziye ekle → tamamını geri yaz.

⚠️ **Dosya BOM'suz UTF-8 yazılmalı.** PowerShell `Out-File -Encoding utf8` başa BOM koyar ve uygulama dosyayı okuyamaz hale gelir (liste boş görünür). Bu dosyaya yazmak için node kullan (`fs.writeFileSync` + `JSON.stringify`), PowerShell ConvertTo-Json/Out-File KULLANMA.

Bildirimler tepsi balonu (displayBalloon) üzerinden gider — standart Electron `Notification` bu makinede Windows tarafından sessizce yutuluyordu.

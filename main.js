const { app, BrowserWindow, Tray, Menu, Notification, ipcMain, nativeImage, screen, globalShortcut } = require("electron");
const fs = require("fs");
const path = require("path");

const KOK = __dirname;
const VERI = path.join(KOK, "veri.json");
const GORSEL = path.join(KOK, "gorseller");
if (!fs.existsSync(GORSEL)) fs.mkdirSync(GORSEL);

const gizliBaslat = process.argv.includes("--gizli");
let win = null;
let tray = null;
let kapaniyor = false;

/* ---------- veri ---------- */
function oku() {
  try {
    const v = JSON.parse(fs.readFileSync(VERI, "utf8"));
    return {
      maddeler: Array.isArray(v.maddeler) ? v.maddeler : [],
      leadler: Array.isArray(v.leadler) ? v.leadler : [],
    };
  } catch {
    return { maddeler: [], leadler: [] };
  }
}
function yaz(v) {
  fs.writeFileSync(VERI, JSON.stringify(v, null, 2));
}
const bugunKodu = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/* ---------- bildirim: önce tepsi yolu (Windows toast engeline takılmaz), olmazsa standart ---------- */
function bildir(baslik, govde) {
  if (process.platform === "win32" && tray) {
    try {
      tray.displayBalloon({
        icon: path.join(KOK, "ikon.png"),
        iconType: "custom",
        title: baslik,
        content: govde,
        respectQuietTime: false,
      });
      return;
    } catch {}
  }
  const n = new Notification({ title: baslik, body: govde, icon: path.join(KOK, "ikon.png") });
  n.on("click", () => { if (win) { win.show(); win.focus(); } });
  n.show();
}

/* ---------- bakım: devir + alarm (pencere kapalıyken de çalışır) ---------- */
function bakim() {
  const v = oku();
  const bugun = bugunKodu();
  const simdi = Date.now();
  let degisti = false;
  for (const m of v.maddeler) {
    if (m.silindi) continue; // arşivdekiler devir/alarm görmez
    if (!m.bitti && m.gun < bugun) {
      m.ilkGun = m.ilkGun || m.gun;
      m.gun = bugun;
      degisti = true;
    }
    if (m.hatirlatma && !m.hatirlatildi && !m.bitti && m.hatirlatma <= simdi) {
      m.hatirlatildi = true;
      degisti = true;
      bildir("Liste — Hatırlatma", m.metin);
    }
  }
  // lead görüşme bildirimleri: 30 dk kala + tam saatinde
  for (const l of v.leadler) {
    const kapali = l.bitti || l.durum === "satis" || l.durum === "kayip";
    if (l.silindi || kapali) continue;
    if (l.gorusme) {
      if (!l.uyarildi30 && l.gorusme > simdi && l.gorusme - simdi <= 30 * 60 * 1000) {
        l.uyarildi30 = true;
        degisti = true;
        bildir("Liste — Görüşme yaklaşıyor", `${l.marka} — 30 dk sonra görüşme var`);
      }
      if (!l.uyarildi0 && l.gorusme <= simdi) {
        l.uyarildi0 = true; l.uyarildi30 = true;
        degisti = true;
        bildir("Liste — Görüşme zamanı", `${l.marka} görüşmesi ŞİMDİ`);
      }
    }
    if (l.takip && !l.takipUyarildi && l.takip <= simdi) {
      l.takipUyarildi = true;
      degisti = true;
      bildir("Liste — Takip zamanı", `${l.marka}${l.takipNot ? " — " + l.takipNot : ""}`);
    }
  }
  // arşivde 30 günü dolduranlar kalıcı temizlenir
  const onceki = v.maddeler.length + v.leadler.length;
  v.maddeler = v.maddeler.filter((m) => !m.silindi || simdi - m.silindi < 30 * 86400000);
  v.leadler = v.leadler.filter((l) => !l.silindi || simdi - l.silindi < 30 * 86400000);
  if (v.maddeler.length + v.leadler.length !== onceki) degisti = true;
  if (degisti) {
    yaz(v);
    bilinenIds = new Set([...v.maddeler, ...v.leadler].map((m) => m.id)); // kendi yazımımız dış-kayıt sayılmasın
    if (win) win.webContents.send("veri-degisti");
  }
  rozetGuncelle();
}

/* ---------- pencere ---------- */
function pencereKur() {
  win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 420,
    minHeight: 360,
    show: !gizliBaslat,
    backgroundColor: "#0c0d11",
    autoHideMenuBar: true,
    icon: path.join(KOK, "ikon.png"),
    webPreferences: { preload: path.join(KOK, "preload.js") },
  });
  win.loadFile("index.html");
  win.on("resize", () => boyutKaydetGecikmeli());
  win.on("close", (e) => {
    if (!kapaniyor) {
      e.preventDefault();
      win.hide(); // kapat = tepsiye küçült, uygulama yaşamaya devam eder
    }
  });
}

/* ================= KENAR OKU + HIZLI PANEL ================= */
let sap = null;
let panelAcik = false;

/* ---- ok rozeti: aktif görev sayısı + olay parlaması ---- */
let bilinenIds = new Set();
let disYeni = false; // dışarıdan (Claude/dosya) eklenen görülmemiş görev var mı
let sonBakis = 0; // kullanıcının panele son bakışı — parlama ancak bundan SONRAKİ olaylarda yanar

function rozetGuncelle() {
  if (!sap || sap.isDestroyed()) return;
  const v = oku();
  const bugun = bugunKodu();
  const simdi = Date.now();
  const sayi = v.maddeler.filter((m) => m.gun === bugun && !m.bitti && !m.silindi).length;
  const yaklasan = v.maddeler.some((m) =>
    !m.bitti && !m.silindi && m.hatirlatma && !m.hatirlatildi &&
    m.hatirlatma > simdi && m.hatirlatma - simdi <= 30 * 60 * 1000 &&
    m.hatirlatma - 30 * 60 * 1000 > sonBakis); // son bakıştan sonra "yaklaşan"a girenler parlar
  const pencere30 = (ts) => ts && ts > simdi && ts - simdi <= 30 * 60 * 1000 && ts - 30 * 60 * 1000 > sonBakis;
  const yaklasanLead = v.leadler.some((l) =>
    !l.bitti && l.durum !== "satis" && l.durum !== "kayip" && !l.silindi &&
    (pencere30(l.gorusme) || pencere30(l.takip)));
  sap.webContents.send("sap-rozet", { sayi, parla: yaklasan || yaklasanLead || disYeni });
}

/* kullanıcı ayarları (kalıcı) */
const AYARP = path.join(KOK, "ayar.json");
let AYAR = { kenar: "sol", boyut: "orta", oran: 0.5, ekranId: null, panelGen: 640, panelBoy: 740 };
try {
  const eski = JSON.parse(fs.readFileSync(AYARP, "utf8"));
  AYAR = { ...AYAR, ...eski };
  if (eski.dikeyOran != null && eski.oran == null) AYAR.oran = eski.dikeyOran; // eski alan adı göçü
} catch {}
function ayarYaz() { try { fs.writeFileSync(AYARP, JSON.stringify(AYAR, null, 2)); } catch {} }

const BOYUTLAR = { kucuk: [22, 96], orta: [30, 140], buyuk: [40, 190] }; // [ince, uzun]
const dikeyMi = () => AYAR.kenar === "sol" || AYAR.kenar === "sag";

/* bir ekranın hangi kenarları DIŞA bakar? (başka monitöre yapışık iç kenarlar elenir) */
function disKenarlar(ekran) {
  const b = ekran.bounds;
  const izin = { sol: true, sag: true, ust: true, alt: true };
  for (const d of screen.getAllDisplays()) {
    if (d.id === ekran.id) continue;
    const o = d.bounds;
    const dikeyKesisim = o.y < b.y + b.height && o.y + o.height > b.y;
    const yatayKesisim = o.x < b.x + b.width && o.x + o.width > b.x;
    if (dikeyKesisim && Math.abs(o.x + o.width - b.x) < 4) izin.sol = false;
    if (dikeyKesisim && Math.abs(b.x + b.width - o.x) < 4) izin.sag = false;
    if (yatayKesisim && Math.abs(o.y + o.height - b.y) < 4) izin.ust = false;
    if (yatayKesisim && Math.abs(b.y + b.height - o.y) < 4) izin.alt = false;
  }
  return izin;
}

function hedefEkran() {
  const hepsi = screen.getAllDisplays();
  const secili = hepsi.find((d) => d.id === AYAR.ekranId);
  if (secili) return secili;
  const ana = screen.getPrimaryDisplay();
  return hepsi.find((d) => d.id !== ana.id) || ana; // seçim yoksa: varsa 2. ekran
}

function sapSinirlari() {
  const ekran = hedefEkran();
  const e = ekran.bounds; // gerçek ekran kenarı (görev çubuğu dahil) — ok tam dibe yapışır, üstte kalır
  const dis = disKenarlar(ekran);
  const [ince, uzun] = BOYUTLAR[AYAR.boyut] || BOYUTLAR.orta;
  const oran = Math.min(1, Math.max(0, AYAR.oran));
  // monitör birleşimi kenarında 1px içeri çekilir — komşu monitöre taşma/yanlış monitöre atanma olmaz
  if (dikeyMi()) {
    const x = AYAR.kenar === "sag"
      ? e.x + e.width - ince - (dis.sag ? 0 : 3)
      : e.x + (dis.sol ? 0 : 3);
    const y = Math.min(e.y + e.height - uzun, Math.max(e.y, Math.round(e.y + e.height * oran - uzun / 2)));
    return { x, y, width: ince, height: uzun };
  }
  const y = AYAR.kenar === "alt"
    ? e.y + e.height - ince - (dis.alt ? 0 : 3)
    : e.y + (dis.ust ? 0 : 3);
  const x = Math.min(e.x + e.width - uzun, Math.max(e.x, Math.round(e.x + e.width * oran - uzun / 2)));
  return { x, y, width: uzun, height: ince };
}

function sapKur() {
  if (sap && !sap.isDestroyed()) { try { sap.close(); } catch {} }
  sap = null;
  const b = sapSinirlari();
  sap = new BrowserWindow({
    ...b,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true,
    resizable: false, movable: false, hasShadow: false,
    webPreferences: { preload: path.join(KOK, "preload.js") },
  });
  sap.loadFile("sap.html");
  sap.setAlwaysOnTop(true, "screen-saver");
  sap.webContents.on("did-finish-load", () => {
    if (sap && !sap.isDestroyed()) sap.webContents.send("sap-ayar", { kenar: AYAR.kenar, acik: panelAcik });
    rozetGuncelle();
  });
  sap.on("closed", () => { sap = null; });
}

/* ayar değişince oku YIKMADAN yerinde taşı */
function sapYerlestir() {
  if (!sap || sap.isDestroyed()) { sapKur(); return; }
  sap.setBounds(sapSinirlari());
  sap.webContents.send("sap-ayar", { kenar: AYAR.kenar, acik: panelAcik });
}

/* pencere görünürlük animasyonu */
let animTimer = null;
function solukluk(hedef, sure, sonra) {
  clearInterval(animTimer);
  const bas = win.getOpacity();
  const t0 = Date.now();
  animTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / sure);
    win.setOpacity(bas + (hedef - bas) * k);
    if (k >= 1) { clearInterval(animTimer); if (sonra) sonra(); }
  }, 16);
}

function panelAc() {
  const e = hedefEkran().workArea;
  const gen = Math.min(AYAR.panelGen, e.width - 40);
  const boy = Math.min(AYAR.panelBoy, e.height - 40);
  const sb = (sap && !sap.isDestroyed()) ? sap.getBounds() : sapSinirlari();
  let x, y;
  if (AYAR.kenar === "sol") {
    x = e.x + 8;
    y = Math.round(sb.y + sb.height / 2 - boy / 2);
  } else if (AYAR.kenar === "sag") {
    x = e.x + e.width - gen - 8;
    y = Math.round(sb.y + sb.height / 2 - boy / 2);
  } else if (AYAR.kenar === "ust") {
    y = e.y + 8;
    x = Math.round(sb.x + sb.width / 2 - gen / 2);
  } else {
    y = e.y + e.height - boy - 8;
    x = Math.round(sb.x + sb.width / 2 - gen / 2);
  }
  x = Math.min(e.x + e.width - gen - 8, Math.max(e.x + 8, x));
  y = Math.min(e.y + e.height - boy - 8, Math.max(e.y + 8, y));
  win.setBounds({ x, y, width: gen, height: boy });
  win.setOpacity(0);
  win.show(); win.focus();
  win.webContents.send("panel-anim", AYAR.kenar); // içerik ok tarafından büyüyerek gelir
  solukluk(1, 140);
  panelAcik = true;
  disYeni = false; sonBakis = Date.now(); // panel açıldı = görüldü, parlama söner
  if (sap && !sap.isDestroyed()) sap.webContents.send("panel-durum", true);
  rozetGuncelle();
}
function panelKapa() {
  panelAcik = false;
  if (sap && !sap.isDestroyed()) sap.webContents.send("panel-durum", false);
  solukluk(0, 130, () => { win.hide(); win.setOpacity(1); });
}
function panelToggle() {
  if (panelAcik && win.isVisible()) panelKapa();
  else panelAc();
}
ipcMain.on("panel-toggle", panelToggle);
ipcMain.on("panel-esc", () => { if (panelAcik) panelKapa(); });

/* panel açıkken kullanıcı pencereyi çekiştirirse yeni boyut kalıcı olur */
let boyutKayitZamanlayici = null;
function boyutKaydetGecikmeli() {
  if (!panelAcik || !win || !win.isVisible()) return;
  clearTimeout(boyutKayitZamanlayici);
  boyutKayitZamanlayici = setTimeout(() => {
    if (!panelAcik) return;
    const b = win.getBounds();
    AYAR.panelGen = b.width;
    AYAR.panelBoy = b.height;
    ayarYaz();
  }, 600);
}

/* ---- ok sürükleme: serbest taşı, bırakınca en yakın kenara yapış ---- */
ipcMain.on("sap-tasi", (_e, nokta) => {
  if (!sap || sap.isDestroyed()) return;
  const b = sap.getBounds();
  sap.setBounds({
    x: Math.round(nokta.x - b.width / 2),
    y: Math.round(nokta.y - b.height / 2),
    width: b.width, height: b.height,
  });
});
ipcMain.on("sap-birak", () => {
  if (!sap || sap.isDestroyed()) return;
  const p = screen.getCursorScreenPoint();
  const ekran = screen.getDisplayNearestPoint(p);
  const e = ekran.workArea;
  // dört kenara uzaklık → en yakını kazanır (monitör birleşimi dahil)
  const mesafeler = [
    ["sol", p.x - e.x],
    ["sag", e.x + e.width - p.x],
    ["ust", p.y - e.y],
    ["alt", e.y + e.height - p.y],
  ].sort((a, b2) => a[1] - b2[1]);
  AYAR.kenar = mesafeler[0][0];
  AYAR.ekranId = ekran.id;
  AYAR.oran = dikeyMi()
    ? (p.y - e.y) / e.height
    : (p.x - e.x) / e.width;
  ayarYaz();
  sapYerlestir();
});

/* ---- ok sağ tık menüsü ---- */
ipcMain.on("sap-menu", () => {
  if (!sap || sap.isDestroyed()) return;
  const boyutAd = { kucuk: "Küçük", orta: "Orta", buyuk: "Büyük" };
  const kenarAd = { sol: "Sol", sag: "Sağ", ust: "Üst", alt: "Alt" };
  const ana = screen.getPrimaryDisplay();
  const aktifEkran = hedefEkran();
  const menu = Menu.buildFromTemplate([
    { label: "Ekran", submenu: screen.getAllDisplays().map((d, i) => ({
        label: `${i + 1}. ekran${d.id === ana.id ? " (ana)" : ""}`,
        type: "radio", checked: aktifEkran.id === d.id,
        click: () => { AYAR.ekranId = d.id; ayarYaz(); setTimeout(sapYerlestir, 60); },
      })) },
    { label: "Kenar", submenu: ["sol", "sag", "ust", "alt"].map((k) => ({
        label: kenarAd[k], type: "radio", checked: AYAR.kenar === k,
        click: () => { AYAR.kenar = k; ayarYaz(); setTimeout(sapYerlestir, 60); },
      })) },
    { label: "Boyut", submenu: ["kucuk", "orta", "buyuk"].map((b) => ({
        label: boyutAd[b], type: "radio", checked: AYAR.boyut === b,
        click: () => { AYAR.boyut = b; ayarYaz(); setTimeout(sapYerlestir, 60); },
      })) },
    { type: "separator" },
    { label: "Kenarda ortala", click: () => { AYAR.oran = 0.5; ayarYaz(); setTimeout(sapYerlestir, 60); } },
    { type: "separator" },
    { label: "Oku gizle (tepsiden geri açılır)", click: () => { if (sap && !sap.isDestroyed()) sap.hide(); } },
  ]);
  menu.popup({ window: sap });
});

/* ---------- tepsi ---------- */
function tepsiKur() {
  const ikon = nativeImage.createFromPath(path.join(KOK, "ikon.png"));
  tray = new Tray(ikon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Liste");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Aç", click: () => { win.show(); win.focus(); } },
    { label: "Kenar okunu göster/gizle", click: () => {
        if (!sap || sap.isDestroyed()) { sapKur(); return; }
        if (sap.isVisible()) sap.hide(); else sap.show();
      } },
    { type: "separator" },
    { label: "Çıkış", click: () => { kapaniyor = true; app.quit(); } },
  ]));
  tray.on("click", () => {
    if (win.isVisible()) win.hide();
    else { win.show(); win.focus(); }
  });
  tray.on("balloon-click", () => { if (win) { win.show(); win.focus(); } });
}

app.setAppUserModelId(process.execPath); // Windows bildirim kimliği

/* ---------- tek örnek ---------- */
const kilit = app.requestSingleInstanceLock();
if (!kilit) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) { win.show(); win.focus(); }
  });

  app.whenReady().then(() => {
    pencereKur();
    tepsiKur();
    sapKur();

    globalShortcut.register("Control+Alt+L", panelToggle);
    // monitör takılıp çıkarılınca ok kendini doğru kenara taşır
    screen.on("display-added", () => setTimeout(sapKur, 1000));
    screen.on("display-removed", () => setTimeout(sapKur, 1000));

    // Windows açılışında sessizce başla (tepside bekler)
    app.setLoginItemSettings({
      openAtLogin: true,
      path: process.execPath,
      args: [KOK, "--gizli"],
    });

    // dosya dışarıdan değişirse (örn. Claude iş yazarsa) arayüz kendini tazeler
    fs.watchFile(VERI, { interval: 1500 }, () => {
      const v = oku();
      const hepsi = [...v.maddeler, ...v.leadler];
      const yeniler = hepsi.filter((m) => !bilinenIds.has(m.id));
      // kullanıcı o an panele bakıyorsa parlatmaya gerek yok
      if (yeniler.length && !(win && win.isVisible() && win.isFocused())) disYeni = true;
      bilinenIds = new Set(hepsi.map((m) => m.id));
      if (win) win.webContents.send("veri-degisti");
      rozetGuncelle();
    });

    const ilkV = oku();
    bilinenIds = new Set([...ilkV.maddeler, ...ilkV.leadler].map((m) => m.id));
    win.on("show", () => { disYeni = false; sonBakis = Date.now(); rozetGuncelle(); });
    win.on("focus", () => { disYeni = false; sonBakis = Date.now(); rozetGuncelle(); });
    bakim();
    setInterval(bakim, 20000);
  });
}

app.on("window-all-closed", (e) => e.preventDefault());

/* ---------- IPC ---------- */
ipcMain.handle("veri-oku", () => oku());
ipcMain.handle("veri-yaz", (_e, gelen) => {
  // eski biçim (dizi) gelirse leadler korunur — veri kaybı olmaz
  const yeni = Array.isArray(gelen)
    ? { maddeler: gelen, leadler: oku().leadler }
    : { maddeler: gelen.maddeler || [], leadler: gelen.leadler || [] };
  yaz(yeni);
  bilinenIds = new Set([...yeni.maddeler, ...yeni.leadler].map((m) => m.id)); // arayüzden ekleme = elle, parlatmaz
  rozetGuncelle();
  return true;
});
ipcMain.handle("gorsel-kaydet", (_e, dataURL) => {
  const ham = dataURL.split(",")[1];
  const ad = `ss-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.png`;
  fs.writeFileSync(path.join(GORSEL, ad), Buffer.from(ham, "base64"));
  return ad;
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  oku: () => ipcRenderer.invoke("veri-oku"),
  yaz: (maddeler) => ipcRenderer.invoke("veri-yaz", maddeler),
  gorselKaydet: (dataURL) => ipcRenderer.invoke("gorsel-kaydet", dataURL),
  onDegisim: (cb) => ipcRenderer.on("veri-degisti", cb),
  panelToggle: () => ipcRenderer.send("panel-toggle"),
  panelEsc: () => ipcRenderer.send("panel-esc"),
  onPanelDurum: (cb) => ipcRenderer.on("panel-durum", (_e, acik) => cb(acik)),
  onPanelAnim: (cb) => ipcRenderer.on("panel-anim", (_e, kenar) => cb(kenar)),
  onSapAyar: (cb) => ipcRenderer.on("sap-ayar", (_e, a) => cb(a)),
  onSapRozet: (cb) => ipcRenderer.on("sap-rozet", (_e, r) => cb(r)),
  sapTasi: (nokta) => ipcRenderer.send("sap-tasi", nokta),
  sapBirak: () => ipcRenderer.send("sap-birak"),
  sapMenu: () => ipcRenderer.send("sap-menu"),
});

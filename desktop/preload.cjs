const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopAPI", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  revealSetting: (key) => ipcRenderer.invoke("settings:reveal", key),
  saveSettings: (changes) => ipcRenderer.invoke("settings:save", changes),
  restartForSettings: () => ipcRenderer.invoke("settings:restart"),
  getCookies: (filter) => ipcRenderer.invoke("cookies:get", filter),
  openDouyinLogin: () => ipcRenderer.invoke("douyin:login"),
  showInstallLocation: () => ipcRenderer.invoke("app:show-install-location"),
  getStorageSettings: () => ipcRenderer.invoke("storage:get"),
  selectStorageLocation: () => ipcRenderer.invoke("storage:select"),
  openStorageLocation: () => ipcRenderer.invoke("storage:open"),
  clearStorageCache: () => ipcRenderer.invoke("storage:clear"),
  openCheckout: (url) => ipcRenderer.invoke("app:open-checkout", url),
  getBackendStatus: () => ipcRenderer.invoke("backend:get-status"),
  getApiBase: () => ipcRenderer.invoke("backend:get-api-base"),
  getLocalApiAccessToken: () => ipcRenderer.invoke("backend:get-access-token"),
  restartBackend: () => ipcRenderer.invoke("backend:restart"),
  getAccountSession: () => ipcRenderer.invoke("account:session"),
  registerAccount: (input) => ipcRenderer.invoke("account:register", input),
  loginAccount: (input) => ipcRenderer.invoke("account:login", input),
  forgotAccountPassword: (email) =>
    ipcRenderer.invoke("account:forgot-password", email),
  resendAccountVerification: () =>
    ipcRenderer.invoke("account:resend-verification"),
  logoutAccount: () => ipcRenderer.invoke("account:logout"),
  getAccountLedger: (limit) => ipcRenderer.invoke("account:ledger", limit),
  redeemCdk: (code) => ipcRenderer.invoke("account:redeem-cdk", code),
  changeAccountPassword: (input) =>
    ipcRenderer.invoke("account:change-password", input),
  getMaterialLibraryStatus: (live) =>
    ipcRenderer.invoke("materials:get-status", live),
  initializeUserLibrary: (input) =>
    ipcRenderer.invoke("materials:initialize-user", input),
  testUserLibrary: (input) => ipcRenderer.invoke("materials:test-user", input),
  disconnectUserLibrary: () => ipcRenderer.invoke("materials:disconnect-user"),
  openUserLibrary: () => ipcRenderer.invoke("materials:open-user-base"),
  openMaterialGuideLink: (key) =>
    ipcRenderer.invoke("materials:open-guide-link", key),
  saveLibraryProduct: (product) =>
    ipcRenderer.invoke("materials:save-product", product),
  onBackendStatus: (listener) => {
    ipcRenderer.on("backend:status", (_event, payload) => listener(payload));
  },
});

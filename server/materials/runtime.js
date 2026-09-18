let userLibrary = null;

export function setUserLibraryConfig(value) {
  userLibrary = normalize(value);
  return getUserLibraryConfig();
}

export function clearUserLibraryConfig() {
  userLibrary = null;
}

export function getUserLibraryConfig() {
  return userLibrary ? { ...userLibrary } : null;
}

function normalize(value) {
  if (!value) return null;
  const appId = String(value.appId || "").trim();
  const appSecret = String(value.appSecret || "").trim();
  const baseUrl = String(value.baseUrl || "").trim();
  if (!appId || !appSecret || !baseUrl) return null;
  return { appId, appSecret, baseUrl };
}

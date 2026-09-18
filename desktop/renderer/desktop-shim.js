const DESKTOP_STORAGE_KEY = "desktopChromeStorage";

function readStorage() {
  try {
    return JSON.parse(localStorage.getItem(DESKTOP_STORAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

window.chrome = {
  storage: {
    local: {
      get(keys, callback) {
        const storage = readStorage();
        const names = Array.isArray(keys) ? keys : Object.keys(keys || {});
        const result = {};
        for (const name of names) {
          if (Object.hasOwn(storage, name)) result[name] = storage[name];
        }
        callback(result);
      },
      set(values, callback) {
        localStorage.setItem(DESKTOP_STORAGE_KEY, JSON.stringify({ ...readStorage(), ...values }));
        if (callback) callback();
      }
    }
  },
  cookies: {
    getAll(filter, callback) {
      window.desktopAPI.getCookies(filter).then(callback).catch(() => callback([]));
    }
  }
};

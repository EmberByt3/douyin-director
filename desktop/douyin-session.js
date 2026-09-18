export function buildEdgeIdentity(chromiumVersion = "") {
  const major = normalizeMajorVersion(chromiumVersion);
  const browserVersion = `${major}.0.0.0`;
  return {
    major,
    userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browserVersion} Safari/537.36 Edg/${browserVersion}`,
    clientHints: {
      "sec-ch-ua": `"Not_A Brand";v="99", "Microsoft Edge";v="${major}", "Chromium";v="${major}"`,
      "sec-ch-ua-full-version-list": `"Not_A Brand";v="99.0.0.0", "Microsoft Edge";v="${browserVersion}", "Chromium";v="${browserVersion}"`,
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": `"Windows"`
    }
  };
}

export function applyEdgeHeaders(headers, identity) {
  const result = { ...(headers || {}) };
  setHeader(result, "User-Agent", identity.userAgent);
  for (const [name, value] of Object.entries(identity.clientHints)) {
    setHeader(result, name, value);
  }
  return result;
}

export function isSafeLoginNavigation(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "about:";
  } catch {
    return false;
  }
}

function setHeader(headers, name, value) {
  for (const existingName of Object.keys(headers)) {
    if (existingName.toLowerCase() === name.toLowerCase()) delete headers[existingName];
  }
  headers[name] = value;
}

function normalizeMajorVersion(value) {
  const major = Number.parseInt(String(value || "").split(".")[0], 10);
  return Number.isInteger(major) && major >= 100 ? String(major) : "138";
}

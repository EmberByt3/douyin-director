import fs from "node:fs";
import path from "node:path";

const SETTINGS_FILE = "storage-settings.json";
const MARKER_FILE = ".douyin-director-storage.json";
const CUSTOM_FOLDER_NAME = "DouyinDirectorTasks";
const STORAGE_APP_ID = "com.douyindirector.studio";

export function defaultJobsDir(userDataPath) {
  return path.join(userDataPath, "jobs");
}

export function storageSettingsPath(userDataPath) {
  return path.join(userDataPath, SETTINGS_FILE);
}

export function readJobsDirSetting(userDataPath) {
  const fallback = defaultJobsDir(userDataPath);
  try {
    const payload = JSON.parse(fs.readFileSync(storageSettingsPath(userDataPath), "utf8"));
    const rawPath = String(payload?.jobsDir || "").trim();
    if (!rawPath) return fallback;
    const candidate = path.resolve(rawPath);
    return isSafeManagedPath(candidate) ? candidate : fallback;
  } catch {
    return fallback;
  }
}

export function customJobsDir(parentPath) {
  const parent = path.resolve(parentPath);
  return path.basename(parent).toLowerCase() === CUSTOM_FOLDER_NAME.toLowerCase()
    ? parent
    : path.join(parent, CUSTOM_FOLDER_NAME);
}

export function prepareManagedJobsDir(jobsDir, { allowExistingWithoutMarker = false } = {}) {
  const target = path.resolve(jobsDir);
  if (!isSafeManagedPath(target)) {
    throw new Error("所选存储位置不安全，请选择普通文件夹，不要选择磁盘根目录。");
  }

  const marker = path.join(target, MARKER_FILE);
  if (fs.existsSync(target) && !fs.existsSync(marker)) {
    const entries = fs.readdirSync(target);
    if (entries.length > 0 && !allowExistingWithoutMarker) {
      throw new Error(`目标位置已存在非本程序管理的 ${CUSTOM_FOLDER_NAME} 文件夹，请选择其他位置。`);
    }
  }

  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(marker, JSON.stringify({ appId: STORAGE_APP_ID, kind: "jobs", version: 1 }), "utf8");
  return target;
}

export function saveJobsDirSetting(userDataPath, jobsDir) {
  const target = path.resolve(jobsDir);
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.writeFileSync(
    storageSettingsPath(userDataPath),
    JSON.stringify({ version: 1, jobsDir: target }, null, 2),
    "utf8"
  );
  return target;
}

export async function getStorageInfo(jobsDir, userDataPath) {
  const target = path.resolve(jobsDir);
  prepareManagedJobsDir(target, {
    allowExistingWithoutMarker: target === path.resolve(defaultJobsDir(userDataPath))
  });
  const entries = await fs.promises.readdir(target, { withFileTypes: true });
  const visible = entries.filter((entry) => entry.name !== MARKER_FILE);
  let bytes = 0;
  for (const entry of visible) {
    bytes += await entrySize(path.join(target, entry.name));
  }
  return {
    path: target,
    isCustom: target !== path.resolve(defaultJobsDir(userDataPath)),
    taskCount: visible.filter((entry) => entry.isDirectory()).length,
    bytes
  };
}

export async function clearManagedJobsDir(jobsDir) {
  const target = path.resolve(jobsDir);
  assertManagedDirectory(target);
  const entries = await fs.promises.readdir(target, { withFileTypes: true });
  const removable = entries.filter((entry) => entry.name !== MARKER_FILE);
  for (const entry of removable) {
    const child = path.resolve(target, entry.name);
    if (path.dirname(child) !== target) {
      throw new Error("缓存目录校验失败，已取消清理。");
    }
    await fs.promises.rm(child, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
  }
  return removable.length;
}

function assertManagedDirectory(target) {
  if (!isSafeManagedPath(target)) {
    throw new Error("缓存目录不安全，已取消清理。");
  }
  const marker = path.join(target, MARKER_FILE);
  try {
    const payload = JSON.parse(fs.readFileSync(marker, "utf8"));
    if (payload?.appId !== STORAGE_APP_ID || payload?.kind !== "jobs") throw new Error("invalid marker");
  } catch {
    throw new Error("该目录缺少程序存储标记，已取消清理以保护您的文件。");
  }
}

function isSafeManagedPath(value) {
  if (!value || !path.isAbsolute(value)) return false;
  const resolved = path.resolve(value);
  return resolved !== path.parse(resolved).root && path.dirname(resolved) !== resolved;
}

async function entrySize(target) {
  const stat = await fs.promises.lstat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory() || stat.isSymbolicLink()) return stat.size;
  const entries = await fs.promises.readdir(target).catch(() => []);
  let total = 0;
  for (const entry of entries) total += await entrySize(path.join(target, entry));
  return total;
}

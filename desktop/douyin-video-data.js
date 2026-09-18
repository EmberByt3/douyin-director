const DOUYIN_HOSTS = new Set(["douyin.com", "www.douyin.com", "v.douyin.com", "www.iesdouyin.com", "iesdouyin.com"]);

export function validateDouyinPage(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !DOUYIN_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error("不支持的抖音作品链接。");
  }
  return url;
}

export function mediaFromDetail(data, expectedId) {
  const detail = data?.aweme_detail;
  if (!/^\d+$/.test(expectedId) || !detail || String(detail.aweme_id) !== expectedId) return null;
  const urls = detail.video?.play_addr?.url_list || [];
  const videoUrl = urls.find((value) => typeof value === "string" && value.startsWith("https://"));
  return videoUrl ? { videoUrl, title: detail.desc || expectedId, awemeId: expectedId } : null;
}

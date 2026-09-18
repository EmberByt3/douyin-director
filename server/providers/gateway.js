import { config } from "../config.js";
let adapter = null;

export function configureProviderGateway(value) {
  adapter = value || null;
}

export function hasProviderGateway() {
  return !config.localDirect && Boolean(adapter?.configured);
}

export async function callProvider(operation, payload, reservationId) {
  if (!hasProviderGateway())
    throw new Error("云端能力网关尚未配置。");
  if (!reservationId)
    throw new Error("当前任务缺少有效的云端扣点预约。");
  return adapter.callProvider(operation, payload, reservationId);
}

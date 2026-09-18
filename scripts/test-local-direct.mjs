import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
process.env.LOCAL_DIRECT_MODE = "true";
process.env.LOCAL_API_TOKEN = "local-direct-regression-token";
const { config } = await import("../server/config.js");
const billing = await import("../server/billing/runtime.js");
const gateway = await import("../server/providers/gateway.js");
const rejectCloud = new Proxy({configured:true}, {get(target,key) {
  if (key === "configured") return true;
  throw new Error(`Unexpected cloud access: ${String(key)}`);
}});
billing.configureCloudBilling(rejectCloud);
gateway.configureProviderGateway(rejectCloud);
assert.equal(config.localDirect,true);
assert.equal(config.billing.enabled,false);
assert.equal(config.providerGatewayRequired,false);
assert.equal(config.materialLibrary.platformApiUrl,"");
assert.equal(gateway.hasProviderGateway(),false);
for (const authorization of [undefined,"Bearer wrong"]) {
  await assert.rejects(billing.authenticateRequest({headers:{authorization}}),error => error.statusCode===401);
}
const user = await billing.authenticateRequest({headers:{authorization:`Bearer ${process.env.LOCAL_API_TOKEN}`}});
assert.equal(user.localDirect,true);
assert.equal((await billing.getAccount(user.id)).localDirect,true);
assert.deepEqual(await billing.listLedger(user.id,10),[]);
assert.equal((await billing.listProducts()).checkoutAvailable,false);
assert.equal(await billing.reservePoints(user.id,100,{referenceType:"video_analysis"}),null);
await billing.settleReservation("old-cloud-reservation");
await billing.refundReservation("old-cloud-reservation");
await assert.rejects(billing.createOrder(user.id,{}),error => error.statusCode===410);
await assert.rejects(billing.signInDevelopment({}),error => error.statusCode===410);
const testDir = await fs.mkdtemp(path.join(os.tmpdir(),"director-local-mode-"));
config.jobsDir = testDir;
config.port = 0;
await fs.mkdir(path.join(testDir,"previous-cloud-job"));
await fs.writeFile(path.join(testDir,"previous-cloud-job/result.json"),JSON.stringify({userId:"previous-cloud-owner",analysis:{html:"<p>Saved report</p>"},frames:[]}));
const { server } = await import("../server/index.js");
try {
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/v1/account`)).status,401);
  const headers = {authorization:`Bearer ${process.env.LOCAL_API_TOKEN}`};
  const accountResponse = await fetch(`${base}/v1/account`,{headers});
  assert.equal(accountResponse.status,200);
  assert.equal((await accountResponse.json()).account.localDirect,true);
  const history = await fetch(`${base}/v1/video-jobs/previous-cloud-job`,{headers});
  assert.equal(history.status,200,"Existing reports on this computer remain accessible in local mode");
  assert.equal((await history.json()).status,"done");
  assert.equal((await fetch(`${base}/v1/video-jobs/previous-cloud-job`)).status,401);
  const products = await (await fetch(`${base}/v1/billing/products`)).json();
  assert.equal(products.mode,"local");
  assert.equal(products.costs.analyze,0);
} finally {
  await new Promise(resolve=>server.close(resolve));
  assert.equal(path.dirname(testDir),os.tmpdir());
  await fs.rm(testDir,{recursive:true,force:true});
}
console.log("Local direct mode: no cloud calls, no billing, loopback token validation passed");

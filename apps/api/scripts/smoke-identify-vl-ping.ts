/**
 * 轻量连通性探测：对识图回退视觉链各档发一张 1×1 图 + 短 JSON 指令。
 *   pnpm --filter @biotrace/api identify:vl-ping
 *
 * 不走完整识图 Prompt，只确认 TokenHub Key、模型已开通、Base64 传图能回。
 */
import { applyRuntimeSecrets } from "../src/admin/runtime-secrets.js";
import { env } from "../src/env.js";
import { callVlModel } from "../src/identify/vl-chain.js";

const PNG_1X1 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const prompt = '只输出一个 JSON 对象，不要其它文字：{"ok":true}';

applyRuntimeSecrets();

if (!env.tokenhubApiKey) {
  console.error("TOKENHUB_API_KEY is not set");
  process.exit(1);
}

const models = env.identifyVlModels;
console.log(`TokenHub ${env.tokenhubBaseUrl}  chain=${models.join(" → ")}`);

let failed = 0;
for (const model of models) {
  const started = Date.now();
  try {
    const text = await callVlModel(model, prompt, PNG_1X1);
    const ms = Date.now() - started;
    const preview = text.replace(/\s+/g, " ").slice(0, 160);
    console.log(`ok   ${model}  ${ms}ms  ${preview}`);
  } catch (err) {
    failed += 1;
    const ms = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL ${model}  ${ms}ms  ${message.slice(0, 240)}`);
  }
}

process.exit(failed ? 1 : 0);

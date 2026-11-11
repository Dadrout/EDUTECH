/** Минимальный замер задержки провайдера: node --env-file=.env.local --import tsx scripts/ai-ping.ts [gemini|groq] */
import { readAiConfig } from "@/lib/ai/config";
import { createGeminiProvider, createGroqProvider } from "@/lib/ai/providers";

async function main() {
  const which = process.argv[2] === "groq" ? "groq" : "gemini";
  const config = readAiConfig({ ...process.env, AI_PRIMARY_PROVIDER: which, AI_FALLBACK_ENABLED: "false" });
  const entry = config.order[0];
  if (!entry) throw new Error("no key");
  const provider = which === "gemini" ? createGeminiProvider(entry.key, entry.model) : createGroqProvider(entry.key, entry.model);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const text = await provider.generate(
      { system: "Return JSON only.", user: 'Reply with {"ok": true}.', jsonSchema: { type: "object", additionalProperties: false, required: ["ok"], properties: { ok: { type: "boolean" } } }, maxOutputTokens: 512 },
      controller.signal,
    );
    console.log(which, entry.model, "ms:", Date.now() - started, "text:", text.slice(0, 80));
  } catch (error) {
    console.log(which, "error after", Date.now() - started, "ms:", (error as { status?: number }).status ?? "", String(error).slice(0, 300));
  } finally {
    clearTimeout(timer);
  }
}
void main();

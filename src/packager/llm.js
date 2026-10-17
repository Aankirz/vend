// Minimal OpenAI-compatible chat call to Vercel AI Gateway. No SDK.
const GATEWAY_URL = 'https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL = 'stealth/cat-jam';

export function parseJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : text).trim();
  try {
    return JSON.parse(body);
  } catch {
    // Model wrapped the JSON in prose: take the outermost object.
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start === -1 || end <= start) throw new Error(`LLM reply is not JSON: ${body.slice(0, 200)}`);
    return JSON.parse(body.slice(start, end + 1));
  }
}

const MAX_TRIES = 3;
const RETRY_DELAY_MS = 5000;

async function postOnce(messages, apiKey, model) {
  const res = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: res.status, ok: res.ok, text: await res.text() };
}

export async function chatJson(messages, { apiKey = process.env.AI_GATEWAY_API_KEY, model = process.env.VEND_MODEL || DEFAULT_MODEL } = {}) {
  if (!apiKey) throw new Error('AI_GATEWAY_API_KEY is not set (add it to .env)');
  let res;
  for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
    // The free stealth model sometimes answers 400 provider_error; retry everything except auth failures.
    res = await postOnce(messages, apiKey, model);
    if (res.ok || res.status === 401 || res.status === 403) break;
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
  }
  if (!res.ok) throw new Error(`AI Gateway HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  const content = JSON.parse(res.text).choices?.[0]?.message?.content;
  if (!content) throw new Error(`AI Gateway returned no content: ${res.text.slice(0, 300)}`);
  return parseJson(content);
}

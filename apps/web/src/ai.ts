/**
 * Menu-photo extraction with the user's OWN model: a local one (Ollama running Gemma) or any
 * OpenAI-compatible API with the user's key. The image goes straight from this browser to that
 * model, never to munchmap. Keys are stored only in this browser.
 */
import { z } from "zod";
import type { AiSettings } from "./prefs.ts";

const Extracted = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        price: z.union([z.number(), z.string()]),
        category: z.string().max(60).nullable().optional(),
      }),
    )
    .max(150),
});
export type ExtractedItem = { name: string; price_minor: number; category: string | null };

const PROMPT = `You are reading a restaurant menu (or receipt) photo.
Return ONLY JSON: {"items":[{"name":"...","price":"12.99","category":"..."}]}.
Rules: one entry per priced food/drink item; price as printed (number, no currency symbol);
skip items without a price; don't invent anything; ignore phone numbers, addresses, names, card numbers.`;

/** Downscale to keep uploads small and fast (and strip EXIF location by re-encoding). */
export async function imageToDataUrl(file: File, maxSide = 1600): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function parseJsonLoose(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced?.[1] ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(raw);
}

export async function extractMenu(file: File, ai: AiSettings): Promise<ExtractedItem[]> {
  if (!ai.baseUrl || !ai.model) throw new Error("Set up a model first under Me → AI for menu photos.");
  const image = await imageToDataUrl(file);
  const res = await fetch(`${ai.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(ai.apiKey ? { Authorization: `Bearer ${ai.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: ai.model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  }).catch((e: Error) => {
    throw new Error(
      ai.preset === "ollama"
        ? `Couldn't reach Ollama at ${ai.baseUrl}. Is it running, and does it allow this site? (${e.message})`
        : `Couldn't reach ${ai.baseUrl} (${e.message}).`,
    );
  });
  if (!res.ok) throw new Error(`The model returned HTTP ${res.status}. Check the model name and key.`);
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  const parsed = Extracted.safeParse(parseJsonLoose(content));
  if (!parsed.success) throw new Error("Couldn't read prices from that photo. Try a clearer, straight-on shot.");
  return parsed.data.items.flatMap((i) => {
    const n = typeof i.price === "number" ? i.price : Number.parseFloat(String(i.price).replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) && n > 0
      ? [{ name: i.name.trim(), price_minor: Math.round(n * 100), category: i.category ?? null }]
      : [];
  });
}

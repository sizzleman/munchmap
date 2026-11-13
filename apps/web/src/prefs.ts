/** Everything personal lives here, in this browser only. Nothing is uploaded. */
import { type Profile, Profile as ProfileSchema, type TasteEntry } from "@munchmap/core";
import { store } from "./dom.ts";

export function getProfile(): Profile {
  try {
    return ProfileSchema.parse(store.get("profile", {}));
  } catch {
    return ProfileSchema.parse({});
  }
}
export const setProfile = (p: Partial<Profile>) => store.set("profile", { ...getProfile(), ...p });

export const getTastes = (): TasteEntry[] => store.get<TasteEntry[]>("tastes", []);
export const setTastes = (t: TasteEntry[]) => store.set("tastes", t);

/** AI used for menu-photo extraction: a local model (Ollama + Gemma) or your own OpenAI-compatible key. */
export interface AiSettings {
  preset: "ollama" | "openai" | "gemini" | "custom";
  baseUrl: string;
  apiKey: string;
  model: string;
}
export const AI_PRESETS: Record<AiSettings["preset"], Omit<AiSettings, "apiKey" | "preset">> = {
  ollama: { baseUrl: "http://localhost:11434/v1", model: "gemma3:4b" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.5-flash" },
  custom: { baseUrl: "", model: "" },
};
export const getAi = (): AiSettings =>
  store.get<AiSettings>("ai", { preset: "ollama", apiKey: "", ...AI_PRESETS.ollama });
export const setAi = (a: AiSettings) => store.set("ai", a);

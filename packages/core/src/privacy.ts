/**
 * Privacy guardrails for anything a user (or their AI) wants to share publicly,
 * e.g. a deal extracted from a promo email or notification.
 * Everything here runs locally; nothing is sent anywhere.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Phone-like sequences: 10+ digits with optional separators / country code.
const PHONE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b/g;
const ORDER_NO = /\b(?:order|confirmation|receipt|ref(?:erence)?)\s*(?:#|no\.?|number)?\s*[:#]?\s*[A-Z0-9-]{5,}\b/gi;
const TRACKING_PARAMS = /^(utm_|mc_|sfmc_|fbclid|gclid|msclkid|_hs|mkt_tok|trk|ref|token|email|uid|user|e$|u$|s$)/i;

export interface ScrubResult {
  text: string;
  removed: string[];
}

/** Remove emails, phone numbers and order/receipt numbers from free text. */
export function scrubText(input: string): ScrubResult {
  const removed: string[] = [];
  const text = input
    .replace(EMAIL, () => {
      removed.push("email");
      return "[email removed]";
    })
    .replace(ORDER_NO, () => {
      removed.push("order number");
      return "[order number removed]";
    })
    .replace(PHONE, () => {
      removed.push("phone");
      return "[phone removed]";
    });
  return { text, removed };
}

/**
 * Strip tracking / personal query params from a URL (email links often embed your identity).
 * Returns null if the URL is invalid or is an email-click-tracking redirect we can't safely clean.
 */
export function cleanUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  // Click-tracking redirectors usually encode the recipient; refuse rather than leak.
  if (/(^|\.)(click|links?|email|e|trk|track|mailchi\.mp|list-manage)\./i.test(`${url.hostname}.`)) return null;
  for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
  url.hash = "";
  return url.toString();
}

/**
 * Heuristic: does a promo code look personal / single-use (should NOT be shared publicly)?
 * Public codes tend to be short words ("STUDENT10"); personal ones are long random strings.
 */
export function looksPersonalCode(code: string): boolean {
  const c = code.trim();
  if (c.length >= 12) return true;
  const digits = (c.match(/\d/g) ?? []).length;
  const letters = (c.match(/[a-z]/gi) ?? []).length;
  // Mixed random-looking strings like "X7KQ9P2M"
  return c.length >= 8 && digits >= 3 && letters >= 3 && !/^[A-Z]+\d{1,3}$/i.test(c);
}

const INJECTION =
  /(ignore (all |any )?(previous|prior|above|earlier) (instructions|prompts|messages)|disregard (the )?(system|previous)|system prompt|you are (now )?(an? )?(ai|assistant|chatbot)|<\/?(system|instructions?|assistant)>|\[\/?INST\])/i;

/**
 * Community text is read by users' AI agents, so block obvious prompt-injection attempts.
 * Heuristic only: CI, the submission bot and maintainers are the real safeguards.
 */
export function looksLikePromptInjection(text: string): boolean {
  return INJECTION.test(text);
}

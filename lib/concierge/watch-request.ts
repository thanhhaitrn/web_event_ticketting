import type { Night } from "./types";

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d");
const words = (s: string) => fold(s).replace(/\bsky\s+box\b/g, "skybox").replace(/[^a-z0-9]+/g, " ").trim();

export function asksForPriceWatch(text: string) {
  const message = words(text);
  const asks = /^(?:(?:hay|ay|vui long|ban|venu|lam on|giup minh|toi muon|minh muon) )*(?:nhac|bao|thong bao|theo doi)\b/.test(message)
    || /\b(?:nhac|bao|thong bao) (?:giup |cho )?(?:minh|toi|to)\b/.test(message);
  return asks && /\b(?:gia|ve)\b/.test(message) && /\b(?:nhac|theo doi|thong bao|khi|neu)\b/.test(message)
    && !/\b(?:dung|khong|huy)\b/.test(message);
}

export function promisesPriceWatch(text: string) {
  return /\b(?:toi|minh|venu|tro ly) (?:se |da )(?:(?:luu|tao|bat) (?:nhac|theo doi|thong bao|canh bao)|nhac|theo doi|bao (?:ban|khi|cho)|thong bao)\b/.test(words(text));
}

// Save an explicit, fully specified request. Ambiguous details go to the existing picker.
export function watchFromMessage(text: string, nights: Night[], selected?: string) {
  if (!asksForPriceWatch(text)) return;
  const message = ` ${words(text)} `;
  if (/\b(?:tang|cao hon|tren|hoac)\b/.test(message)) return;
  const amounts = [...fold(text).matchAll(/\b(\d{1,3}(?:[.,\s]\d{3})+|\d+(?:[.,]\d+)?)\s*(trieu|tr|nghin|ngan|k|vnd|dong|d|₫)?(?![a-z0-9])/g)];
  // Exclude night numbers and dates when the price carries a unit or thousands grouping.
  const money = amounts.filter(m => m[2] || /[.,\s]/.test(m[1]) || m[1].length >= 4);
  if (money.length !== 1) return;
  const [, raw, unit] = money[0];
  const scale = unit === "trieu" || unit === "tr" ? 1000000 : ["nghin", "ngan", "k"].includes(unit) ? 1000 : 1;
  if (scale === 1 && !/^\d+(?:[.,\s]\d{3})*$/.test(raw)) return;
  const target = Number(scale === 1 ? raw.replace(/[.,\s]/g, "") : raw.replace(",", ".")) * scale;
  if (!Number.isSafeInteger(target) || target <= 0 || target > 2147483647) return;

  const upcoming = nights.filter(n => Date.parse(n.start) > Date.now());
  const named = upcoming.filter(n => {
    const title = words(n.title.split(/\s+[–—-]\s+|:/)[0]);
    return title && message.includes(` ${title} `);
  });
  if (!named.length && /\b(?:cua|su kien)\b/.test(message)) return;
  const candidates = named.length ? named : upcoming.filter(n => n.id === selected);
  const night = candidates.length === 1 ? candidates[0] : undefined;
  if (!night) return;
  const requestedNight = message.match(/\b(?:dem|suat) \d+\b/)?.[0];
  if (requestedNight && !words(night.name).includes(requestedNight)) return;
  const matches = night.zones.filter(zone => {
    const name = words(zone.name);
    const prefix = name.split(" ")[0];
    return message.includes(` ${name} `) || ["ve", "hang", "khu"].some(label => message.includes(` ${label} ${prefix} `));
  });
  const exact = matches.filter(z => message.includes(` ${words(z.name)} `));
  const zones = exact.length ? exact : matches;
  if (zones.length === 1) return { night, zone: zones[0], target };
}

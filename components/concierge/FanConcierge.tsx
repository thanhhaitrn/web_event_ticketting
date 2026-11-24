"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import FilterMenu from "@/components/FilterMenu";
import BrandMark from "@/components/BrandMark";
import { groupAmount, INTEGER_PATTERN, integerFormat, readAmount, skipGroupSeparator } from "@/app/demo/dynamic-pricing/number-input";
import type { ChatLine, Night, Reply, Topic, Watch } from "@/lib/concierge/types";
import s from "./concierge.module.css";

type View = Topic | "inbox";
type Line = ChatLine & { links?: Reply["links"]; hotels?: Reply["hotels"] };
type TripRequest = { text: string; showId: string; origin: string };
// once a visitor has opened Venu or waved the hint away, this browser stops showing it
const HINT_SEEN = "venu-assistant-hint";
const topics = { watch: "Theo dõi giá vé", trip: "Lên lịch đi xem", feedback: "Gửi cảm nhận" } as const;
const vnd = (n: number) => n.toLocaleString("vi-VN") + " ₫";
const label = (n: Night) => n.title + " · " + n.name;
const local = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", ...options });
const date = (iso: string) => local(iso, { dateStyle: "short", timeStyle: "short" });
const about = {
  watch: { icon: "tag", hint: "Nhận tin khi vé về mức bạn muốn", prompt: "Mình muốn theo dõi giá vé" },
  trip: { icon: "route", hint: "Tìm đường đi và chỗ ở gần nơi diễn", prompt: "Mình muốn lên lịch đi xem một đêm diễn" },
  feedback: { icon: "star", hint: "Chấm sao đêm diễn bạn đã xem", prompt: "Mình muốn gửi cảm nhận về đêm diễn đã xem" },
} as const;
const paths = {
  bell: "M4 17h16l-2-3V9a6 6 0 0 0-12 0v5l-2 3Zm6 3a2 2 0 0 0 4 0",
  arrow: "M12 20V4m-7 7 7-7 7 7", minimize: "M5 12h14", close: "m6 6 12 12M18 6 6 18", back: "m14 5-7 7 7 7", next: "m9 5 7 7-7 7",
  out: "M8 16 17 7M9 7h8v8",
  tag: "M3 12V4h8l10 10-8 8L3 12Zm4.5-3.5h.01",
  route: "M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-12a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 18h7a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z",
};

function Icon({ name }: { name: keyof typeof paths }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
type Links = Reply["links"];
const hostOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
/** host and the first two path parts, enough to tell Google directions from a Google map search */
const placeOf = (url: string) => { try { const u = new URL(url); return hostOf(url) + u.pathname.split("/").slice(0, 3).join("/"); } catch { return ""; } };

/** a link the model wrote, pointed at the matching search link the server sent; anything else stays plain text */
function linkFor(links: Links, url: string | undefined, label: string) {
  if (!links?.length) return undefined;
  if (url) return links.find(l => placeOf(l.url) === placeOf(url)) ?? links.find(l => hostOf(l.url) === hostOf(url));
  // placeholders like "[Link Booking]" or "[Link Google Maps]"
  const find = (part: string) => links.find(l => placeOf(l.url).includes(part));
  if (/(bản đồ|map).*(khách sạn|hotel)|(khách sạn|hotel).*(bản đồ|map)|quanh/i.test(label)) return find("maps/search");
  if (/book|phòng|khách sạn|airbnb|ở/i.test(label)) return find("booking");
  if (/map|bản đồ|đường/i.test(label)) return find("maps/dir");
  return undefined;
}

function inlineText(line: string, links?: Links) {
  const out: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]/g;
  let at = 0;
  for (const m of line.matchAll(pattern)) {
    out.push(line.slice(at, m.index));
    at = m.index + m[0].length;
    if (m[1] !== undefined) { out.push(<strong key={m.index}>{m[1]}</strong>); continue; }
    const label = m[2] ?? m[4];
    const link = linkFor(links, m[3], label);
    const text = /^link\b/i.test(label) && link ? link.label : label;
    out.push(link ? <a key={m.index} href={link.url} target="_blank" rel="noopener noreferrer">{text}</a> : text);
  }
  out.push(line.slice(at));
  return out;
}

// a reply this long already says enough, and one that links in its text needs less: the buttons would only repeat it
const LONG_REPLY = 320;
const LINKED_REPLY = 160;
const LINK_IN_TEXT = /\[([^\]]+)\]\(([^)\s]+)\)|\[([^\]]+)\]/g;

/** the shortcut buttons worth showing under a reply: none under long or already-linked replies or hotel cards, never one the text links */
function shortcutsFor(line: Line) {
  if (!line.links?.length || line.hotels?.length) return [];
  const plain = line.content.replace(LINK_IN_TEXT, (_, a, _u, b) => a ?? b).replace(/[*#|>-]/g, "").replace(/\s+/g, " ").trim();
  const linked = new Set([...line.content.matchAll(LINK_IN_TEXT)].map(m => linkFor(line.links, m[2], m[1] ?? m[3])?.url));
  linked.delete(undefined);
  if (plain.length >= LONG_REPLY || (linked.size > 0 && plain.length >= LINKED_REPLY)) return [];
  return line.links.filter(link => !linked.has(link.url));
}

type AnswerBlock = { kind: "text"; line: string } | { kind: "list"; items: { title: string; details: string[] }[] } | { kind: "table"; rows: string[][] };
const cellsOf = (row: string) => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
const isRule = (row: string) => /^\|?[\s:|-]+\|?$/.test(row) && row.includes("-");

/** a reply as text: numbered events, bullets, bold, safe links, and any table the model writes as one line per row */
function Answer({ text, links }: { text: string; links?: Links }) {
  const blocks: AnswerBlock[] = [];
  let blank = false;
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/(?:&#x20;|&#32;|&nbsp;)+$/i, "").trimEnd();
    if (!line) { blank = true; continue; }
    const last = blocks.at(-1);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (/^\|.*\|$/.test(line)) {
      if (isRule(line)) {
        // the row above a rule is a header, already said by the rows below
        if (last?.kind === "table" && last.rows.length === 1) last.rows.pop();
      } else if (last?.kind === "table") last.rows.push(cellsOf(line));
      else blocks.push({ kind: "table", rows: [cellsOf(line)] });
    } else if (numbered) {
      const item = { title: numbered[1], details: [] };
      if (last?.kind === "list") last.items.push(item);
      else blocks.push({ kind: "list", items: [item] });
    } else if (last?.kind === "list" && !blank) {
      last.items[last.items.length - 1].details.push(line.replace(/^[-*•]\s+/, ""));
    } else {
      if (blank && last) blocks.push({ kind: "text", line: "" });
      blocks.push({ kind: "text", line });
    }
    blank = false;
  }
  return blocks.map((block, i) => {
    if (block.kind === "table") return <div key={i} className={s.rows}>
      {block.rows.map((cells, j) => <p key={j}>
        <strong>{inlineText(cells[0].replace(/\*\*/g, ""), links)}</strong>
        {cells.length > 1 && <span>{inlineText(cells.slice(1).filter(Boolean).join(" · "), links)}</span>}
      </p>)}
    </div>;
    if (block.kind === "list") return <ol key={i} className={s.numbered}>
      {block.items.map((item, j) => <li key={j}>
        <strong>{inlineText(item.title, links)}</strong>
        {item.details.map((detail, k) => <p key={k}>{inlineText(detail, links)}</p>)}
      </li>)}
    </ol>;
    if (!block.line) return <span key={i} className={s.gap} />;
    const bullet = /^[-*•]\s+/.test(block.line);
    const line = block.line.replace(/^(?:[-*•]|#{1,6})\s+/, "");
    return <p key={i} className={bullet ? s.bullet : undefined}>{inlineText(line, links)}</p>;
  });
}
async function api<T>(suffix = "", body?: object): Promise<T> {
  const r = await fetch("/api/concierge" + suffix, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || "Venu chưa tải được dữ liệu. Bạn thử lại nhé.");
  return json as T;
}

export default function FanConcierge() {
  const path = usePathname();
  const showParam = useSearchParams().get("dem");
  const lastPage = useRef("");
  const [panel, setPanel] = useState<"closed" | "open" | "minimized">("closed");
  const open = panel === "open";
  const minimized = panel === "minimized";
  const [view, setView] = useState<View>("chat");
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nights, setNights] = useState<Night[]>([]);
  const [asOf, setAsOf] = useState(0);
  const [ready, setReady] = useState(false);
  const [watches, setWatches] = useState<Watch[]>([]);
  const [selected, setSelected] = useState("");
  const [target, setTarget] = useState<number>();
  const [failedTrip, setFailedTrip] = useState<TripRequest | null>(null);
  const [visit, setVisit] = useState(0);
  const [hint, setHint] = useState(false);
  const [zoneId, setZoneId] = useState("");
  // the suggestion last put in the message box; sent unchanged, it goes straight to its task
  const [suggested, setSuggested] = useState<keyof typeof topics | null>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  // the message box grows with its text, up to a few lines, then scrolls inside
  useLayoutEffect(() => {
    const box = composer.current;
    if (!box) return;
    box.style.height = "auto";
    box.style.height = Math.min(box.scrollHeight, 132) + "px";
  }, [draft, view, open]);
  const justPaid = useRef("");
  const launcher = useRef<HTMLButtonElement>(null);
  const minimizeButton = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const unread = watches.filter(w => w.matchedAt && !w.read).length;
  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(HINT_SEEN) === "1"; } catch { /* storage blocked: show it this time */ }
    if (seen) return;
    const timer = window.setTimeout(() => setHint(true), 2500);
    return () => clearTimeout(timer);
  }, []);
  const dismissHint = useCallback(() => {
    setHint(false);
    try { localStorage.setItem(HINT_SEEN, "1"); } catch { /* it simply shows again next visit */ }
  }, []);
  const loadAlerts = useCallback(async () => {
    const id = ++seq.current;
    const data = await api<{ watches: Watch[] }>("/alerts");
    if (id === seq.current) setWatches(data.watches);
  }, []);
  useEffect(() => {
    const refresh = () => { if (!document.hidden) void loadAlerts().catch(() => {}); };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [loadAlerts]);
  useEffect(() => {
    // the night just paid for beats the page's own night, and needs a fresh list to count as booked
    const payment = (e: Event) => {
      justPaid.current = (e as CustomEvent<string>).detail;
      setReady(false); setVisit(n => n + 1); setFailedTrip(null);
      setView("trip"); setError(""); setPanel("open");
    };
    window.addEventListener("venu:plan-trip", payment);
    return () => window.removeEventListener("venu:plan-trip", payment);
  }, []);
  useEffect(() => {
    if (!open) return;
    let active = true;
    api<{ nights: Night[] }>().then(({ nights }) => {
      if (!active) return;
      setNights(nights); setAsOf(Date.now()); setReady(true);
      const eventId = path.split("/")[2];
      const here = nights.filter(n => n.eventId === eventId);
      const context = here.find(n => n.id === showParam) ?? here[0];
      const page = path + "?" + (showParam ?? "");
      const changed = lastPage.current !== page;
      lastPage.current = page;
      const paid = justPaid.current;
      justPaid.current = "";
      setSelected(old => paid || (changed ? context?.id ?? "" : nights.some(n => n.id === old) ? old : context?.id ?? ""));
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [open, path, showParam, view, visit]);
  const hidePanel = useCallback((next: "closed" | "minimized") => {
    setPanel(next);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);
  useEffect(() => {
    if (!open) return;
    minimizeButton.current?.focus();
    // with a pick list open, Escape closes only that list
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("#venu-assistant .filter-box.open")) hidePanel("minimized"); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [open, hidePanel]);
  // follows the conversation, while the welcome screen starts from its top
  useEffect(() => {
    if (view === "chat" && log.current && (lines.length || error)) log.current.scrollTop = log.current.scrollHeight;
  }, [lines, busy, view, open, error]);

  function navigate(next: View) { setView(next); setError(""); setFailedTrip(null); setTarget(undefined); }
  /** a suggestion becomes a message in the box, ready to send or to add details to */
  function suggest(k: keyof typeof topics) {
    setDraft(about[k].prompt); setSuggested(k); setError("");
    requestAnimationFrame(() => {
      const input = composer.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  }
  function send() {
    const requested = suggested && draft.trim() === about[suggested].prompt ? suggested : "chat";
    setSuggested(null);
    void chat(draft, requested, selected, "", true);
  }
  async function chat(text: string, requested: Topic, showId = selected, origin = "", typed = false) {
    const content = text.trim();
    if (!content || busy) return;
    const history = [...lines, { role: "user" as const, content }];
    setLines(history); setBusy(true); setError(""); setFailedTrip(null); setView("chat");
    if (typed) setDraft("");
    try {
      const r = await api<Reply>("/chat", { requested, showId, origin, lines: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })) });
      setLines(old => [...old, { role: "assistant", content: r.content, links: r.links, hotels: r.hotels }]);
      if (r.showId) setSelected(r.showId);
      setTarget(r.target); setView(r.action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bạn thử gửi lại nhé."); setLines(history.slice(0, -1));
      // a trip is sent again with its night and origin; a message goes back to the box unless a new one was typed there
      if (typed) setDraft(now => now || content);
      else setFailedTrip({ text: content, showId, origin });
    }
    finally { setBusy(false); }
  }

  const choices = nights.filter(n => view === "watch" ? Date.parse(n.start) > asOf && n.zones.length > 0 :
    view === "feedback" ? n.booked && Date.parse(n.end) <= asOf : Date.parse(n.end) > asOf);
  const night = choices.find(n => n.id === selected) ?? choices[0];
  const zone = night?.zones.find(z => z.id === zoneId) ?? night?.zones[0];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!night || busy) return;
    const data = new FormData(e.currentTarget);
    if (view === "trip") {
      const origin = String(data.get("origin") || "").trim();
      await chat(`Lên lịch đi xem ${label(night)} từ ${origin}. ${data.get("preferences") || ""}`, "trip", night.id, origin);
      return;
    }
    setBusy(true); setError("");
    try {
      if (view === "watch") {
        await api("", { kind: "watch", showId: night.id, zoneId: data.get("zone"), target: readAmount(data, "target") });
        setView("inbox"); await loadAlerts();
      } else {
        await api("", { kind: "feedback", showId: night.id, rating: Number(data.get("rating")), comment: data.get("comment") });
        setLines(old => [...old, { role: "assistant", content: `Cảm ơn bạn! Ban tổ chức đã nhận được đánh giá cho ${label(night)}.` }]);
        setView("chat");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Chưa lưu được. Bạn thử lại nhé."); }
    finally { setBusy(false); }
  }
  async function updateWatch(kind: "remove" | "read", id: string) {
    setBusy(true); setError("");
    try { await api("", { kind, id }); await loadAlerts(); }
    catch { setError("Chưa cập nhật được tin giá vé. Bạn thử lại nhé."); }
    finally { setBusy(false); }
  }

  return <div className={`${s.widget} ${open ? "" : s.closed}`}>
    {hint && panel === "closed" && !unread && <div className={s.hint}>
      <button type="button" className={s.hintText} onClick={() => { dismissHint(); setPanel("open"); }}>
        <strong>Cần gợi ý đêm diễn?</strong>Hỏi Venu về lịch diễn, giá vé và đường đi.
      </button>
      <button type="button" className={s.hintClose} aria-label="Ẩn gợi ý" onClick={dismissHint}><Icon name="close"/></button>
    </div>}
    <button type="button" className={`${s.launch} ${minimized ? s.compact : ""}`} ref={launcher}
      title={minimized ? "Mở lại trợ lý Venu" : "Hỏi Venu"}
      aria-label={`${minimized ? "Mở lại trợ lý Venu" : "Hỏi Venu, mở trợ lý AI"}${unread ? `, ${unread} tin giá vé mới` : ""}`}
      aria-expanded={open} aria-controls="venu-assistant" hidden={open} onClick={() => {dismissHint(); setPanel("open"); if (unread && !minimized) navigate("inbox");}}>
      <span className={s.mark}><BrandMark size={36} /></span>
      <span className={s.launchText}>
        <strong>{minimized ? "Trợ lý Venu" : "Hỏi Venu"}</strong>
        {!minimized && <small><i className={s.live} />Trợ lý AI</small>}
      </span>
      {unread > 0 && <b>{unread}</b>}
    </button>
    {panel !== "closed" && <section id="venu-assistant" role="dialog" aria-label="Trợ lý Venu" className={s.panel} data-view={view} hidden={minimized}>
      <header className={s.header}>
        <div className={s.identity}><BrandMark size={40} /><div><strong>Trợ lý Venu</strong><small>Lịch diễn, giá vé và đường đi</small></div></div>
        <div className={s.tools}>
          <button aria-label={`Tin giá vé${unread ? `, ${unread} tin mới` : ""}`} title="Tin giá vé" disabled={busy} onClick={() => { navigate("inbox"); void loadAlerts().catch(() => setError("Chưa tải được tin giá vé.")); }}><Icon name="bell"/>{unread > 0 && <b>{unread}</b>}</button>
          <button ref={minimizeButton} type="button" aria-label="Thu nhỏ trợ lý Venu" title="Thu nhỏ" onClick={() => hidePanel("minimized")}><Icon name="minimize"/></button>
        </div>
      </header>
      {view !== "chat" && <div className={s.subhead}>
        <button aria-label="Quay lại trò chuyện" title="Quay lại trò chuyện" disabled={busy} onClick={() => navigate("chat")}><Icon name="back"/></button>
        <h2>{view === "inbox" ? "Tin giá vé" : topics[view]}</h2>
      </div>}
      <div className={s.body} ref={log} key={view}>
        {view === "chat" ? <>
          {lines.length === 0 ? <div className={s.welcome}>
            <h2>Bạn cần Venu giúp gì?</h2>
            <p>Hỏi về lịch diễn, giá vé, chỗ trống, hoặc chọn một việc bên dưới.</p>
            {(Object.keys(topics) as (keyof typeof topics)[]).map(k => <button key={k} className={s.task} disabled={busy} onClick={() => suggest(k)}>
              <span className={s.tile}><Icon name={about[k].icon}/></span>
              <span className={s.taskText}><strong>{topics[k]}</strong><small>{about[k].hint}</small></span>
              <Icon name="next"/></button>)}
          </div> : <div className={s.thread} role="log" aria-live="polite">{lines.map((l, i) => l.role === "user" ? <p key={i} className={s.mine}>{l.content}</p> :
            <div key={i} className={s.reply}><BrandMark size={26} /><div>
              <div className={s.theirs}><Answer text={l.content} links={l.links} /></div>
              {l.hotels && <div className={s.hotels}>{l.hotels.map(h => <article key={h.rooms} className={s.hotel}>
                {/* the name opens the page the search found it on, when that page was verified */}
                <strong>{h.source ? <a className={s.name} href={h.source} target="_blank" rel="noopener noreferrer nofollow" title="Xem trang nguồn">{h.name}<Icon name="out"/></a> : h.name}</strong>
                {h.address && <p>{h.address}</p>}
                <div>
                  <a href={h.rooms} target="_blank" rel="noopener noreferrer">Đặt phòng<Icon name="out"/></a>
                  <a href={h.directions} target="_blank" rel="noopener noreferrer">Đường tới nơi diễn<Icon name="out"/></a>
                </div>
              </article>)}</div>}
              {shortcutsFor(l).length > 0 && <div className={s.links}>{shortcutsFor(l).map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label}<Icon name="out"/></a>)}</div>}
            </div></div>)}</div>}
          {busy && <div className={s.typing} role="status"><BrandMark size={26} /><span>Venu đang trả lời</span><i /><i /><i /></div>}
        </> : view === "inbox" ? <>
          {!watches.length && <div className={s.empty}><span className={s.tile}><Icon name="bell"/></span>
            <strong>Chưa theo dõi hạng vé nào</strong><p>Chọn một hạng vé và mức giá để nhận tin tại đây.</p></div>}
          {watches.map(w => <article className={`${s.watch} ${w.matchedAt && !w.read ? s.fresh : ""}`} key={w.id}>
            <span className={`${s.state} ${w.matchedAt ? s.matched : ""}`}>{w.matchedAt ? "Đã đạt mức bạn chọn" : Date.parse(w.start) <= asOf ? "Suất diễn đã bắt đầu" : "Đang theo dõi"}</span>
            <h3>{w.title}</h3>
            <p className={s.muted}>{w.night} · {w.zone}</p>
            <dl className={s.prices}>
              <div><dt>Bạn muốn</dt><dd>{vnd(w.target)}</dd></div>
              {w.matchedAt && w.matchedPrice !== null && <div className={s.hit}><dt>Giá lúc báo · {date(w.matchedAt)}</dt><dd>{vnd(w.matchedPrice)}</dd></div>}
            </dl>
            <div className={s.actions}>
              {w.matchedAt && <Link className={s.see} href={`/events/${w.eventId}?dem=${w.showId}`} onClick={() => hidePanel("closed")}>Xem vé</Link>}
              {w.matchedAt && !w.read && <button disabled={busy} onClick={() => updateWatch("read", w.id)}>Đã đọc</button>}
              <button disabled={busy} onClick={() => updateWatch("remove", w.id)}>Bỏ theo dõi</button>
            </div>
          </article>)}
        </> : !ready ? !error && <p className={s.muted} role="status">Đang tải suất diễn…</p> :
          !night ? <div className={s.empty}><span className={s.tile}><Icon name={about[view].icon}/></span>
            <strong>{view === "watch" ? "Chưa có suất diễn để theo dõi" : view === "trip" ? "Chưa có đêm diễn sắp tới" : "Chưa có đêm diễn để đánh giá"}</strong>
            <p>{view === "feedback" ? "Bạn có thể đánh giá tại đây sau khi suất diễn đã mua vé trên trình duyệt này kết thúc." : "Các suất diễn sắp tới sẽ xuất hiện ở đây."}</p>
          </div> : <form className={s.form} onSubmit={submit} key={view + night.id}>
            <div className={s.field}><span>Suất diễn</span>
              <FilterMenu ariaLabel="Suất diễn" label={label(night)} value={night.id} onPick={setSelected}
                options={choices.map(n => ({ value: n.id, label: label(n) }))} /></div>
            <div className={s.night}>
              <span className={s.day}><b>{local(night.start, { day: "numeric" })}</b>Th {local(night.start, { month: "numeric" })}</span>
              <p><strong>{night.title}</strong>
                <span>{local(night.start, { weekday: "long" })} · {local(night.start, { hour: "2-digit", minute: "2-digit" })}</span>
                <span>{night.location}</span></p>
            </div>
            {view === "watch" ? <>
              <div className={s.field}><span>Hạng vé</span>
                <FilterMenu ariaLabel="Hạng vé" label={zone?.name ?? ""} value={zone?.id ?? ""} onPick={setZoneId}
                  options={night.zones.map(z => ({ value: z.id, label: z.name }))} />
                <input type="hidden" name="zone" value={zone?.id ?? ""} /></div>
              <label className={s.field}>Báo khi giá bằng hoặc thấp hơn<span className={s.money}><input name="target" required inputMode="numeric" pattern={INTEGER_PATTERN} placeholder="Ví dụ 1.000.000"
                defaultValue={target === undefined ? "" : integerFormat.format(target)}
                onInput={e => groupAmount(e.currentTarget)} onKeyDown={skipGroupSeparator} /><i aria-hidden="true">₫</i></span></label>
              <p className={s.muted}>Venu sẽ báo trong Tin giá vé khi hạng này còn chỗ và đạt mức bạn chọn.</p>
              <button className={s.primary} disabled={busy}>Lưu theo dõi</button>
            </> : view === "trip" ? <>
              <label className={s.field}>Bạn xuất phát từ đâu?<input name="origin" required maxLength={200} placeholder="Thành phố hoặc quận/huyện"/></label>
              <label className={s.field}>Bạn muốn đi thế nào?<textarea name="preferences" maxLength={800} placeholder="Ví dụ: đi tàu, ở một đêm gần sân khấu"/></label>
              <button className={s.primary} disabled={busy}>Gợi ý lịch đi</button>
            </> : <>
              <fieldset className={s.rating}><legend>Bạn chấm mấy sao?</legend><div className={s.stars}>{[1, 2, 3, 4, 5].map(n =>
                <label key={n} className={s.star}><input type="radio" name="rating" value={n} required defaultChecked={night.feedback?.rating === n}/><Icon name="star"/>{n} sao</label>)}</div></fieldset>
              <label className={s.field}>Cảm nhận của bạn<textarea name="comment" defaultValue={night.feedback?.comment} maxLength={2000} placeholder="Điều bạn thích hoặc muốn góp ý"/></label>
              <button className={s.primary} disabled={busy}>{night.feedback ? "Cập nhật đánh giá" : "Gửi cho ban tổ chức"}</button>
            </>}
          </form>}
        {error && <div className={s.error} role="alert"><p>{error}</p>
          {view === "chat" && failedTrip && <button onClick={() => void chat(failedTrip.text, "trip", failedTrip.showId, failedTrip.origin)}>Thử lại</button>}</div>}
      </div>
      {view === "inbox" && <div className={s.foot}>
        <button className={`${s.primary} ${s.add}`} onClick={() => navigate("watch")}>Theo dõi giá vé</button>
      </div>}
      {view === "chat" && <div className={s.foot}>
        <form className={s.compose} onSubmit={e => {e.preventDefault(); send();}}>
          <textarea ref={composer} rows={1} aria-label="Tin nhắn cho Venu" maxLength={2000} placeholder="Nhắn cho Venu…" value={draft} onChange={e=>setDraft(e.target.value)}
            onKeyDown={e => {
              // Enter sends and Shift+Enter starts a new line; an Enter that confirms a Vietnamese IME word is left to the IME
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              if (!busy && draft.trim()) send();
            }}/>
          <button disabled={busy || !draft.trim()} aria-label="Gửi tin nhắn"><Icon name="arrow"/></button>
        </form>
      </div>}
    </section>}
  </div>;
}

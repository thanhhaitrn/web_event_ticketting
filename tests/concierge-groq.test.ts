import assert from "node:assert/strict";
import test from "node:test";
import type { Night } from "../lib/concierge/types";
import { promisesPriceWatch, watchFromMessage } from "../lib/concierge/watch-request";

test("a spoken watch request must identify one upcoming night, tier and threshold", () => {
  const night: Night = {
    id: "night", eventId: "event", title: "Tùng Dương – Live Concert", name: "Đêm 1", location: "Hà Nội",
    booked: false, start: "2099-12-19T12:30:00Z", end: "2099-12-19T16:00:00Z",
    zones: [{ id: "sky", name: "Skybox Phượng Hoàng" }], feedback: null,
  };
  const text = "ãy nhắc tôi khi giá vé sky box của tùng dương giảm xuống tầm 16 triệu";
  assert.deepEqual(watchFromMessage(text, [night]), { night, zone: night.zones[0], target: 16000000 });
  assert.equal(watchFromMessage(text.replace("16 triệu", "16.000.000 ₫"), [night])?.target, 16000000);
  assert.equal(watchFromMessage(text.replace("16 triệu", "1,5 triệu"), [night])?.target, 1500000);
  assert.equal(watchFromMessage("Giá vé Sky Box của Tùng Dương có phải 16 triệu?", [night]), undefined);
  assert.equal(watchFromMessage("Đừng " + text, [night]), undefined);
  assert.equal(watchFromMessage(text, [night, { ...night, id: "night2" }]), undefined);
  assert.equal(watchFromMessage(text, [{ ...night, zones: [...night.zones, { id: "sky2", name: "Skybox B" }] }]), undefined);
  assert.equal(promisesPriceWatch("Tôi sẽ nhắc bạn khi giá vé Skybox giảm xuống 16 triệu."), true);
});

test("LangGraph uses GroqCloud for price alerts and keeps travel links usable during an outage", async (t) => {
  process.env.DATABASE_URL ??= "postgresql://localhost/unused";
  const { concierge } = await import("../lib/concierge/graph");
  process.env.GROQ_API_KEY = "test-key";
  const night: Night = {
    id: "s1", eventId: "e1", name: "Đêm 1", title: "Bản tình ca", location: "Nhà hát Lớn, Hà Nội",
    booked: true, start: "2099-03-02T13:00:00Z", end: "2099-03-02T16:00:00Z", zones: [], feedback: null,
  };
  const request = { nights: [night], selected: night.id, origin: "Hải Phòng",
    lines: [{ role: "user" as const, content: "Báo mình khi vé còn 500 nghìn" }] };
  const mock = t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    assert.equal(new Headers(options.headers).get("Authorization"), "Bearer test-key");
    const body = JSON.parse(String(options.body));
    assert.equal(body.model, "openai/gpt-oss-20b");
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.strict, true);
    return Response.json({ choices: [{ message: { content: '{"action":"watch","index":0,"target":500000}' } }] });
  });
  const { reply } = await concierge.invoke({ ...request, requested: "chat" });
  assert.equal(reply.action, "watch");
  assert.equal(reply.target, 500000);
  assert.equal(reply.showId, night.id);
  mock.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  const { reply: trip } = await concierge.invoke({ ...request, requested: "trip" });
  assert.match(trip.content, /Nhà hát Lớn/);
  const [map, hotel] = trip.links!.map((link: { url: string }) => new URL(link.url));
  assert.equal(map.searchParams.get("origin"), request.origin);
  assert.equal(map.searchParams.get("destination"), night.location);
  assert.equal(hotel.searchParams.get("checkin"), "2099-03-02");
  const { reply: guest } = await concierge.invoke({ ...request, nights: [{ ...night, booked: false }], requested: "trip" });
  assert.equal(guest.action, "chat");
  assert.equal(guest.showId, night.id);
  assert.deepEqual(guest.links, trip.links);
  const { reply: chooseNight } = await concierge.invoke({ ...request, selected: "", requested: "trip" });
  assert.equal(chooseNight.action, "trip");
  assert.equal(chooseNight.links, undefined);
  assert.equal(mock.mock.callCount(), 3);

  mock.mock.mockImplementation(async () => Response.json({ choices: [{ message: { content: "Khách sạn gần đó có giá 1 200 000 ₫/đêm." } }] }));
  const { reply: lodging } = await concierge.invoke({ ...request, nights: [{ ...night, booked: false }],
    requested: "trip", lines: [{ role: "user", content: "Mình muốn ở gần nơi diễn." }] });
  assert.doesNotMatch(lodging.content, /₫/);
  assert.match(lodging.content, /Nhà hát Lớn/);
  assert.deepEqual(lodging.links, trip.links);
});

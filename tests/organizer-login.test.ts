import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../app/api/organizer/login/route";
import { isOrganizer, ORGANIZER_COOKIE, safeNext } from "../lib/organizer-auth";

test("organizer login keeps the originating host and only permits HTTP cookies for an explicit local preview", async () => {
  const keys = ["NODE_ENV", "ORGANIZER_PASSWORD", "ORGANIZER_SECRET", "ORGANIZER_LOCAL_PREVIEW"];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const target = "/organizer/pricing-simulation";
  async function login(origin: string, password = "test-password") {
    return POST(new NextRequest(origin + "/api/organizer/login", {
      method: "POST", body: new URLSearchParams({ next: target, password }),
    }));
  }
  try {
    Object.assign(process.env, { NODE_ENV: "production", ORGANIZER_PASSWORD: "test-password", ORGANIZER_SECRET: "test-only" });
    delete process.env.ORGANIZER_LOCAL_PREVIEW;
    const standard = await login("http://localhost:3138");
    assert.equal(standard.cookies.get(ORGANIZER_COOKIE)?.secure, true);
    process.env.ORGANIZER_LOCAL_PREVIEW = "1";
    for (const origin of ["http://127.0.0.1:3138", "http://localhost:3138", "https://tickets.example", "http://tickets.example"]) {
      const response = await login(origin);
      assert.equal(response.status, 303);
      assert.equal(response.headers.get("location"), target);
      const session = response.cookies.get(ORGANIZER_COOKIE);
      assert.equal(await isOrganizer(session?.value), true);
      assert.equal(session?.secure, origin.includes("tickets.example"));
    }
    const denied = await login("http://127.0.0.1:3138", "wrong");
    assert.ok(denied.headers.get("location")?.startsWith("/organizer/login?error=password&"));
    assert.equal(denied.cookies.has(ORGANIZER_COOKIE), false);
    assert.equal(safeNext("//outside.example"), "/organizer/events");
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});

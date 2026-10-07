import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function signGuestId(profileId) {
  const mac = createHmac("sha256", process.env.GUEST_COOKIE_SECRET)
    .update(profileId)
    .digest("base64url");
  return `${profileId}.${mac}`;
}

function guestCookie(profileId) {
  return `outdocs_guest=${signGuestId(profileId)}`;
}

async function seedGuest(name) {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .insert({ full_name: name, is_guest: true, quota_limit: 5, quota_used: 0 })
    .select()
    .single();
  if (profileError) throw profileError;

  const { data: session, error: sessionError } = await admin
    .from("sessions")
    .insert({ user_id: profile.id, title: `${name} session` })
    .select()
    .single();
  if (sessionError) throw sessionError;

  return { profile, session };
}

function post(path, { body, cookie, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (!form) headers["content-type"] = "application/json";

  return fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: form ?? JSON.stringify(body ?? {}),
  });
}

let alice;
let bob;

before(async () => {
  for (const key of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GUEST_COOKIE_SECRET",
  ]) {
    assert.ok(process.env[key], `${key} must be set (run with --env-file=.env.local)`);
  }

  const probe = await fetch(`${BASE_URL}/api/guest`).catch(() => null);
  assert.ok(probe, `No server at ${BASE_URL} — start it with "npm run dev"`);
  assert.equal(
    probe.status,
    401,
    `${BASE_URL} does not look like this app (GET /api/guest returned ${probe.status}, expected 401)`
  );

  alice = await seedGuest("Isolation Test Alice");
  bob = await seedGuest("Isolation Test Bob");
});

after(async () => {
  for (const actor of [alice, bob]) {
    if (actor) await admin.from("profiles").delete().eq("id", actor.profile.id);
  }
});

describe("unscoped retrieval is impossible", () => {
  test("chat without a sessionId is rejected before retrieval", async () => {
    const res = await post("/api/chat", { body: { question: "what salary figures appear?" } });
    assert.equal(res.status, 400);
  });

  test("chat without a sessionId is rejected even with a valid guest cookie", async () => {
    const res = await post("/api/chat", {
      body: { question: "what salary figures appear?" },
      cookie: guestCookie(alice.profile.id),
    });
    assert.equal(res.status, 400);
  });
});

describe("missing credentials are rejected", () => {
  test("chat with a session id but no cookie returns 401", async () => {
    const res = await post("/api/chat", {
      body: { question: "summarize this", sessionId: alice.session.id },
    });
    assert.equal(res.status, 401);
  });

  test("chat with a tampered cookie signature returns 401", async () => {
    const forged = `outdocs_guest=${alice.profile.id}.not-a-valid-signature`;
    const res = await post("/api/chat", {
      body: { question: "summarize this", sessionId: alice.session.id },
      cookie: forged,
    });
    assert.equal(res.status, 401);
  });

  test("a signature valid for Alice cannot be replayed as Bob", async () => {
    const swapped = `outdocs_guest=${bob.profile.id}.${signGuestId(alice.profile.id).split(".")[1]}`;
    const res = await post("/api/chat", {
      body: { question: "summarize this", sessionId: bob.session.id },
      cookie: swapped,
    });
    assert.equal(res.status, 401);
  });

  test("listing sessions without a cookie returns 401", async () => {
    const res = await fetch(`${BASE_URL}/api/session`);
    assert.equal(res.status, 401);
  });
});

describe("foreign sessions are rejected", () => {
  test("Alice cannot read or write Bob's session via chat", async () => {
    const res = await post("/api/chat", {
      body: { question: "summarize this", sessionId: bob.session.id },
      cookie: guestCookie(alice.profile.id),
    });
    assert.equal(res.status, 403);

    const { count } = await admin
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("session_id", bob.session.id);
    assert.equal(count, 0);
  });

  test("Alice cannot ingest text into Bob's session", async () => {
    const res = await post("/api/ingest-text", {
      body: { text: "injected content", sessionId: bob.session.id },
      cookie: guestCookie(alice.profile.id),
    });
    assert.equal(res.status, 403);
  });

  test("Alice cannot upload into Bob's session", async () => {
    const form = new FormData();
    form.set("file", new File(["injected content"], "payload.txt", { type: "text/plain" }));
    form.set("sessionId", bob.session.id);

    const res = await post("/api/upload", { form, cookie: guestCookie(alice.profile.id) });
    assert.equal(res.status, 403);
  });

  test("Alice cannot delete Bob's session", async () => {
    const res = await fetch(`${BASE_URL}/api/session?id=${bob.session.id}`, {
      method: "DELETE",
      headers: { cookie: guestCookie(alice.profile.id) },
    });
    assert.equal(res.status, 403);

    const { data } = await admin.from("sessions").select("id").eq("id", bob.session.id).maybeSingle();
    assert.ok(data, "Bob's session must still exist");
  });

  test("Alice cannot claim Bob's guest data via profile merge", async () => {
    const res = await post("/api/profile/ensure", {
      body: { email: "alice@example.com", fullName: "Alice" },
      cookie: guestCookie(alice.profile.id),
    });
    assert.equal(res.status, 403);
  });
});

describe("own session remains usable", () => {
  test("Alice sees only her own sessions", async () => {
    const res = await fetch(`${BASE_URL}/api/session`, {
      headers: { cookie: guestCookie(alice.profile.id) },
    });
    assert.equal(res.status, 200);

    const sessions = await res.json();
    const ids = sessions.map((s) => s.id);
    assert.ok(ids.includes(alice.session.id));
    assert.ok(!ids.includes(bob.session.id));
  });

  test("an unknown session id is rejected for an authenticated guest", async () => {
    const res = await post("/api/chat", {
      body: { question: "summarize this", sessionId: randomUUID() },
      cookie: guestCookie(alice.profile.id),
    });
    assert.equal(res.status, 403);
  });
});

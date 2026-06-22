import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { withApiContract } from "@/lib/api/route";

function nextReq(method: string, contentType?: string, body?: string) {
  return new NextRequest("http://localhost/api/test", {
    method,
    headers: contentType ? { "Content-Type": contentType } : {},
    body,
  });
}

describe("withApiContract", () => {
  it("returns 415 for body-carrying requests without application/json", async () => {
    const wrapped = withApiContract(async () => new Response("ok"));
    const res = await wrapped(nextReq("POST", "text/plain"));
    expect(res.status).toBe(415);
    expect(await res.json()).toEqual({ error: "Content-Type must be application/json" });
  });

  it("passes through a successful POST with JSON content type", async () => {
    const wrapped = withApiContract(
      async () => new Response(JSON.stringify({ ok: true }), { status: 201 }),
    );
    const res = await wrapped(nextReq("POST", "application/json"));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("GET bypasses content-type check", async () => {
    const wrapped = withApiContract(
      async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
    );
    const res = await wrapped(nextReq("GET"));
    expect(res.status).toBe(200);
  });

  it("DELETE bypasses content-type check (no body → Content-Type has no meaning per RFC 7231)", async () => {
    // Browsers' fetch() does NOT set Content-Type on a body-less
    // DELETE, so requiring it would produce a spurious 415 on every
    // legitimate DELETE. The gate must exempt DELETE alongside
    // GET/HEAD.
    const wrapped = withApiContract(
      async () => new Response(JSON.stringify({ ulid: "x" }), { status: 200 }),
    );
    const res = await wrapped(nextReq("DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ulid: "x" });
  });

  it("DELETE still passes when Content-Type IS application/json (idempotent)", async () => {
    const wrapped = withApiContract(
      async () => new Response(JSON.stringify({ ulid: "x" }), { status: 200 }),
    );
    const res = await wrapped(nextReq("DELETE", "application/json"));
    expect(res.status).toBe(200);
  });

  it("catches unhandled throws → 500 with non-leaking message", async () => {
    const wrapped = withApiContract(async () => {
      throw new Error("DB password is hunter2 — leaked!");
    });
    const res = await wrapped(nextReq("POST", "application/json"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

import { describe, it, expect } from "vitest";
import { errorEnvelope, jsonError, jsonOk, jsonCreated } from "@/lib/api/response";
import { requireJson } from "@/lib/api/content-type";

function makeRequest(method: string, contentType?: string) {
  return new Request("http://localhost/api/test", {
    method,
    headers: contentType ? { "Content-Type": contentType } : {},
  });
}

describe("errorEnvelope / response helpers", () => {
  it("errorEnvelope returns { error: <message> }", () => {
    expect(errorEnvelope("oops")).toEqual({ error: "oops" });
  });

  it("jsonError produces a 400 JSON envelope", async () => {
    const res = jsonError(400, "bad");
    expect(res.status).toBe(400);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "bad" });
  });

  it("jsonOk produces a 200 JSON body", async () => {
    const res = jsonOk({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("jsonCreated produces a 201 JSON body", async () => {
    const res = jsonCreated({ id: 1 });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
  });
});

describe("requireJson content-type gate", () => {
  it("GET requests bypass the gate", () => {
    expect(requireJson(makeRequest("GET", "text/plain"))).toBeNull();
    expect(requireJson(makeRequest("GET"))).toBeNull();
  });

  it("POST without Content-Type → 415", async () => {
    const res = requireJson(makeRequest("POST"));
    expect(res?.status).toBe(415);
    expect(await res!.json()).toEqual({ error: "Content-Type must be application/json" });
  });

  it("POST with text/plain → 415", async () => {
    const res = requireJson(makeRequest("POST", "text/plain"));
    expect(res?.status).toBe(415);
  });

  it("POST with application/json; charset=utf-8 → null (allowed)", () => {
    expect(requireJson(makeRequest("POST", "application/json; charset=utf-8"))).toBeNull();
  });

  it("POST with application/json → null (allowed)", () => {
    expect(requireJson(makeRequest("POST", "application/json"))).toBeNull();
  });
});

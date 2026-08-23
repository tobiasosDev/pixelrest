import { afterEach, describe, expect, test } from "bun:test";
import { GET } from "../app/api/x/connect/route";

const ENV_KEYS = [
  "CRON_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_CONSUMER_KEY",
  "X_API_KEY",
  "X_CONSUMER_SECRET",
  "X_API_SECRET",
];

function url(query = ""): Request {
  return new Request(`https://pixelrest.com/api/x/connect${query}`);
}

describe("x connect authorization", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
    for (const key of ENV_KEYS) {
      delete process.env[key];
    }
  });

  test("rejects everything when CRON_SECRET is unset", async () => {
    const res = await GET(url());
    expect(res.status).toBe(401);
  });

  test("rejects requests without credentials", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(url());
    expect(res.status).toBe(401);
  });

  test("rejects a wrong bearer token", async () => {
    process.env.CRON_SECRET = "s3cret";
    const req = new Request("https://pixelrest.com/api/x/connect", {
      headers: { authorization: "Bearer nope" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("no longer accepts the secret as a query parameter", async () => {
    process.env.CRON_SECRET = "s3cret";
    const res = await GET(url("?secret=s3cret"));
    expect(res.status).toBe(401);
  });

  test("a valid bearer token reaches the X connect step", async () => {
    process.env.CRON_SECRET = "s3cret";
    const req = new Request("https://pixelrest.com/api/x/connect", {
      headers: { authorization: "Bearer s3cret" },
    });
    const res = await GET(req);
    expect(res.status).not.toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("X client keys are missing");
  });
});

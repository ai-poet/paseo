import { afterEach, describe, expect, it, vi } from "vitest";
import { createSub2APIClient } from "./sub2api-client";

describe("sub2api-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes nested group-status payloads into flat items", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: [
              {
                group: { id: 42, name: "Anthropic Fast" },
                summary: {
                  latest_status: "up",
                  stable_status: "up",
                  latency_ms: 123,
                  observed_at: "2026-04-24T10:00:00Z",
                },
                availability_24h: 99.9,
                availability_7d: 98.7,
              },
            ],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createSub2APIClient({
      endpoint: "https://api.example.com",
      getAccessToken: async () => "token",
    });

    await expect(client.getGroupStatuses()).resolves.toEqual([
      {
        group_id: 42,
        group_name: "Anthropic Fast",
        latest_status: "up",
        stable_status: "up",
        latency_ms: 123,
        availability_24h: 99.9,
        availability_7d: 98.7,
        observed_at: "2026-04-24T10:00:00Z",
      },
    ]);
  });
});

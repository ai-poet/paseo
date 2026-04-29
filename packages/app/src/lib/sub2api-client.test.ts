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

  it("requests paginated usage logs with filters", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: { items: [], total: 0, page: 2, page_size: 25, pages: 0 },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createSub2APIClient({
      endpoint: "https://api.example.com",
      getAccessToken: async () => "token",
    });

    await client.listUsageLogs({
      page: 2,
      pageSize: 25,
      apiKeyId: 11,
      startDate: "2026-04-01",
      endDate: "2026-04-28",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/api/v1/usage?page=2&page_size=25&api_key_id=11&start_date=2026-04-01&end_date=2026-04-28",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("requests group status detail endpoints", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            message: "ok",
            data: [],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createSub2APIClient({
      endpoint: "https://api.example.com",
      getAccessToken: async () => "token",
    });

    await client.getGroupStatusHistory(42, "7d");
    await client.getGroupStatusRecords(42, 12);
    await client.getGroupStatusEvents(42, 8);

    const requestedUrls = (fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>).map(
      (call) => call[0],
    );
    expect(requestedUrls).toEqual([
      "https://api.example.com/api/v1/group-status/42/history?period=7d",
      "https://api.example.com/api/v1/group-status/42/records?limit=12",
      "https://api.example.com/api/v1/group-status/42/events?limit=8",
    ]);
  });
});

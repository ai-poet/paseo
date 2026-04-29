import { describe, expect, it } from "vitest";
import type { Sub2APIGroupStatusItem } from "@/lib/sub2api-client";
import { resolveGroupStatusDisplayName } from "./paseo-cloud-model-status-utils";

const status: Sub2APIGroupStatusItem = {
  group_id: 42,
  group_name: "",
  latest_status: "up",
  stable_status: "up",
  latency_ms: null,
  availability_24h: null,
  availability_7d: null,
  observed_at: null,
};

describe("resolveGroupStatusDisplayName", () => {
  it("uses available group names when status group_name is missing", () => {
    expect(resolveGroupStatusDisplayName(status, new Map([[42, "Claude Fast"]]))).toBe(
      "Claude Fast",
    );
  });

  it("falls back to group id when no name is available", () => {
    expect(resolveGroupStatusDisplayName(status, new Map())).toBe("Group #42");
  });
});

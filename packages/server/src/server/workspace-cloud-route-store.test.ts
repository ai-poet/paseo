import { describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  WorkspaceCloudRouteStore,
  buildWorkspaceCloudLaunchEnv,
} from "./workspace-cloud-route-store.js";

function createTempPaseoHome(): string {
  return mkdtempSync(path.join(tmpdir(), "paseo-cloud-routes-"));
}

describe("WorkspaceCloudRouteStore", () => {
  test("stores routes independently per cwd and provider", () => {
    const paseoHome = createTempPaseoHome();
    try {
      const store = new WorkspaceCloudRouteStore(paseoHome);

      store.setRoute({
        cwd: "/repo/worktree-a",
        provider: "claude",
        endpoint: "https://cloud.example.com/v1",
        apiKey: "sk-claude-a",
        apiKeyId: 11,
        groupId: 101,
        groupName: "Anthropic Fast",
        platform: "anthropic",
      });
      store.setRoute({
        cwd: "/repo/worktree-a",
        provider: "codex",
        endpoint: "https://cloud.example.com/v1",
        apiKey: "sk-codex-a",
        apiKeyId: 22,
        groupId: 202,
        groupName: "OpenAI Cheap",
        platform: "openai",
      });
      store.setRoute({
        cwd: "/repo/worktree-b",
        provider: "claude",
        endpoint: "https://cloud.example.com/v1",
        apiKey: "sk-claude-b",
        apiKeyId: 33,
        groupId: 303,
        groupName: "Anthropic Safe",
        platform: "anthropic",
      });

      expect(store.getRoute("/repo/worktree-a", "claude")).toEqual(
        expect.objectContaining({
          cwd: "/repo/worktree-a",
          provider: "claude",
          apiKey: "sk-claude-a",
          groupId: 101,
        }),
      );
      expect(store.getRoute("/repo/worktree-a", "codex")).toEqual(
        expect.objectContaining({
          cwd: "/repo/worktree-a",
          provider: "codex",
          apiKey: "sk-codex-a",
          groupId: 202,
        }),
      );
      expect(store.getRoute("/repo/worktree-b", "claude")).toEqual(
        expect.objectContaining({
          cwd: "/repo/worktree-b",
          provider: "claude",
          apiKey: "sk-claude-b",
          groupId: 303,
        }),
      );
    } finally {
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });

  test("builds Claude env without writing global config", () => {
    const paseoHome = createTempPaseoHome();
    try {
      const env = buildWorkspaceCloudLaunchEnv({
        paseoHome,
        route: {
          cwd: "/repo/worktree-a",
          provider: "claude",
          endpoint: "https://cloud.example.com/v1",
          apiKey: "sk-claude",
          apiKeyId: 11,
          groupId: 101,
          groupName: "Anthropic Fast",
          platform: "anthropic",
          updatedAt: "2026-04-29T00:00:00.000Z",
        },
      });

      expect(env).toEqual(
        expect.objectContaining({
          ANTHROPIC_BASE_URL: "https://cloud.example.com",
          ANTHROPIC_AUTH_TOKEN: "sk-claude",
        }),
      );
      expect(env.CODEX_HOME).toBeUndefined();
    } finally {
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });

  test("builds isolated Codex config under PASEO_HOME", () => {
    const paseoHome = createTempPaseoHome();
    try {
      const env = buildWorkspaceCloudLaunchEnv({
        paseoHome,
        route: {
          cwd: "/repo/worktree-a",
          provider: "codex",
          endpoint: "https://cloud.example.com/v1",
          apiKey: "sk-codex",
          apiKeyId: 22,
          groupId: 202,
          groupName: "OpenAI Cheap",
          platform: "openai",
          updatedAt: "2026-04-29T00:00:00.000Z",
        },
      });

      expect(env.CODEX_HOME).toMatch(/cloud-routes/);
      expect(env.OPENAI_API_KEY).toBe("sk-codex");
      const codexHome = env.CODEX_HOME!;
      const auth = JSON.parse(readFileSync(path.join(codexHome, "auth.json"), "utf8"));
      const config = readFileSync(path.join(codexHome, "config.toml"), "utf8");
      expect(auth.OPENAI_API_KEY).toBe("sk-codex");
      expect(config).toContain('base_url = "https://cloud.example.com/v1"');
      expect(config).toContain('wire_api = "responses"');
    } finally {
      rmSync(paseoHome, { recursive: true, force: true });
    }
  });
});

import { describe, expect, it } from "vitest";
import { resolveDevelopmentEntrypoint } from "./development-entrypoint";

const SOURCE_PATH = "/repo/packages/server/scripts/supervisor-entrypoint.ts";
const DIST_PATH = "/repo/packages/server/dist/scripts/supervisor-entrypoint.js";

function exists(paths: string[]): (filePath: string) => boolean {
  const set = new Set(paths);
  return (filePath) => set.has(filePath);
}

describe("resolveDevelopmentEntrypoint", () => {
  it("prefers the source entrypoint in development when both source and dist exist", () => {
    expect(
      resolveDevelopmentEntrypoint({
        sourcePath: SOURCE_PATH,
        distPath: DIST_PATH,
        exists: exists([SOURCE_PATH, DIST_PATH]),
      }),
    ).toEqual({
      entryPath: SOURCE_PATH,
      execArgv: ["--import", "tsx"],
    });
  });

  it("falls back to dist when the source entrypoint is unavailable", () => {
    expect(
      resolveDevelopmentEntrypoint({
        sourcePath: SOURCE_PATH,
        distPath: DIST_PATH,
        exists: exists([DIST_PATH]),
      }),
    ).toEqual({
      entryPath: DIST_PATH,
      execArgv: [],
    });
  });

  it("can force dist with the development entrypoint preference", () => {
    expect(
      resolveDevelopmentEntrypoint({
        sourcePath: SOURCE_PATH,
        distPath: DIST_PATH,
        envPreference: "dist",
        exists: exists([SOURCE_PATH, DIST_PATH]),
      }),
    ).toEqual({
      entryPath: DIST_PATH,
      execArgv: [],
    });
  });
});

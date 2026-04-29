import { existsSync } from "node:fs";
import type { NodeEntrypointSpec } from "./node-entrypoint-launcher.js";

export const DESKTOP_DEV_ENTRYPOINT_ENV = "PASEO_DESKTOP_DEV_ENTRYPOINT";

type DevelopmentEntrypointPreference = "source" | "dist";

function normalizePreference(value: string | undefined): DevelopmentEntrypointPreference {
  return value?.trim().toLowerCase() === "dist" ? "dist" : "source";
}

export function resolveDevelopmentEntrypoint(input: {
  sourcePath: string;
  distPath: string;
  envPreference?: string;
  exists?: (filePath: string) => boolean;
}): NodeEntrypointSpec | null {
  const exists = input.exists ?? existsSync;
  const sourceEntrypoint: NodeEntrypointSpec = {
    entryPath: input.sourcePath,
    execArgv: ["--import", "tsx"],
  };
  const distEntrypoint: NodeEntrypointSpec = {
    entryPath: input.distPath,
    execArgv: [],
  };
  const candidates =
    normalizePreference(input.envPreference) === "dist"
      ? [distEntrypoint, sourceEntrypoint]
      : [sourceEntrypoint, distEntrypoint];

  return candidates.find((entrypoint) => exists(entrypoint.entryPath)) ?? null;
}

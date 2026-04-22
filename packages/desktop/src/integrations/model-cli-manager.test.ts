import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_PACKAGE_NAME,
  CODEX_PACKAGE_NAME,
  REQUIRED_NODE_MAJOR,
  parseMajorVersion,
  parseSemanticVersion,
  resolvePackageInstallShellOptions,
  wrapWithNode22Runtime,
  wrapWithRuntimeManager,
} from "./model-cli-manager";

describe("model-cli-manager", () => {
  it("extracts semantic versions from common CLI outputs", () => {
    expect(parseSemanticVersion("codex-cli 0.118.0")).toBe("0.118.0");
    expect(parseSemanticVersion("2.1.89 (Claude Code)")).toBe("2.1.89");
  });

  it("extracts the node major version", () => {
    expect(parseMajorVersion("22.15.1")).toBe(22);
    expect(parseMajorVersion("v20.20.1")).toBe(20);
    expect(parseMajorVersion(null)).toBeNull();
  });

  it("wraps Node 22 install commands for nvm", () => {
    const command = wrapWithNode22Runtime("npm install -g @openai/codex@latest", "nvm");

    expect(command).toContain(`nvm install ${REQUIRED_NODE_MAJOR}`);
    expect(command).toContain(`nvm alias default ${REQUIRED_NODE_MAJOR}`);
    expect(command).toContain(`nvm use ${REQUIRED_NODE_MAJOR}`);
    expect(command).toContain('export PATH="$NVM_BIN:$PATH"');
  });

  it("leaves shell runtime commands unchanged", () => {
    const command = "codex --version";

    expect(wrapWithRuntimeManager(command, "shell")).toBe(command);
    expect(wrapWithNode22Runtime(command, "shell")).toBe(command);
  });

  it("uses cmd shell for Codex install on Windows shell manager", () => {
    const options = resolvePackageInstallShellOptions(
      CODEX_PACKAGE_NAME,
      "shell",
      { gitBashPath: "C:/Program Files/Git/bin/bash.exe" },
      "win32",
    );
    expect(options?.forceWindowsCmd).toBe(true);
  });

  it("uses Git Bash for Claude Code install when available on Windows", () => {
    const gitBashPath = "C:/Program Files/Git/bin/bash.exe";
    const options = resolvePackageInstallShellOptions(
      CLAUDE_CODE_PACKAGE_NAME,
      "shell",
      { gitBashPath },
      "win32",
    );
    expect(options?.gitBashPath).toBe(gitBashPath);
    expect(options?.forceWindowsCmd).toBeUndefined();
  });
});

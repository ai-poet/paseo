import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import log from "electron-log/main";
import { execCommand } from "@getpaseo/server";

export const REQUIRED_NODE_MAJOR = 22;
export const CODEX_PACKAGE_NAME = "@openai/codex";
export const CLAUDE_CODE_PACKAGE_NAME = "@anthropic-ai/claude-code";
const WINDOWS_GIT_WINGET_PACKAGE_ID = "Git.Git";
const WINDOWS_GIT_DIRECT_DOWNLOAD_URL =
  "https://github.com/git-for-windows/git/releases/latest/download/Git-64-bit.exe";

type RuntimeManagerId = "nvm" | "brew" | "shell";

export interface NodeRuntimeStatus {
  installed: boolean;
  version: string | null;
  major: number | null;
  npmVersion: string | null;
  satisfies: boolean;
  manager: RuntimeManagerId;
  error: string | null;
}

export interface ModelCliStatus {
  command: "codex" | "claude";
  packageName: string;
  installed: boolean;
  version: string | null;
  error: string | null;
}

export interface ModelCliRuntimeStatus {
  node: NodeRuntimeStatus;
  codex: ModelCliStatus;
  claude: ModelCliStatus;
}

export interface ModelCliInstallResult {
  status: ModelCliRuntimeStatus;
  output: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface ShellOptions {
  gitBashPath?: string | null;
  forceWindowsCmd?: boolean;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trimToNull(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseMajorVersion(version: string | null): number | null {
  const match = version?.match(/(\d+)(?:\.\d+){0,2}/);
  if (!match) {
    return null;
  }
  const major = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(major) ? major : null;
}

export function parseSemanticVersion(output: string | null): string | null {
  const trimmed = trimToNull(output);
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/\d+\.\d+\.\d+(?:[-+._0-9A-Za-z]*)?/);
  return match?.[0] ?? trimmed;
}

function getNvmScriptPath(): string {
  return path.join(homedir(), ".nvm", "nvm.sh");
}

function buildShellCommand(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return { command: "cmd.exe", args: ["/c", command] };
  }
  return { command: "/bin/bash", args: ["-lc", command] };
}

function buildGitBashCommand(
  command: string,
  gitBashPath: string,
): { command: string; args: string[] } {
  return { command: gitBashPath, args: ["-lc", command] };
}

async function runShell(command: string, options?: ShellOptions): Promise<CommandResult> {
  const shell =
    process.platform === "win32" && !options?.forceWindowsCmd && options?.gitBashPath
      ? buildGitBashCommand(command, options.gitBashPath)
      : buildShellCommand(command);
  return await execCommand(shell.command, shell.args, {
    env: process.env,
    timeout: 10 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function tryRunShell(command: string, options?: ShellOptions): Promise<CommandResult | null> {
  try {
    return await runShell(command, options);
  } catch {
    return null;
  }
}

async function commandExists(command: string): Promise<boolean> {
  const probe =
    process.platform === "win32" ? `where ${command}` : `command -v ${command} >/dev/null 2>&1`;
  return (await tryRunShell(probe)) !== null;
}

async function resolveRuntimeManager(): Promise<RuntimeManagerId> {
  if (process.platform !== "win32" && existsSync(getNvmScriptPath())) {
    return "nvm";
  }
  if (process.platform === "darwin" && (await commandExists("brew"))) {
    return "brew";
  }
  return "shell";
}

async function resolveWindowsGitBashPath(): Promise<string | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const whereResult = await tryRunShell("where bash");
  const detected =
    whereResult?.stdout
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find((entry) => entry.toLowerCase().endsWith("bash.exe")) ?? null;
  if (detected) {
    return detected;
  }

  const fallbackCandidates = [
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "bin", "bash.exe"),
    path.join(process.env.ProgramFiles ?? "C:\\Program Files", "Git", "usr", "bin", "bash.exe"),
    path.join(process.env.USERPROFILE ?? "", "scoop", "apps", "git", "current", "bin", "bash.exe"),
    path.join(
      process.env.USERPROFILE ?? "",
      "scoop",
      "apps",
      "git",
      "current",
      "usr",
      "bin",
      "bash.exe",
    ),
    path.join(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "Git",
      "bin",
      "bash.exe",
    ),
  ];

  return fallbackCandidates.find((entry) => existsSync(entry)) ?? null;
}

export function wrapWithRuntimeManager(command: string, manager: RuntimeManagerId): string {
  if (manager === "nvm") {
    const nvmScriptPath = getNvmScriptPath();
    return `export NVM_DIR="${path.dirname(nvmScriptPath)}"; . "${nvmScriptPath}"; nvm use default >/dev/null 2>&1 || true; if [ -n "$NVM_BIN" ]; then export PATH="$NVM_BIN:$PATH"; fi; ${command}`;
  }
  if (manager === "brew") {
    return `BREW_NODE_PREFIX="$(brew --prefix node@22 2>/dev/null || true)"; if [ -n "$BREW_NODE_PREFIX" ]; then export PATH="$BREW_NODE_PREFIX/bin:$PATH"; fi; ${command}`;
  }
  return command;
}

export function wrapWithNode22Runtime(command: string, manager: RuntimeManagerId): string {
  if (manager === "nvm") {
    const nvmScriptPath = getNvmScriptPath();
    return `export NVM_DIR="${path.dirname(nvmScriptPath)}"; . "${nvmScriptPath}"; nvm install ${REQUIRED_NODE_MAJOR}; nvm alias default ${REQUIRED_NODE_MAJOR}; nvm use ${REQUIRED_NODE_MAJOR} >/dev/null; if [ -n "$NVM_BIN" ]; then export PATH="$NVM_BIN:$PATH"; fi; ${command}`;
  }
  if (manager === "brew") {
    return `brew install node@${REQUIRED_NODE_MAJOR}; BREW_NODE_PREFIX="$(brew --prefix node@${REQUIRED_NODE_MAJOR})"; export PATH="$BREW_NODE_PREFIX/bin:$PATH"; ${command}`;
  }
  return command;
}

export function buildWindowsGitBashInstallCommand(): string {
  return `winget install --id ${WINDOWS_GIT_WINGET_PACKAGE_ID} -e --accept-package-agreements --accept-source-agreements`;
}

export function buildWindowsGitBashChocolateyInstallCommand(): string {
  return "choco install git -y --no-progress";
}

export function buildWindowsGitBashScoopInstallCommand(): string {
  return "scoop install git";
}

export function buildWindowsGitBashDirectInstallCommand(): string {
  return `powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $installerUrl='${WINDOWS_GIT_DIRECT_DOWNLOAD_URL}'; $installerPath=Join-Path $env:TEMP ('paseo-git-installer-' + [Guid]::NewGuid().ToString('N') + '.exe'); Invoke-WebRequest -Uri $installerUrl -OutFile $installerPath -UseBasicParsing; Start-Process -FilePath $installerPath -ArgumentList '/VERYSILENT','/NORESTART','/SP-','/NOCANCEL' -Wait; Remove-Item -Path $installerPath -Force -ErrorAction SilentlyContinue;"`;
}

async function readNodeStatus(
  manager: RuntimeManagerId,
  options?: ShellOptions,
): Promise<NodeRuntimeStatus> {
  if (process.platform === "win32" && manager === "shell") {
    const [nodeProbe, npmProbe] = await Promise.all([
      tryRunShell("node -v", { ...options, forceWindowsCmd: true }),
      tryRunShell("npm -v", { ...options, forceWindowsCmd: true }),
    ]);
    const nodeVersion = parseSemanticVersion(nodeProbe?.stdout ?? nodeProbe?.stderr ?? null);
    const npmVersion = parseSemanticVersion(npmProbe?.stdout ?? npmProbe?.stderr ?? null);
    const major = parseMajorVersion(nodeVersion);

    return {
      installed: Boolean(nodeVersion),
      version: nodeVersion,
      major,
      npmVersion,
      satisfies: major !== null && major >= REQUIRED_NODE_MAJOR,
      manager,
      error: nodeVersion
        ? null
        : (trimToNull(nodeProbe?.stderr) ??
          trimToNull(npmProbe?.stderr) ??
          "Node.js was not found."),
    };
  }

  try {
    const result = await runShell(
      wrapWithRuntimeManager(
        'printf "NODE=%s\\n" "$(node -v 2>/dev/null)"; printf "NPM=%s\\n" "$(npm -v 2>/dev/null)"',
        manager,
      ),
      options,
    );
    const lines = result.stdout.split(/\r?\n/);
    const nodeVersion = parseSemanticVersion(
      lines.find((line) => line.startsWith("NODE="))?.slice(5) ?? null,
    );
    const npmVersion = parseSemanticVersion(
      lines.find((line) => line.startsWith("NPM="))?.slice(4) ?? null,
    );
    const major = parseMajorVersion(nodeVersion);

    return {
      installed: Boolean(nodeVersion),
      version: nodeVersion,
      major,
      npmVersion,
      satisfies: major !== null && major >= REQUIRED_NODE_MAJOR,
      manager,
      error: nodeVersion ? null : (trimToNull(result.stderr) ?? "Node.js was not found."),
    };
  } catch (error) {
    return {
      installed: false,
      version: null,
      major: null,
      npmVersion: null,
      satisfies: false,
      manager,
      error: getErrorMessage(error),
    };
  }
}

async function readCliStatus(
  command: "codex" | "claude",
  packageName: string,
  manager: RuntimeManagerId,
  options?: ShellOptions,
): Promise<ModelCliStatus> {
  if (process.platform === "win32" && command === "claude" && !options?.gitBashPath) {
    return {
      command,
      packageName,
      installed: false,
      version: null,
      error: "Git Bash is required on Windows before Claude Code can run normally.",
    };
  }

  try {
    const commandOptions =
      process.platform === "win32" && manager === "shell" && command === "codex"
        ? { ...options, forceWindowsCmd: true }
        : options;
    const result = await runShell(
      wrapWithRuntimeManager(`${command} --version`, manager),
      commandOptions,
    );
    const version = parseSemanticVersion(result.stdout) ?? parseSemanticVersion(result.stderr);
    return {
      command,
      packageName,
      installed: Boolean(version),
      version,
      error: version ? null : (trimToNull(result.stderr) ?? `${command} did not report a version.`),
    };
  } catch (error) {
    return {
      command,
      packageName,
      installed: false,
      version: null,
      error: getErrorMessage(error),
    };
  }
}

export async function getModelCliRuntimeStatus(): Promise<ModelCliRuntimeStatus> {
  const manager = await resolveRuntimeManager();
  const gitBashPath = await resolveWindowsGitBashPath();
  const [node, codex, claude] = await Promise.all([
    readNodeStatus(manager, { gitBashPath }),
    readCliStatus("codex", CODEX_PACKAGE_NAME, manager, { gitBashPath }),
    readCliStatus("claude", CLAUDE_CODE_PACKAGE_NAME, manager, { gitBashPath }),
  ]);

  return { node, codex, claude };
}

async function installNode22IntoManager(
  manager: RuntimeManagerId,
  options?: ShellOptions,
): Promise<string> {
  if (manager === "nvm") {
    const result = await runShell(wrapWithNode22Runtime("node -v && npm -v", manager), options);
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  }
  if (manager === "brew") {
    const result = await runShell(wrapWithNode22Runtime("node -v && npm -v", manager), options);
    return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  }
  if (manager === "shell" && process.platform === "win32") {
    if (!(await commandExists("winget"))) {
      throw new Error(
        "Automatic Node.js 22 installation on Windows requires WinGet. Install WinGet first, then retry.",
      );
    }

    const installResult = await runShell(
      "winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements",
      { ...options, forceWindowsCmd: true },
    );

    const status = await readNodeStatus(manager, { ...options, forceWindowsCmd: true });
    if (!status.satisfies) {
      throw new Error(
        `Node.js installation finished but the detected runtime is ${status.version ?? "unknown"}. Please ensure Node.js ${REQUIRED_NODE_MAJOR}+ is available in PATH.`,
      );
    }

    const verifyResult = await runShell("node -v && npm -v", { ...options, forceWindowsCmd: true });
    return [installResult.stdout, installResult.stderr, verifyResult.stdout, verifyResult.stderr]
      .filter(Boolean)
      .join("\n")
      .trim();
  }

  throw new Error(
    "Automatic Node.js 22 installation currently requires nvm or Homebrew in this environment.",
  );
}

async function ensureWindowsGitBash(options?: ShellOptions): Promise<{
  gitBashPath: string;
  output: string;
}> {
  if (process.platform !== "win32") {
    throw new Error("Git Bash auto-install is only supported on Windows.");
  }

  const detected = options?.gitBashPath ?? (await resolveWindowsGitBashPath());
  if (detected) {
    return { gitBashPath: detected, output: "" };
  }

  const attempts: Array<{
    name: string;
    command: string;
  }> = [];

  if (await commandExists("winget")) {
    attempts.push({ name: "winget", command: buildWindowsGitBashInstallCommand() });
  }
  if (await commandExists("choco")) {
    attempts.push({ name: "choco", command: buildWindowsGitBashChocolateyInstallCommand() });
  }
  if (await commandExists("scoop")) {
    attempts.push({ name: "scoop", command: buildWindowsGitBashScoopInstallCommand() });
  }
  if (await commandExists("powershell")) {
    attempts.push({
      name: "powershell-direct",
      command: buildWindowsGitBashDirectInstallCommand(),
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      "No supported Windows installer was found for Git Bash. Install WinGet, Chocolatey, or Scoop; or install Git for Windows manually.",
    );
  }

  const outputs: string[] = [];
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const result = await runShell(attempt.command, {
        ...options,
        forceWindowsCmd: true,
      });
      const combined = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
      if (combined) {
        outputs.push(`[${attempt.name}]\n${combined}`);
      } else {
        outputs.push(`[${attempt.name}] installer command completed.`);
      }
    } catch (error) {
      errors.push(`[${attempt.name}] ${getErrorMessage(error)}`);
      continue;
    }

    const installedPath = await resolveWindowsGitBashPath();
    if (installedPath) {
      return {
        gitBashPath: installedPath,
        output: outputs.join("\n\n").trim(),
      };
    }
  }

  throw new Error(
    [
      "Git Bash installation commands completed but bash.exe was not detected.",
      errors.length > 0 ? `attempt errors: ${errors.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export async function installNode22Runtime(): Promise<ModelCliInstallResult> {
  const manager = await resolveRuntimeManager();
  const gitBashPath = await resolveWindowsGitBashPath();
  const status = await readNodeStatus(manager, { gitBashPath });
  let output = "";

  if (!status.satisfies) {
    output = await installNode22IntoManager(manager, { gitBashPath });
  }

  return {
    status: await getModelCliRuntimeStatus(),
    output,
  };
}

export function resolvePackageInstallShellOptions(
  packageName: string,
  manager: RuntimeManagerId,
  options?: ShellOptions,
  platform: NodeJS.Platform = process.platform,
): ShellOptions | undefined {
  if (platform !== "win32" || manager !== "shell") {
    return options;
  }
  if (packageName === CLAUDE_CODE_PACKAGE_NAME && options?.gitBashPath) {
    return options;
  }
  return { ...options, forceWindowsCmd: true };
}

async function installPackageIntoRuntime(
  packageName: string,
  manager: RuntimeManagerId,
  options?: ShellOptions,
): Promise<string> {
  const runtimeOptions = resolvePackageInstallShellOptions(packageName, manager, options);
  const result = await runShell(
    wrapWithNode22Runtime(`npm install -g ${packageName}@latest`, manager),
    runtimeOptions,
  );
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

export async function installCodexCli(): Promise<ModelCliInstallResult> {
  const manager = await resolveRuntimeManager();
  const gitBashPath = await resolveWindowsGitBashPath();
  const nodeStatus = await readNodeStatus(manager, { gitBashPath });
  const outputs: string[] = [];

  if (!nodeStatus.satisfies) {
    outputs.push(await installNode22IntoManager(manager, { gitBashPath }));
  }
  outputs.push(await installPackageIntoRuntime(CODEX_PACKAGE_NAME, manager, { gitBashPath }));

  return {
    status: await getModelCliRuntimeStatus(),
    output: outputs.filter(Boolean).join("\n").trim(),
  };
}

export async function installClaudeCodeCli(): Promise<ModelCliInstallResult> {
  const manager = await resolveRuntimeManager();
  const outputs: string[] = [];
  let gitBashPath = await resolveWindowsGitBashPath();
  if (process.platform === "win32" && !gitBashPath) {
    const gitBashInstall = await ensureWindowsGitBash();
    gitBashPath = gitBashInstall.gitBashPath;
    if (gitBashInstall.output) {
      outputs.push(gitBashInstall.output);
    }
  }
  const nodeStatus = await readNodeStatus(manager, { gitBashPath });

  if (!nodeStatus.satisfies) {
    outputs.push(await installNode22IntoManager(manager, { gitBashPath }));
  }
  outputs.push(await installPackageIntoRuntime(CLAUDE_CODE_PACKAGE_NAME, manager, { gitBashPath }));

  return {
    status: await getModelCliRuntimeStatus(),
    output: outputs.filter(Boolean).join("\n").trim(),
  };
}

export async function installAllModelClis(): Promise<ModelCliInstallResult> {
  const manager = await resolveRuntimeManager();
  const outputs: string[] = [];
  let gitBashPath = await resolveWindowsGitBashPath();
  if (process.platform === "win32" && !gitBashPath) {
    const gitBashInstall = await ensureWindowsGitBash();
    gitBashPath = gitBashInstall.gitBashPath;
    if (gitBashInstall.output) {
      outputs.push(gitBashInstall.output);
    }
  }
  const nodeStatus = await readNodeStatus(manager, { gitBashPath });

  if (!nodeStatus.satisfies) {
    outputs.push(await installNode22IntoManager(manager, { gitBashPath }));
  }
  outputs.push(await installPackageIntoRuntime(CODEX_PACKAGE_NAME, manager, { gitBashPath }));
  outputs.push(await installPackageIntoRuntime(CLAUDE_CODE_PACKAGE_NAME, manager, { gitBashPath }));

  const status = await getModelCliRuntimeStatus();
  log.info("[model-cli-manager] installed runtime stack", {
    nodeVersion: status.node.version,
    codexVersion: status.codex.version,
    claudeVersion: status.claude.version,
  });

  return {
    status,
    output: outputs.filter(Boolean).join("\n").trim(),
  };
}

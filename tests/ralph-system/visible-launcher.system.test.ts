import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = fileURLToPath(
  new URL("../../scripts/ralph/afk-ralph-v2.ps1", import.meta.url),
);

describe.runIf(process.platform === "win32")("Ralph v2 visible launcher", () => {
  it("is valid PowerShell with bounded production controls", () => {
    const escaped = SCRIPT_PATH.replaceAll("'", "''");
    const result = spawnSync(
      "powershell.exe",
      [
        "-NoLogo", "-NoProfile", "-NonInteractive", "-Command",
        `$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1};$ast.ParamBlock.Parameters.Name.VariablePath.UserPath|ConvertTo-Json -Compress`,
      ],
      { encoding: "utf8", windowsHide: true },
    );
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toEqual(expect.arrayContaining([
      "Iterations",
      "Mode",
      "DeadlineHours",
      "PollSeconds",
      "ImplementationTimeoutSeconds",
      "VerificationTimeoutSeconds",
      "MaximumControllerErrors",
      "RuntimePath",
      "GitHubRepository",
    ]));
  });
});

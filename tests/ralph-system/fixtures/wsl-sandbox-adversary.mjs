import { spawnSync } from "node:child_process";
import fs from "node:fs";

const [configurationJson] = process.argv.slice(2);
if (!configurationJson) {
  throw new Error("usage: wsl-sandbox-adversary.mjs <configuration-json>");
}
const configuration = JSON.parse(configurationJson);

function readProbe(filePath) {
  try {
    const descriptor = fs.openSync(filePath, "r");
    fs.closeSync(descriptor);
    return { readable: true, errorCode: null };
  } catch (error) {
    return {
      readable: false,
      errorCode: error?.code ?? error?.name ?? "unknown",
    };
  }
}

function writeProbe(filePath) {
  try {
    fs.writeFileSync(filePath, "sandbox-write-probe\n", { flag: "wx" });
    return { writable: true, errorCode: null };
  } catch (error) {
    return {
      writable: false,
      errorCode: error?.code ?? error?.name ?? "unknown",
    };
  }
}

const windowsInterop = spawnSync(
  "/mnt/c/Windows/System32/cmd.exe",
  ["/d", "/c", "exit", "0"],
  { encoding: "utf8" },
);
const status = fs.readFileSync("/proc/self/status", "utf8");
const statusFields = Object.fromEntries(
  status
    .split("\n")
    .flatMap((line) => {
      const separator = line.indexOf(":");
      return separator < 0
        ? []
        : [[line.slice(0, separator), line.slice(separator + 1).trim()]];
    }),
);

process.stdout.write(
  `${JSON.stringify({
    identity: {
      uid: statusFields.Uid,
      gid: statusFields.Gid,
      groups: statusFields.Groups,
      capEffective: statusFields.CapEff,
      capBounding: statusFields.CapBnd,
      noNewPrivileges: statusFields.NoNewPrivs,
    },
    workspaceRead: readProbe(configuration.workspaceMaterialPath),
    workspaceWrite: writeProbe(configuration.workspaceOutputPath),
    dependencyRead: readProbe(configuration.dependencyMaterialPath),
    controllerRead: readProbe(configuration.controllerMaterialPath),
    linuxCredentialRead: readProbe(configuration.linuxCredentialPath),
    windowsCredentialRead: readProbe(configuration.windowsCredentialPath),
    windowsInterop: {
      status: windowsInterop.status,
      signal: windowsInterop.signal,
      errorCode: windowsInterop.error?.code ?? null,
    },
  })}\n`,
);

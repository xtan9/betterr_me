import childProcess from "node:child_process";
import dns from "node:dns";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import { pathToFileURL } from "node:url";
import workerThreads from "node:worker_threads";

const initialCwd = process.cwd();
const initialEnvironment = JSON.stringify(process.env);

function forbidden(operation) {
  return () => {
    throw new Error(`import performed forbidden operation: ${operation}`);
  };
}

function calledByModuleLoader() {
  return new Error().stack?.includes("node:internal/modules/esm/load") ?? false;
}

for (const operation of ["exec", "execFile", "fork", "spawn", "spawnSync"]) {
  childProcess[operation] = forbidden(`child_process.${operation}`);
}

const originalOpenSync = fs.openSync;
fs.openSync = (...args) => {
  if (calledByModuleLoader()) return originalOpenSync(...args);
  return forbidden("fs.openSync")();
};
const originalReadFileSync = fs.readFileSync;
fs.readFileSync = (...args) => {
  if (calledByModuleLoader()) return originalReadFileSync(...args);
  return forbidden("fs.readFileSync")();
};

for (const operation of [
  "appendFile",
  "appendFileSync",
  "createReadStream",
  "createWriteStream",
  "existsSync",
  "mkdir",
  "mkdirSync",
  "readFile",
  "readdir",
  "readdirSync",
  "rm",
  "rmSync",
  "stat",
  "statSync",
  "writeFile",
  "writeFileSync",
]) {
  fs[operation] = forbidden(`fs.${operation}`);
}

for (const operation of [
  "appendFile",
  "mkdir",
  "open",
  "readFile",
  "readdir",
  "rm",
  "stat",
  "writeFile",
]) {
  fs.promises[operation] = forbidden(`fs.promises.${operation}`);
}

for (const httpModule of [http, https]) {
  httpModule.get = forbidden("HTTP get");
  httpModule.request = forbidden("HTTP request");
}
for (const operation of ["connect", "createConnection"]) {
  net[operation] = forbidden(`net.${operation}`);
}
tls.connect = forbidden("tls.connect");
for (const operation of ["lookup", "resolve", "resolve4", "resolve6"]) {
  dns[operation] = forbidden(`dns.${operation}`);
}
workerThreads.Worker = class ForbiddenWorker {
  constructor() {
    throw new Error("import performed forbidden operation: worker_threads.Worker");
  }
};
process.chdir = forbidden("process.chdir");
globalThis.fetch = forbidden("fetch");
syncBuiltinESMExports();

for (const modulePath of process.argv.slice(2)) {
  await import(pathToFileURL(modulePath).href);
}

if (process.cwd() !== initialCwd) {
  throw new Error("import changed the current working directory");
}
if (JSON.stringify(process.env) !== initialEnvironment) {
  throw new Error("import changed the process environment");
}

process.stdout.write("imports are inert\n");

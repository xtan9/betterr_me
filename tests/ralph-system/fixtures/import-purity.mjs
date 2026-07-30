import childProcess from "node:child_process";
import dgram from "node:dgram";
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

function calledByModuleLoaderThroughNodeFs() {
  const frames = new Error().stack?.split("\n") ?? [];
  for (const frame of frames.slice(3)) {
    if (frame.includes("node:fs:")) continue;
    return frame.includes("node:internal/modules/esm/load");
  }
  return false;
}

for (const operation of [
  "exec",
  "execFile",
  "execFileSync",
  "execSync",
  "fork",
  "spawn",
  "spawnSync",
]) {
  childProcess[operation] = forbidden(`child_process.${operation}`);
}

for (const [operation, value] of Object.entries(fs)) {
  const descriptor = Object.getOwnPropertyDescriptor(fs, operation);
  if (typeof value === "function" && descriptor?.writable === true) {
    fs[operation] = (...args) => {
      if (calledByModuleLoaderThroughNodeFs()) {
        return Reflect.apply(value, fs, args);
      }
      return forbidden(`fs.${operation}`)();
    };
  }
}

for (const [operation, value] of Object.entries(fs.promises)) {
  const descriptor = Object.getOwnPropertyDescriptor(fs.promises, operation);
  if (typeof value === "function" && descriptor?.writable === true) {
    fs.promises[operation] = forbidden(`fs.promises.${operation}`);
  }
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
  dns.promises[operation] = forbidden(`dns.promises.${operation}`);
}
dgram.createSocket = forbidden("dgram.createSocket");
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

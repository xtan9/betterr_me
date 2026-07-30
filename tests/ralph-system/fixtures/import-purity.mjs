import childProcess from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { pathToFileURL } from "node:url";

function forbidden(operation) {
  return () => {
    throw new Error(`import performed forbidden operation: ${operation}`);
  };
}

for (const operation of ["exec", "execFile", "fork", "spawn", "spawnSync"]) {
  childProcess[operation] = forbidden(`child_process.${operation}`);
}
for (const operation of [
  "appendFileSync",
  "mkdirSync",
  "openSync",
  "readFileSync",
  "rmSync",
  "writeFileSync",
]) {
  fs[operation] = forbidden(`fs.${operation}`);
}
for (const httpModule of [http, https]) {
  httpModule.get = forbidden("HTTP get");
  httpModule.request = forbidden("HTTP request");
}
net.connect = forbidden("net.connect");
net.createConnection = forbidden("net.createConnection");
globalThis.fetch = forbidden("fetch");

for (const modulePath of process.argv.slice(2)) {
  await import(pathToFileURL(modulePath).href);
}

process.stdout.write("imports are inert\n");

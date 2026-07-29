import fs from "node:fs";
import { pathToFileURL } from "node:url";

const MARKER = "-- ralph-ci: true";
const FORBIDDEN_SQL = [
  ["server-side program execution", /\bcopy\b[\s\S]{0,160}\bprogram\b/i],
  ["server file access", /\bpg_(?:read|write|ls_dir|stat)_file\b/i],
  ["large-object file access", /\blo_(?:import|export)\b/i],
  ["server configuration change", /\balter\s+system\b/i],
  ["procedural language installation", /\bcreate\s+(?:or\s+replace\s+)?(?:procedural\s+)?language\b/i],
  ["server library load", /\bload\s+'[^']+'/i],
  ["session authorization change", /\bset\s+session\s+authorization\b/i],
  ["role administration", /\b(?:create|alter|drop)\s+role\b/i],
  ["procedural code", /\bdo\b/i],
  ["routine definition", /\b(?:create|alter)\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i],
  ["foreign server access", /\b(?:create\s+(?:server|user\s+mapping|foreign\s+table)|import\s+foreign\s+schema)\b/i],
];

function scanExecutableSql(sql) {
  let state = "code";
  let blockDepth = 0;
  let dollarTag = null;
  let escapeString = false;
  let executableSql = "";
  let unquotedBackslash = false;
  const appendHidden = (character) => {
    executableSql += character === "\n" ? "\n" : " ";
  };

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const next = sql[index + 1];
    if (state === "code") {
      if (character === "-" && next === "-") {
        appendHidden(character);
        appendHidden(next);
        index += 1;
        state = "line-comment";
      } else if (character === "/" && next === "*") {
        appendHidden(character);
        appendHidden(next);
        index += 1;
        blockDepth = 1;
        state = "block-comment";
      } else if (character === "'") {
        appendHidden(character);
        escapeString = /(?:^|[^A-Za-z0-9_])e$/i.test(sql.slice(0, index));
        state = "single-quote";
      } else if (character === '"') {
        appendHidden(character);
        state = "double-quote";
      } else if (character === "$") {
        const tag = sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
        if (tag) {
          for (const tagCharacter of tag) appendHidden(tagCharacter);
          index += tag.length - 1;
          dollarTag = tag;
          state = "dollar-quote";
        } else {
          executableSql += character;
        }
      } else {
        if (character === "\\") unquotedBackslash = true;
        executableSql += character;
      }
    } else if (state === "line-comment") {
      appendHidden(character);
      if (character === "\n") state = "code";
    } else if (state === "block-comment") {
      appendHidden(character);
      if (character === "/" && next === "*") {
        appendHidden(next);
        index += 1;
        blockDepth += 1;
      } else if (character === "*" && next === "/") {
        appendHidden(next);
        index += 1;
        blockDepth -= 1;
        if (blockDepth === 0) state = "code";
      }
    } else if (state === "single-quote") {
      appendHidden(character);
      if (escapeString && character === "\\" && next != null) {
        appendHidden(next);
        index += 1;
      } else if (character === "'" && next === "'") {
        appendHidden(next);
        index += 1;
      } else if (character === "'") {
        state = "code";
      }
    } else if (state === "double-quote") {
      appendHidden(character);
      if (character === '"' && next === '"') {
        appendHidden(next);
        index += 1;
      } else if (character === '"') {
        state = "code";
      }
    } else if (state === "dollar-quote") {
      if (sql.startsWith(dollarTag, index)) {
        for (const tagCharacter of dollarTag) appendHidden(tagCharacter);
        index += dollarTag.length - 1;
        dollarTag = null;
        state = "code";
      } else {
        appendHidden(character);
      }
    }
  }
  return { executableSql, unquotedBackslash };
}

export function ralphSqlFixtureViolations(sql) {
  const lines = String(sql).split(/\r?\n/);
  const violations = [];
  if (!lines.slice(0, 12).some((line) => line === MARKER)) {
    violations.push("missing exact opt-in marker in the first 12 lines");
  }
  const { executableSql, unquotedBackslash } = scanExecutableSql(String(sql));
  if (unquotedBackslash) violations.push("psql meta-command");
  for (const [label, pattern] of FORBIDDEN_SQL) {
    if (pattern.test(executableSql)) violations.push(label);
  }
  if (/\bdblink_connect(?:_u)?\b/i.test(String(sql))) {
    violations.push("direct dblink connection");
  }
  for (const match of executableSql.matchAll(
    /\bset\s+(?:local\s+)?role\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/gi,
  )) {
    if (!["authenticated", "anon"].includes(match[1].toLowerCase())) {
      violations.push("role escalation");
      break;
    }
  }
  return violations;
}

function main(args) {
  if (args.length !== 2 || args[0] !== "--validate") {
    console.error("usage: node scripts/ci/ralph-sql-policy.mjs --validate <fixture>");
    return 2;
  }
  const fixture = args[1];
  const violations = ralphSqlFixtureViolations(fs.readFileSync(fixture, "utf8"));
  if (violations.length === 0) return 0;
  for (const violation of violations) {
    console.error(`${fixture}: rejected Ralph SQL fixture: ${violation}`);
  }
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

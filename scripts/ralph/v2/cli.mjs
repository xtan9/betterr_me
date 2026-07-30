function parseRunArguments(args) {
  let mode = "PrOnly";
  let maxIssues = 1;
  let json = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--mode") {
      mode = args[index + 1];
      index += 1;
    } else if (argument === "--max-issues") {
      maxIssues = Number(args[index + 1]);
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else {
      throw new Error(`unknown Ralph argument: ${argument}`);
    }
  }
  return { mode, maxIssues, json };
}

function parseSimpleArguments(args) {
  if (args.length === 0) return { json: false };
  if (args.length === 1 && args[0] === "--json") return { json: true };
  throw new Error(`unknown Ralph argument: ${args[0]}`);
}

function printResult(result, json, stdout) {
  if (json) stdout(JSON.stringify(result));
  else stdout(`Ralph v2: ${result.issues.length} published issue(s)`);
}

export async function runCli(args, { runtime, stdout, stderr }) {
  try {
    const [command, ...commandArguments] = args;
    if (command === "run") {
      const options = parseRunArguments(commandArguments);
      const result = await runtime.run(options);
      printResult(result, options.json, stdout);
      return 0;
    }
    if (command === "status") {
      const options = parseSimpleArguments(commandArguments);
      const result = runtime.inspect();
      printResult(result, options.json, stdout);
      return 0;
    }
    if (command === "stop") {
      const options = parseSimpleArguments(commandArguments);
      const result = await runtime.requestStop();
      printResult(result, options.json, stdout);
      return 0;
    }
    throw new Error(`unknown Ralph command: ${command ?? "<missing>"}`);
  } catch (error) {
    stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

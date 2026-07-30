import path from "node:path";

export function assertPathWithin(
  root: string,
  candidate: string,
  purpose: string,
) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${purpose} escapes ${resolvedRoot}: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

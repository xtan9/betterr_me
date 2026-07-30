import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createExhaustiveReviewCoverage } from "./review-coverage.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function verificationPlanDigest(plan) {
  return sha256(canonicalJson(plan));
}

const DEFAULT_TESTS = Object.freeze([
  Object.freeze({
    id: "related",
    executable: process.execPath,
    args: Object.freeze([
      "node_modules/vitest/vitest.mjs",
      "related",
      "--run",
      "--maxWorkers=4",
    ]),
    includeChangedPaths: true,
  }),
  Object.freeze({
    id: "typescript",
    executable: process.execPath,
    args: Object.freeze([
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--pretty",
      "false",
    ]),
    includeChangedPaths: false,
  }),
  Object.freeze({
    id: "full-suite",
    executable: process.execPath,
    args: Object.freeze([
      "node_modules/vitest/vitest.mjs",
      "run",
      "--maxWorkers=4",
    ]),
    includeChangedPaths: false,
  }),
]);
const DEFAULT_REVIEW_AXES = Object.freeze([
  "standards",
  "spec",
  "security",
  "tests",
]);
const DEFAULT_REVIEW_POLICY_SHA256 = sha256(
  "ralph-v2:controller-review-policy:v1",
);
const DEFAULT_REVIEW_SKILL_SHA256 = sha256(
  "ralph-v2:code-review-skill-contract:v1",
);
const REVIEW_POLICY_MATERIALS = Object.freeze([
  "scripts/ralph/queue.mjs",
  "scripts/ralph/review-protocol.mjs",
  "scripts/ralph/review.schema.json",
]);
const REVIEW_SKILL_DIRECTORY = ".agents/skills/code-review";

export const DEFAULT_VERIFICATION_RECIPE = Object.freeze({
  schemaVersion: 1,
  tests: DEFAULT_TESTS,
  review: Object.freeze({
    kind: "exhaustive",
    axes: DEFAULT_REVIEW_AXES,
    policySha256: DEFAULT_REVIEW_POLICY_SHA256,
    skillSha256: DEFAULT_REVIEW_SKILL_SHA256,
  }),
});

function pathIsWithin(parentPath, candidatePath) {
  const relative = path.relative(parentPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function repositoryRoot(repositoryPath) {
  if (typeof repositoryPath !== "string" || !path.isAbsolute(repositoryPath)) {
    throw new Error("review materials repository path failed integrity validation");
  }
  let root;
  try {
    root = fs.realpathSync.native(repositoryPath);
  } catch (error) {
    throw new Error("review materials repository path failed integrity validation", {
      cause: error,
    });
  }
  if (!fs.statSync(root).isDirectory()) {
    throw new Error("review materials repository path failed integrity validation");
  }
  return root;
}

function assertNoSymbolicLink(root, relativePath) {
  let candidate = root;
  for (const segment of relativePath.split("/")) {
    if (!segment || segment === "." || segment === "..") {
      throw new Error("review material path failed integrity validation");
    }
    candidate = path.join(candidate, segment);
    const metadata = fs.lstatSync(candidate);
    if (metadata.isSymbolicLink()) {
      throw new Error("review material path cannot contain a symbolic link");
    }
  }
}

function readMaterial(root, relativePath) {
  const normalizedRelativePath = relativePath.replaceAll("\\", "/");
  const candidate = path.resolve(root, normalizedRelativePath);
  if (!pathIsWithin(root, candidate)) {
    throw new Error("review material path escaped its repository");
  }
  try {
    assertNoSymbolicLink(root, normalizedRelativePath);
    const resolved = fs.realpathSync.native(candidate);
    if (!pathIsWithin(root, resolved) || !fs.statSync(resolved).isFile()) {
      throw new Error("review material is not a repository file");
    }
    return {
      path: normalizedRelativePath,
      content: fs.readFileSync(resolved),
    };
  } catch (error) {
    throw new Error(
      `review material failed integrity validation: ${normalizedRelativePath}`,
      { cause: error },
    );
  }
}

function skillMaterialPaths(root) {
  const skillRoot = path.resolve(root, REVIEW_SKILL_DIRECTORY);
  if (!pathIsWithin(root, skillRoot)) {
    throw new Error("review skill path escaped its repository");
  }
  const paths = [];
  function visit(directory, relativeDirectory) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath = `${relativeDirectory}/${entry.name}`.replaceAll(
        "\\",
        "/",
      );
      const candidate = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error("review skill cannot contain a symbolic link");
      }
      if (entry.isDirectory()) {
        visit(candidate, relativePath);
      } else if (entry.isFile()) {
        paths.push(relativePath);
      } else {
        throw new Error("review skill contains an unsupported file type");
      }
    }
  }
  try {
    assertNoSymbolicLink(root, REVIEW_SKILL_DIRECTORY);
    visit(skillRoot, REVIEW_SKILL_DIRECTORY);
  } catch (error) {
    throw new Error("review skill failed integrity validation", { cause: error });
  }
  if (paths.length === 0) {
    throw new Error("review skill failed integrity validation");
  }
  return paths.sort();
}

function materialBundleSha256(root, relativePaths) {
  const manifest = relativePaths.map((relativePath) => {
    const material = readMaterial(root, relativePath);
    return {
      path: material.path,
      bytes: material.content.length,
      sha256: sha256(material.content),
    };
  });
  return sha256(
    canonicalJson({
      schemaVersion: 1,
      kind: "ralph-v2-review-material-bundle",
      files: manifest,
    }),
  );
}

export function createRepositoryVerificationRecipe({ repositoryPath }) {
  const root = repositoryRoot(repositoryPath);
  return {
    schemaVersion: 1,
    tests: DEFAULT_VERIFICATION_RECIPE.tests.map((test) => ({
      id: test.id,
      executable: test.executable,
      args: [...test.args],
      includeChangedPaths: test.includeChangedPaths,
    })),
    review: {
      kind: "exhaustive",
      axes: [...DEFAULT_VERIFICATION_RECIPE.review.axes],
      policySha256: materialBundleSha256(root, REVIEW_POLICY_MATERIALS),
      skillSha256: materialBundleSha256(root, skillMaterialPaths(root)),
    },
  };
}

export function assertRepositoryVerificationRecipe({ repositoryPath, recipe }) {
  validateVerificationRecipe(recipe);
  const observed = createRepositoryVerificationRecipe({ repositoryPath });
  if (
    recipe.review.policySha256 !== observed.review.policySha256 ||
    recipe.review.skillSha256 !== observed.review.skillSha256
  ) {
    throw new Error("review materials changed after planning");
  }
  return recipe;
}

function nonblank(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function exactUniqueStrings(values) {
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every(nonblank) &&
    new Set(values).size === values.length
  );
}

export function validateVerificationRecipe(recipe) {
  if (
    !recipe ||
    recipe.schemaVersion !== 1 ||
    !Array.isArray(recipe.tests) ||
    recipe.tests.length === 0 ||
    !recipe.tests.every(
      (test) =>
        test &&
        nonblank(test.id) &&
        nonblank(test.executable) &&
        path.isAbsolute(test.executable) &&
        Array.isArray(test.args) &&
        test.args.every((argument) => typeof argument === "string") &&
        typeof test.includeChangedPaths === "boolean" &&
        Object.keys(test).length === 4,
    ) ||
    new Set(recipe.tests.map((test) => test.id)).size !== recipe.tests.length ||
    recipe.review?.kind !== "exhaustive" ||
    !exactUniqueStrings(recipe.review.axes) ||
    !/^[0-9a-f]{64}$/i.test(recipe.review.policySha256) ||
    !/^[0-9a-f]{64}$/i.test(recipe.review.skillSha256)
  ) {
    throw new Error("verification recipe failed integrity validation");
  }
  return recipe;
}

export function createRequirementsSnapshot(issue) {
  if (
    !issue ||
    !Number.isSafeInteger(issue.number) ||
    issue.number <= 0 ||
    typeof issue.title !== "string" ||
    typeof issue.body !== "string" ||
    (issue.trustedWorkerPolicy !== undefined &&
      issue.trustedWorkerPolicy !== null &&
      (typeof issue.trustedWorkerPolicy !== "object" ||
        Array.isArray(issue.trustedWorkerPolicy)))
  ) {
    throw new Error("verification requirements failed integrity validation");
  }
  const blockers = issue.blockers ?? [];
  const acceptanceCriteria =
    issue.acceptanceCriteria ?? [issue.body.trim() || issue.title.trim()];
  if (
    typeof (issue.url ?? "") !== "string" ||
    !Array.isArray(blockers) ||
    blockers.some(
      (blocker) => !Number.isSafeInteger(blocker) || blocker <= 0,
    ) ||
    new Set(blockers).size !== blockers.length ||
    typeof (issue.whatToBuild ?? issue.title) !== "string" ||
    typeof (issue.testSeam ?? issue.body) !== "string" ||
    !Array.isArray(acceptanceCriteria) ||
    acceptanceCriteria.length === 0 ||
    !acceptanceCriteria.every(nonblank) ||
    new Set(acceptanceCriteria).size !== acceptanceCriteria.length
  ) {
    throw new Error("verification requirements failed integrity validation");
  }
  return canonicalValue({
    schemaVersion: 2,
    issueNumber: issue.number,
    title: issue.title,
    body: issue.body,
    url: issue.url ?? "",
    blockers,
    whatToBuild: issue.whatToBuild ?? issue.title,
    testSeam: issue.testSeam ?? issue.body,
    acceptanceCriteria,
    trustedWorkerPolicy: issue.trustedWorkerPolicy ?? null,
  });
}

export function requirementsSnapshotSha256(requirements) {
  return sha256(canonicalJson(validateRequirements(requirements)));
}

function validateRequirements(requirements) {
  const commonIsValid =
    requirements &&
    Number.isSafeInteger(requirements.issueNumber) &&
    requirements.issueNumber > 0 &&
    typeof requirements.title === "string" &&
    typeof requirements.body === "string" &&
    (requirements.trustedWorkerPolicy === null ||
      (typeof requirements.trustedWorkerPolicy === "object" &&
        !Array.isArray(requirements.trustedWorkerPolicy)));
  const versionOneIsValid =
    requirements?.schemaVersion === 1 &&
    Object.keys(requirements).sort().join(",") ===
      "body,issueNumber,schemaVersion,title,trustedWorkerPolicy";
  const versionTwoIsValid =
    requirements?.schemaVersion === 2 &&
    Object.keys(requirements).sort().join(",") ===
      "acceptanceCriteria,blockers,body,issueNumber,schemaVersion,testSeam,title,trustedWorkerPolicy,url,whatToBuild" &&
    typeof requirements.url === "string" &&
    Array.isArray(requirements.blockers) &&
    requirements.blockers.every(
      (blocker) => Number.isSafeInteger(blocker) && blocker > 0,
    ) &&
    new Set(requirements.blockers).size === requirements.blockers.length &&
    nonblank(requirements.whatToBuild) &&
    nonblank(requirements.testSeam) &&
    exactUniqueStrings(requirements.acceptanceCriteria);
  if (!commonIsValid || (!versionOneIsValid && !versionTwoIsValid)) {
    throw new Error("verification requirements failed integrity validation");
  }
  return canonicalValue(requirements);
}

export function createApprovedReviewIssue(requirements) {
  const trusted = validateRequirements(requirements);
  if (trusted.schemaVersion === 1) {
    return {
      issueNumber: trusted.issueNumber,
      title: trusted.title,
      url: "",
      blockers: [],
      whatToBuild: trusted.title,
      testSeam: trusted.body || trusted.title,
      acceptanceCriteria: [trusted.body || trusted.title],
    };
  }
  return {
    issueNumber: trusted.issueNumber,
    title: trusted.title,
    url: trusted.url,
    blockers: [...trusted.blockers],
    whatToBuild: trusted.whatToBuild,
    testSeam: trusted.testSeam,
    acceptanceCriteria: [...trusted.acceptanceCriteria],
  };
}

export function createVerificationPlan({
  sessionId,
  candidateTreeSha,
  changedPaths,
  requirements,
  recipe = DEFAULT_VERIFICATION_RECIPE,
}) {
  validateVerificationRecipe(recipe);
  const trustedRequirements = validateRequirements(requirements);
  if (
    !nonblank(sessionId) ||
    typeof candidateTreeSha !== "string" ||
    !/^[0-9a-f]{40}$/i.test(candidateTreeSha) ||
    !Array.isArray(changedPaths) ||
    changedPaths.length === 0 ||
    !changedPaths.every(nonblank) ||
    new Set(changedPaths).size !== changedPaths.length
  ) {
    throw new Error("verification plan input failed integrity validation");
  }

  const sortedChangedPaths = [...changedPaths].sort();
  const plan = {
    schemaVersion: 1,
    sessionId,
    candidateTreeSha,
    requirementsSha256: requirementsSnapshotSha256(trustedRequirements),
    tests: recipe.tests.map(
      ({ id, executable, args, includeChangedPaths }) => {
        const plannedArgs = [
          ...args,
          ...(includeChangedPaths ? sortedChangedPaths : []),
        ];
        return {
          id,
          executable,
          args: plannedArgs,
          command: [executable, ...plannedArgs]
            .map((token) => JSON.stringify(token))
            .join(" "),
        };
      },
    ),
    review: {
      kind: "exhaustive",
      sessionId: `${sessionId}:review`,
      axes: [...recipe.review.axes],
      subjects: sortedChangedPaths,
      coverage: createExhaustiveReviewCoverage(
        createApprovedReviewIssue(trustedRequirements),
        sortedChangedPaths,
      ),
      policySha256: recipe.review.policySha256,
      skillSha256: recipe.review.skillSha256,
    },
  };
  return { plan, sha256: verificationPlanDigest(plan) };
}

export function isNonblankEvidenceList(value) {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(nonblank)
  );
}

export function isNonblank(value) {
  return nonblank(value);
}

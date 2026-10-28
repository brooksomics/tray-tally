import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const script = join(import.meta.dirname, "../scripts/push-scan.sh");
const word = "zebracorn"; // dummy term; real ones live only in .git/info
const accented = "zébracorn";
const denylist = `other\n  ${word}  \n${accented}\n`;
const awsLike = "AKIA" + "QYLPMN5HHHFPZAM2"; // split so this file stays clean

// Hooks export GIT_*/PRE_COMMIT_* vars; drop them so temp repos stay isolated.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) => !/^(GIT_|PRE_COMMIT_)/.test(k)),
);

function git(dir: string, ...args: string[]): string {
  const cfg = [
    "user.name=t",
    "user.email=t@example.com",
    "commit.gpgsign=false",
  ];
  const opts = cfg.concat("tag.gpgsign=false").flatMap((c) => ["-c", c]);
  return execFileSync("git", [...opts, ...args], {
    cwd: dir,
    env,
    encoding: "utf8",
  });
}

function repo(denylist: string | null): string {
  const dir = mkdtempSync(join(tmpdir(), "push-scan-"));
  git(dir, "init", "-q");
  if (denylist !== null)
    writeFileSync(join(dir, ".git/info/privacy-denylist"), denylist);
  return dir;
}

type Files = string | Record<string, string>;

function commit(dir: string, files: Files, message = "update"): void {
  const entries = typeof files === "string" ? { "notes.txt": files } : files;
  for (const [name, text] of Object.entries(entries))
    writeFileSync(join(dir, name), text);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--allow-empty", "-m", message);
}

const scan = (dir: string) =>
  spawnSync(script, { cwd: dir, env, encoding: "utf8" });

test("fails closed when the denylist is missing, blank or all comments", () => {
  for (const denylist of [null, " \n\n", "# example\n  # Name\n"]) {
    const dir = repo(denylist);
    commit(dir, "hello");
    const r = scan(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /privacy-denylist/);
  }
});

test("passes a clean history", () => {
  const dir = repo(`${word}\n`);
  commit(dir, "hello");
  assert.equal(scan(dir).status, 0);
});

// Each leak is one commit; the binary/-diff ones are hidden from plain `git log -p`.
const leaks: Record<string, string>[] = [
  { "notes.txt": `hi ${word.toUpperCase()}` },
  { ".gitattributes": "notes.txt -diff\n", "notes.txt": word },
  { "a.bin": `\0${word}` },
  { [`${accented}.txt`]: "hi" },
];

test("blocks a denylisted term in any file, even binary or -diff", () => {
  for (const files of leaks) {
    const dir = repo(denylist);
    commit(dir, files);
    assert.equal(scan(dir).status, 1, Object.keys(files).join());
  }
});

test("blocks a denylisted term in a side-branch commit or a tag message", () => {
  const dir = repo(denylist);
  commit(dir, "clean");
  git(dir, "checkout", "-q", "-b", "side");
  commit(dir, "x", `about ${word}`);
  git(dir, "checkout", "-q", "-");
  assert.equal(scan(dir).status, 1, "side branch");
  git(dir, "branch", "-q", "-D", "side");
  assert.equal(scan(dir).status, 0, "clean once the branch is gone");
  git(dir, "tag", "-a", "v1", "-m", `release for ${word}`);
  assert.equal(scan(dir).status, 1, "tag message");
});

test("blocks a secret even if deleted later or in a -diff file", () => {
  const key = `aws_access_key_id = ${awsLike}\n`;
  for (const files of [
    key,
    { ".gitattributes": "*.env -diff\n", "x.env": key },
  ]) {
    const dir = repo(denylist);
    commit(dir, files);
    commit(dir, "removed\n");
    assert.equal(scan(dir).status, 1, JSON.stringify(files));
  }
});

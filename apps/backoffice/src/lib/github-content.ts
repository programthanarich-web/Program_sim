import "server-only";
import { repoPathFor, SITE_CONTENT_FILE } from "@pt/shared/site-content";
import { githubContentEnv } from "@/lib/env";

export type GitHubContentErrorCode = "not_configured" | "conflict" | "unavailable" | "rejected";

/** ข้อความของ error ออกแบบให้แสดงให้ผู้ดูแลอ่านได้ และไม่มีค่า token */
export class GitHubContentError extends Error {
  readonly code: GitHubContentErrorCode;
  constructor(code: GitHubContentErrorCode, message: string) {
    super(message);
    this.name = "GitHubContentError";
    this.code = code;
  }
}

const API_BASE = "https://api.github.com";
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

interface GitHubConfig {
  token: string;
  repo: string;
  branch: string;
  prefix: string;
}

function readConfig(): GitHubConfig {
  const token = githubContentEnv.token;
  const repo = githubContentEnv.repo;
  if (!token || !repo || !REPO_PATTERN.test(repo)) {
    throw new GitHubContentError(
      "not_configured",
      "ยังไม่ได้ตั้งค่า GITHUB_CONTENT_TOKEN และ GITHUB_CONTENT_REPO (รูปแบบ owner/repo)",
    );
  }
  return { token, repo, branch: githubContentEnv.branch, prefix: githubContentEnv.prefix };
}

function requestHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "program-thanarich-backoffice",
  };
}

async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new GitHubContentError("unavailable", "เชื่อมต่อ GitHub ไม่ได้ กรุณาลองใหม่อีกครั้ง");
  }
}

function contentsUrl(config: GitHubConfig, repoPath: string): string {
  const encoded = repoPath.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/repos/${config.repo}/contents/${encoded}`;
}

export interface RepoTextFile {
  text: string;
  sha: string;
}

/** อ่านไฟล์เนื้อหาปัจจุบันจาก repo (คืน null ถ้ายังไม่มีไฟล์) */
export async function readSiteContentFile(): Promise<RepoTextFile | null> {
  const config = readConfig();
  const path = repoPathFor(config.prefix, SITE_CONTENT_FILE);
  if (!path.ok) throw new GitHubContentError("rejected", path.error);

  const response = await send(`${contentsUrl(config, path.value)}?ref=${encodeURIComponent(config.branch)}`, {
    method: "GET",
    headers: requestHeaders(config.token),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubContentError("unavailable", `อ่านไฟล์จาก GitHub ไม่สำเร็จ (${response.status})`);

  const body = (await response.json()) as { content?: string; sha?: string };
  if (typeof body.content !== "string" || typeof body.sha !== "string") {
    throw new GitHubContentError("unavailable", "รูปแบบข้อมูลจาก GitHub ไม่ถูกต้อง");
  }
  return { text: Buffer.from(body.content, "base64").toString("utf8"), sha: body.sha };
}

export interface WriteRepoFileInput {
  /** path ใน repo ที่ผ่าน repoPathFor หรือ repoImagePath แล้วเท่านั้น */
  repoPath: string;
  base64: string;
  message: string;
  /** sha ของเวอร์ชันที่กำลังแก้ ใช้กันการเขียนทับ (ไม่ใส่ถ้าสร้างไฟล์ใหม่) */
  sha?: string;
}

export async function writeRepoFile(input: WriteRepoFileInput): Promise<void> {
  const config = readConfig();
  const response = await send(contentsUrl(config, input.repoPath), {
    method: "PUT",
    headers: { ...requestHeaders(config.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: input.message,
      content: input.base64,
      branch: config.branch,
      ...(input.sha ? { sha: input.sha } : {}),
    }),
  });

  if (response.ok) return;
  if (response.status === 409) {
    throw new GitHubContentError("conflict", "มีการแก้ไขจากคนอื่นก่อนหน้า กรุณาโหลดหน้าใหม่แล้วแก้อีกครั้ง");
  }
  if (response.status === 422) {
    throw new GitHubContentError("rejected", "GitHub ไม่รับการบันทึกนี้ (ตรวจสิทธิ์ของ token และชื่อ branch)");
  }
  throw new GitHubContentError("unavailable", `บันทึกไป GitHub ไม่สำเร็จ (${response.status})`);
}

/** path ใน repo ของไฟล์ที่อยู่ภายใต้ prefix ของแอปหน้าบ้าน (ตรวจความปลอดภัยแล้ว) */
export function repoPathForConfig(relative: string): string {
  const config = readConfig();
  const path = repoPathFor(config.prefix, relative);
  if (!path.ok) throw new GitHubContentError("rejected", path.error);
  return path.value;
}

/** prefix ของแอปหน้าบ้านใน repo (ใช้กับ repoImagePath) */
export function storefrontPrefix(): string {
  return readConfig().prefix;
}

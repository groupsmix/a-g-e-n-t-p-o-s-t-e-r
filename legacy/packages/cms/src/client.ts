import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { lookup } from "node:dns/promises";
import { getCosmic } from "./cosmic-bucket.js";

export interface UploadResult {
  cdnUrl: string;
  objectId?: string;
  title?: string;
}

export interface AIVideoResult {
  url: string;
  imgixUrl: string;
  duration: number;
  mediaId: string;
}

function contentTypeForExt(ext: string): string {
  if (ext === "mp4") return "video/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "webp") return "image/webp";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^\w.-]+/g, "_");
}

// ---------------------------------------------------------------------------
// Audit #7: uploadToCosmicCDN accepts agent-provided URLs and file paths,
// which made it an SSRF / local-file-read primitive. Constraints applied:
//   - URLs: https only, public hosts only (DNS-checked), redirects re-checked,
//     30s timeout, 50MB size cap
//   - Paths: must resolve inside an allow-listed directory (os.tmpdir() by
//     default, plus CMS_UPLOAD_DIR if set)
//   - Both: media extension allow-list
// ---------------------------------------------------------------------------

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
const FETCH_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 3;
const ALLOWED_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "mp4",
  "mp3",
  "wav",
]);

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function assertAllowedExt(ext: string): string {
  const normalized = ext.toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(normalized)) {
    throw new Error(`Upload type not allowed: .${normalized}`);
  }
  return normalized;
}

function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fe80:") ||
      lower.startsWith("fc") ||
      lower.startsWith("fd") ||
      lower.startsWith("::ffff:")
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid asset URL");
  }
  if (url.protocol !== "https:") {
    throw new Error("Asset URLs must use https");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`Asset host not allowed: ${host}`);
  }
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) {
    throw new Error(`Asset host did not resolve: ${host}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`Asset host resolves to a private address: ${host}`);
    }
  }
  return url;
}

async function fetchPublicAsset(
  rawUrl: string,
): Promise<{ buffer: Buffer; ext: string }> {
  let url = await assertPublicHttpsUrl(rawUrl);

  let response: Response | null = null;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("Redirect without location header");
      // Re-validate every redirect target — a public host must not be able
      // to bounce us to an internal address.
      url = await assertPublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    response = res;
    break;
  }
  if (!response) throw new Error("Too many redirects fetching asset");
  if (!response.ok) {
    throw new Error(`Failed to fetch asset: ${response.status}`);
  }

  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Asset too large: ${declaredLength} bytes`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Asset too large: ${buffer.byteLength} bytes`);
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const ext =
    CONTENT_TYPE_TO_EXT[contentType] ??
    url.pathname.split(".").pop()?.toLowerCase() ??
    "jpg";
  return { buffer, ext: assertAllowedExt(ext) };
}

function allowedLocalRoots(): string[] {
  const roots = [os.tmpdir()];
  if (process.env.CMS_UPLOAD_DIR) {
    roots.push(path.resolve(process.env.CMS_UPLOAD_DIR));
  }
  return roots;
}

async function readAllowedLocalFile(
  rawPath: string,
): Promise<{ buffer: Buffer; ext: string }> {
  const resolved = path.resolve(rawPath);
  const roots = allowedLocalRoots();
  const inAllowedRoot = roots.some(
    (root) => resolved === root || resolved.startsWith(root + path.sep),
  );
  if (!inAllowedRoot) {
    throw new Error(
      "Local uploads are only allowed from the temp directory (or CMS_UPLOAD_DIR)",
    );
  }
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error("Upload source is not a regular file");
  if (stat.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Asset too large: ${stat.size} bytes`);
  }
  const ext = assertAllowedExt(
    path.extname(resolved).slice(1).toLowerCase() || "jpg",
  );
  return { buffer: await fs.readFile(resolved), ext };
}

/** Upload remote URL or local file path to Cosmic media library. */
export async function uploadToCosmicCDN(
  sourceUrlOrPath: string,
  options: { folder?: string; title?: string },
): Promise<UploadResult> {
  const cosmic = getCosmic();
  const isUrl = /^https?:\/\//i.test(sourceUrlOrPath);

  const { buffer, ext } = isUrl
    ? await fetchPublicAsset(sourceUrlOrPath)
    : await readAllowedLocalFile(sourceUrlOrPath);

  const filename = `${sanitizeFilename(options.title ?? String(Date.now()))}.${ext}`;

  const result = await cosmic.media.insertOne({
    media: {
      buffer,
      originalname: filename,
      type: contentTypeForExt(ext),
    },
    folder: options.folder,
  });

  const media = result?.media;
  const cdnUrl = media?.imgix_url ?? media?.url;
  if (!cdnUrl) {
    throw new Error("Cosmic upload succeeded but no CDN URL returned");
  }

  return {
    cdnUrl,
    objectId: media?.id,
    title: media?.name ?? media?.original_name,
  };
}

/** Generate AI video via Cosmic Veo and store in the media library. */
export async function generateAIVideo(params: {
  prompt: string;
  duration?: 4 | 6 | 8;
  resolution?: "720p" | "1080p";
  referenceImages?: string[];
  folder?: string;
}): Promise<AIVideoResult> {
  const cosmic = getCosmic();
  const result = await cosmic.ai.generateVideo({
    prompt: params.prompt,
    duration: params.duration ?? 8,
    resolution: params.resolution ?? "720p",
    reference_images: params.referenceImages,
    folder: params.folder ?? "ai-videos",
  });

  const duration =
    result.media.metadata?.duration ?? params.duration ?? 8;

  return {
    url: result.media.url,
    imgixUrl: result.media.imgix_url,
    duration,
    mediaId: result.media.id,
  };
}

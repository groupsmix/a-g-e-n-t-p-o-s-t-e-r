import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface RenderVideoParams {
  compositionId: string;
  props: Record<string, unknown>;
  outputPath?: string;
  codec?: "h264" | "h265" | "vp8" | "vp9";
  crf?: number;
}

function getRemotionEntryPoint(): string {
  const generatorsRoot = path.resolve(__dirname, "../..");
  return path.join(generatorsRoot, "src/video/remotion/index.tsx");
}

// Audit #48: bundling the Remotion project is by far the slowest part of a
// render and the entry point never changes at runtime, so the webpack bundle
// is built once per process and reused. Failures are not cached, so a broken
// bundle attempt is retried on the next render.
const bundleCache = new Map<string, Promise<string>>();

function getBundle(entryPoint: string): Promise<string> {
  let cached = bundleCache.get(entryPoint);
  if (!cached) {
    cached = bundle({
      entryPoint,
      webpackOverride: (config) => config,
    }).catch((err: unknown) => {
      bundleCache.delete(entryPoint);
      throw err;
    });
    bundleCache.set(entryPoint, cached);
  }
  return cached;
}

/**
 * Audit #47: create a per-run temp directory for video assets.
 * The caller must remove the directory in a `finally` block after upload.
 */
export async function createTempVideoDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), `posteragent-video-`));
}

/**
 * Audit #47: clean up a temp video directory. Call in `finally` after
 * the video file has been uploaded to the CDN.
 */
export async function cleanupTempVideoDir(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch {
    // Non-fatal: temp dirs will be cleaned up by the OS eventually.
  }
}

export interface RenderVideoResult {
  filePath: string;
  /** Per-run temp directory; null when caller supplied their own outputPath. */
  tempDir: string | null;
}

export async function renderVideo(params: RenderVideoParams): Promise<RenderVideoResult> {
  const entryPoint = getRemotionEntryPoint();

  const bundleLocation = await getBundle(entryPoint);

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: params.compositionId,
    inputProps: params.props,
  });

  // Audit #47: default to a per-run temp dir so cleanup is deterministic.
  let outputPath = params.outputPath;
  let tempDir: string | null = null;
  if (!outputPath) {
    tempDir = await createTempVideoDir();
    outputPath = path.join(tempDir, `posteragent_video_${Date.now()}.mp4`);
  }

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: params.codec ?? "h264",
    outputLocation: outputPath,
    inputProps: params.props,
    crf: params.crf ?? 18,
  });

  return { filePath: outputPath, tempDir };
}

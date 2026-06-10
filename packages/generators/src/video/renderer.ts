import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
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

export async function renderVideo(params: RenderVideoParams): Promise<string> {
  const entryPoint = getRemotionEntryPoint();

  const bundleLocation = await getBundle(entryPoint);

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: params.compositionId,
    inputProps: params.props,
  });

  const outputPath =
    params.outputPath ??
    path.join(os.tmpdir(), `posteragent_video_${Date.now()}.mp4`);

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: params.codec ?? "h264",
    outputLocation: outputPath,
    inputProps: params.props,
    crf: params.crf ?? 18,
  });

  return outputPath;
}

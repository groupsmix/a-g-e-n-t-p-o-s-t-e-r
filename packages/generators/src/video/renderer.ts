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

export async function renderVideo(params: RenderVideoParams): Promise<string> {
  const entryPoint = getRemotionEntryPoint();

  const bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });

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

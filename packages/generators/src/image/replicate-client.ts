import Replicate from "replicate";
import { getEnv } from "@repo/config";

export type ImageModel =
  | "flux-1.1-pro"
  | "sdxl"
  | "flux-dev"
  | "flux-schnell";

export interface ImageGenerationParams {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  model: ImageModel;
  numOutputs?: number;
  outputFormat?: "webp" | "jpg" | "png";
}

const modelMap: Record<ImageModel, `${string}/${string}` | string> = {
  "flux-1.1-pro": "black-forest-labs/flux-1.1-pro",
  "flux-dev": "black-forest-labs/flux-dev",
  "flux-schnell": "black-forest-labs/flux-schnell",
  sdxl: "stability-ai/sdxl:39ed52f2319f9609e4bc4d3fdb3f9af9ee87b0e5",
};

let replicateClient: Replicate | undefined;

function getReplicate(): Replicate {
  if (!replicateClient) {
    replicateClient = new Replicate({ auth: getEnv().REPLICATE_API_TOKEN });
  }
  return replicateClient;
}

export async function generateImage(
  params: ImageGenerationParams,
): Promise<string[]> {
  const input: Record<string, unknown> = {
    prompt: params.prompt,
    width: params.width,
    height: params.height,
    num_outputs: params.numOutputs ?? 1,
    output_format: params.outputFormat ?? "webp",
  };

  if (params.model === "sdxl" && params.negativePrompt) {
    input.negative_prompt = params.negativePrompt;
  }

  const output = await getReplicate().run(
    modelMap[params.model] as `${string}/${string}` | `${string}/${string}:${string}`,
    { input },
  );

  if (Array.isArray(output)) {
    return output.map((item) => String(item));
  }
  return [String(output)];
}

import { ElevenLabsClient } from "elevenlabs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getEnv } from "@repo/config";

let client: ElevenLabsClient | undefined;

function getElevenLabs(): ElevenLabsClient {
  if (!client) {
    client = new ElevenLabsClient({ apiKey: getEnv().ELEVENLABS_API_KEY });
  }
  return client;
}

export async function generateVoiceover(
  text: string,
  outputPath?: string,
): Promise<string> {
  const env = getEnv();
  const audio = await getElevenLabs().textToSpeech.convert(env.ELEVENLABS_VOICE_ID, {
    text,
    model_id: "eleven_turbo_v2_5",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0,
      use_speaker_boost: true,
    },
  });

  const filePath =
    outputPath ?? path.join(os.tmpdir(), `voiceover_${Date.now()}.mp3`);
  const chunks: Buffer[] = [];
  for await (const chunk of audio) {
    chunks.push(Buffer.from(chunk));
  }
  await fs.writeFile(filePath, Buffer.concat(chunks));
  return filePath;
}

export async function generateSRTSubtitles(
  script: Array<{ text: string; startSeconds: number; durationSeconds: number }>,
): Promise<string> {
  let srt = "";
  script.forEach((line, i) => {
    const start = formatSRTTime(line.startSeconds);
    const end = formatSRTTime(line.startSeconds + line.durationSeconds);
    srt += `${i + 1}\n${start} --> ${end}\n${line.text}\n\n`;
  });
  return srt;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

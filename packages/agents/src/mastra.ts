import { Mastra } from "@mastra/core/mastra";
import { LibSQLStore } from "@mastra/libsql";
import { PinoLogger } from "@mastra/loggers";
import { getEnv } from "@repo/config";
import { allAgents } from "./agents/index.js";
import { allWorkflows } from "@repo/workflows";

function createStorage() {
  const env = getEnv();
  return new LibSQLStore({
    id: "posteragent-storage",
    url: env.MASTRA_STORAGE_URL,
  });
}

let mastraInstance: Mastra | undefined;

/** Lazily construct Mastra (requires valid `.env` at runtime). */
export function createMastra(): Mastra {
  if (!mastraInstance) {
    mastraInstance = new Mastra({
      agents: allAgents,
      workflows: allWorkflows,
      storage: createStorage(),
      logger: new PinoLogger({
        name: "posteragent",
        level: "info",
      }),
    });
  }
  return mastraInstance;
}

/** Singleton accessor — loads env and storage on first call. */
export function getMastra(): Mastra {
  return createMastra();
}

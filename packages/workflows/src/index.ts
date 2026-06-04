import { videoGenerationWorkflow } from "./video-generation-workflow.js";
import { publishingWorkflow } from "./publishing-workflow.js";
import { dailyRunWorkflow } from "./daily-run-workflow.js";

export { videoGenerationWorkflow } from "./video-generation-workflow.js";
export { publishingWorkflow } from "./publishing-workflow.js";
export {
  dailyRunWorkflow,
  NICHES_CONFIG,
  DAILY_TARGETS,
} from "./daily-run-workflow.js";

export const allWorkflows = {
  videoGenerationWorkflow,
  publishingWorkflow,
  dailyRunWorkflow,
};

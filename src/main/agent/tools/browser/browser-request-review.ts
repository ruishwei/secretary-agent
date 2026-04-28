import type { ToolHandler } from "../../tool-executor";
import { BROWSER_REQUEST_REVIEW } from "../../../../shared/tool-schemas";

export function executeBrowserRequestReview(): ToolHandler {
  return {
    definition: BROWSER_REQUEST_REVIEW,
    async execute(args) {
      const reason = args.reason as string;
      const reviewType = args.reviewType as string;

      return {
        success: true,
        result: `Review requested (${reviewType}): ${reason}\nWaiting for user response...`,
      };
    },
  };
}

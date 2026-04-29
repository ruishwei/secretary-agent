import { useCallback } from "react";
import { useStore } from "../store";
import type { ReviewResponse } from "../../shared/types";

export function useSession() {
  const reviewRequest = useStore((s) => s.reviewRequest);
  const setReviewRequest = useStore((s) => s.setReviewRequest);

  const handleReviewResponse = useCallback(
    async (response: ReviewResponse, modifications?: string) => {
      if (reviewRequest && window.electronAPI?.reviewResponse) {
        await window.electronAPI.reviewResponse(reviewRequest.reviewId, response, modifications);
      }
      setReviewRequest(null);
    },
    [reviewRequest, setReviewRequest]
  );

  return {
    reviewRequest,
    handleReviewResponse,
  };
}

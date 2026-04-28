import { useCallback, useEffect } from "react";
import { useStore } from "../store";
import type { ReviewResponse } from "../../shared/types";

export function useSession() {
  const mode = useStore((s) => s.mode);
  const reviewRequest = useStore((s) => s.reviewRequest);
  const setMode = useStore((s) => s.setMode);
  const setReviewRequest = useStore((s) => s.setReviewRequest);

  // Listen for mode changes from main process
  useEffect(() => {
    if (!window.electronAPI?.onModeChanged) return;
    const unsubscribe = window.electronAPI.onModeChanged((event) => {
      setMode(event.mode);
    });
    return unsubscribe;
  }, [setMode]);

  const takeOver = useCallback(async () => {
    if (window.electronAPI?.takeOver) {
      await window.electronAPI.takeOver();
    }
    setMode("user");
  }, [setMode]);

  const handBack = useCallback(async () => {
    if (window.electronAPI?.handBack) {
      await window.electronAPI.handBack();
    }
    setMode("ai");
  }, [setMode]);

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
    mode,
    reviewRequest,
    takeOver,
    handBack,
    handleReviewResponse,
  };
}

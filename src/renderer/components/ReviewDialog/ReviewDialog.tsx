import React, { useState } from "react";
import type { ReviewRequest, ReviewResponse } from "../../../shared/types";

interface Props {
  review: ReviewRequest;
  onResponse: (response: ReviewResponse, modifications?: string) => void;
}

export function ReviewDialog({ review, onResponse }: Props) {
  const [modifications, setModifications] = useState("");

  const reviewTypeLabel = {
    "form-submit": "Form Submission",
    "content-draft": "Content Draft",
    navigation: "Navigation",
    "delete-action": "Delete Action",
  }[review.reviewType];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[500px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-yellow-400">Review Required</h3>
            <p className="text-xs text-gray-500 mt-0.5">{reviewTypeLabel}</p>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">Title</div>
            <div className="text-sm text-gray-200">{review.title}</div>
          </div>

          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">Description</div>
            <div className="text-sm text-gray-300">{review.description}</div>
          </div>

          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">Content</div>
            <pre className="bg-gray-800 rounded p-2 text-xs text-gray-300 overflow-x-auto max-h-[200px] overflow-y-auto">
              {JSON.stringify(review.content, null, 2)}
            </pre>
          </div>

          <div>
            <div className="text-xs text-gray-400 font-medium mb-1">
              Modifications (optional)
            </div>
            <textarea
              value={modifications}
              onChange={(e) => setModifications(e.target.value)}
              placeholder="Describe any changes you'd like the agent to make..."
              rows={3}
              className="w-full bg-gray-800 text-gray-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex justify-end space-x-2">
          <button
            onClick={() => onResponse("rejected")}
            className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Reject
          </button>
          <button
            onClick={() =>
              onResponse(modifications ? "modified" : "approved", modifications || undefined)
            }
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
          >
            {modifications ? "Approve with Changes" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

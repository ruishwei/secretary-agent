import React, { useState } from "react";

interface Props {
  skillName: string;
  content: string;
  actionCount: number;
  onSave: (content: string) => void;
  onDiscard: () => void;
}

export function SkillReviewDialog({ skillName, content, actionCount, onSave, onDiscard }: Props) {
  const [editedContent, setEditedContent] = useState(content);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[640px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-green-400">Review Recorded Skill</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Generated from {actionCount} recorded actions · Name: <code className="text-blue-400">{skillName}</code>
            </p>
          </div>
          <span className="text-xs px-2 py-0.5 bg-blue-900/50 text-blue-300 rounded border border-blue-800">
            LLM Generated
          </span>
        </div>

        {/* Body — editable SKILL.md content */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="text-xs text-gray-400 mb-2">
            Review the generated SKILL.md below. You can edit it before saving.
          </div>
          <textarea
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            className="w-full h-[400px] bg-gray-800 text-gray-200 rounded px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
            spellCheck={false}
          />
        </div>

        {/* Quick hints */}
        <div className="px-4 py-2 border-t border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>Tips:</span>
            <span className="text-gray-600">Check workflow steps are complete</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">Add browser_request_review before submits</span>
            <span className="text-gray-600">·</span>
            <span className="text-gray-600">Verify wait conditions</span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-800 flex justify-between items-center">
          <span className="text-xs text-gray-600">
            {editedContent !== content ? "Content modified by user" : ""}
          </span>
          <div className="flex space-x-2">
            <button
              onClick={onDiscard}
              className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
            >
              Discard
            </button>
            <button
              onClick={() => onSave(editedContent)}
              className="px-4 py-1.5 text-xs bg-green-700 hover:bg-green-600 text-white rounded transition-colors"
            >
              Save Skill
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

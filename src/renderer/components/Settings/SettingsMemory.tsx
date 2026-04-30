import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/useI18n";

interface MemState { label: string; target: "memory" | "user"; content: string; maxChars: number; }

export function SettingsMemory() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<MemState[]>([
    { label: t("settings.memory.memoryLabel"), target: "memory", content: "", maxChars: 2200 },
    { label: t("settings.memory.userLabel"), target: "user", content: "", maxChars: 1375 },
  ]);
  const [editing, setEditing] = useState<Set<string>>(new Set());

  const loadContent = async () => {
    setLoading(true);
    const result = await window.electronAPI?.memory.getContent();
    if (result) {
      setSections((prev) => [
        { ...prev[0], content: result.memory },
        { ...prev[1], content: result.user },
      ]);
    }
    setLoading(false);
  };

  useEffect(() => { loadContent(); }, []);

  const toggleEdit = (target: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.has(target) ? next.delete(target) : next.add(target);
      return next;
    });
  };

  const handleSave = async (section: MemState) => {
    const result = await window.electronAPI?.memory.setContent(section.target, section.content);
    if (result?.success) toggleEdit(section.target);
  };

  const updateContent = (target: "memory" | "user", content: string) => {
    setSections((prev) => prev.map((s) => (s.target === target ? { ...s, content } : s)));
  };

  if (loading) {
    return <div className="text-xs text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      {sections.map((section) => {
        const isEditing = editing.has(section.target);
        const charRatio = section.content.length / section.maxChars;
        return (
          <div key={section.target}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400 font-medium">{section.label}</span>
              <span className={`text-xs ${charRatio > 0.9 ? "text-red-400" : charRatio > 0.7 ? "text-yellow-400" : "text-gray-500"}`}>
                {section.content.length} / {section.maxChars} {t("settings.memory.charsUsed")}
              </span>
            </div>
            <textarea
              value={section.content}
              onChange={(e) => updateContent(section.target, e.target.value)}
              readOnly={!isEditing}
              className={`w-full h-[180px] bg-gray-800 text-gray-200 rounded px-2 py-1 text-xs font-mono resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                !isEditing ? "opacity-75" : ""
              }`}
              spellCheck={false}
            />
            <div className="flex space-x-2 mt-1">
              {isEditing ? (
                <>
                  <button onClick={() => handleSave(section)} className="px-2 py-0.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">
                    {t("settings.memory.save")}
                  </button>
                  <button onClick={() => toggleEdit(section.target)} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
                    {t("common.cancel")}
                  </button>
                </>
              ) : (
                <button onClick={() => toggleEdit(section.target)} className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
                  {t("settings.memory.edit")}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

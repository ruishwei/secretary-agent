import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { SkillInfo } from "../../../shared/types";

export function SettingsSkills() {
  const { t } = useI18n();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadSkills = async () => {
    setLoading(true);
    const list = await window.electronAPI?.skills.listAll();
    setSkills(list || []);
    setLoading(false);
  };

  useEffect(() => { loadSkills(); }, []);

  const toggleExpand = async (name: string) => {
    if (expanded.has(name)) {
      setExpanded((prev) => { const n = new Set(prev); n.delete(name); return n; });
    } else {
      const text = await window.electronAPI?.skills.getContent(name);
      setContent((prev) => ({ ...prev, [name]: text || "" }));
      setExpanded((prev) => new Set(prev).add(name));
    }
  };

  const handleDelete = async (name: string) => {
    await window.electronAPI?.skills.delete(name);
    setConfirmDelete(null);
    loadSkills();
  };

  if (loading) {
    return <div className="text-xs text-gray-400">{t("common.loading")}</div>;
  }

  if (skills.length === 0) {
    return <div className="text-xs text-gray-500 py-4 text-center">{t("settings.skills.noSkills")}</div>;
  }

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-1 text-xs text-gray-500 px-1 mb-1">
        <span>{t("settings.skills.name")}</span>
        <span>{t("settings.skills.category")}</span>
        <span>{t("settings.skills.version")}</span>
        <span className="w-16" />
      </div>
      {skills.map((skill) => (
        <React.Fragment key={skill.name}>
          <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-1 bg-gray-800 rounded px-2 py-1.5 items-center text-xs">
            <span className="text-gray-200 truncate">{skill.name}</span>
            <span className="text-gray-400 truncate">{skill.category}</span>
            <span className="text-gray-500">{skill.version}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => toggleExpand(skill.name)} className="text-blue-400 hover:text-blue-300 text-xs">
                {expanded.has(skill.name) ? "−" : t("settings.skills.viewContent")}
              </button>
              {skill.isBundled ? (
                <span className="text-gray-600 text-xs" title={t("settings.skills.cannotDelete")}>⊗</span>
              ) : (
                <button onClick={() => setConfirmDelete(skill.name)} className="text-red-400 hover:text-red-300 text-xs">
                  {t("common.delete")}
                </button>
              )}
            </div>
          </div>
          {expanded.has(skill.name) && (
            <div className="bg-gray-800/50 border border-gray-700 rounded px-2 py-1.5 mb-1">
              <pre className="text-xs text-gray-300 whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">
                {content[skill.name] || t("common.loading")}
              </pre>
            </div>
          )}
        </React.Fragment>
      ))}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded p-4 w-72">
            <p className="text-xs text-gray-300 mb-3">{t("settings.skills.confirmDelete")}</p>
            <div className="flex justify-end space-x-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1 text-xs bg-gray-700 text-gray-200 rounded">
                {t("common.cancel")}
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

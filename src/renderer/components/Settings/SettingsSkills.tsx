import React, { useState, useEffect, useRef, useCallback } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { SkillInfo } from "../../../shared/types";

interface HubItem {
  slug: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  author?: string;
  downloads?: number;
}

type TabId = "installed" | "hub";

export function SettingsSkills() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<TabId>("installed");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [content, setContent] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Hub state
  const [hubQuery, setHubQuery] = useState("");
  const [hubResults, setHubResults] = useState<HubItem[]>([]);
  const [hubSearching, setHubSearching] = useState(false);
  const [hubError, setHubError] = useState("");
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [installMsg, setInstallMsg] = useState<{ slug: string; ok: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Hub search with debounce
  const doHubSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setHubResults([]);
      return;
    }
    setHubSearching(true);
    setHubError("");
    try {
      const res = await window.electronAPI?.skills.hubSearch(query.trim());
      if (res?.error) {
        setHubError(res.error);
        setHubResults([]);
      } else {
        setHubResults(res?.results || []);
      }
    } catch {
      setHubError(t("settings.skills.networkError"));
      setHubResults([]);
    }
    setHubSearching(false);
  }, [t]);

  const onHubInput = (val: string) => {
    setHubQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doHubSearch(val), 400);
  };

  const handleInstall = async (item: HubItem) => {
    setInstalling((prev) => new Set(prev).add(item.slug));
    setInstallMsg(null);
    try {
      const res = await window.electronAPI?.skills.hubInstall(item.slug);
      if (res?.success) {
        setInstallMsg({ slug: item.slug, ok: true });
        loadSkills();
      } else {
        setInstallMsg({ slug: item.slug, ok: false });
      }
    } catch {
      setInstallMsg({ slug: item.slug, ok: false });
    }
    setInstalling((prev) => {
      const n = new Set(prev);
      n.delete(item.slug);
      return n;
    });
  };

  const installedSkills = skills;

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="flex border-b border-gray-700">
        {(["installed", "hub"] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-400 text-blue-300"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab === "installed" ? t("settings.skills.installed") : t("settings.skills.hub")}
            {tab === "installed" && skills.length > 0 && (
              <span className="ml-1 text-gray-600">({skills.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Installed tab */}
      {activeTab === "installed" && (
        <>
          {loading ? (
            <div className="text-xs text-gray-400">{t("common.loading")}</div>
          ) : installedSkills.length === 0 ? (
            <div className="text-xs text-gray-500 py-4 text-center">{t("settings.skills.noSkills")}</div>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-1 text-xs text-gray-500 px-1 mb-1">
                <span>{t("settings.skills.name")}</span>
                <span>{t("settings.skills.category")}</span>
                <span>{t("settings.skills.version")}</span>
                <span className="w-16" />
              </div>
              {installedSkills.map((skill) => (
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
            </div>
          )}

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
        </>
      )}

      {/* Hub tab */}
      {activeTab === "hub" && (
        <div className="space-y-3">
          <input
            type="text"
            value={hubQuery}
            onChange={(e) => onHubInput(e.target.value)}
            placeholder={t("settings.skills.searchHub")}
            className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1.5 text-sm border border-gray-700 focus:border-blue-500 focus:outline-none"
          />

          {hubSearching && (
            <div className="text-xs text-gray-400 text-center py-4">{t("common.loading")}</div>
          )}

          {hubError && (
            <div className="text-xs text-red-400 bg-red-900/30 rounded px-2 py-1.5">{hubError}</div>
          )}

          {!hubSearching && !hubError && hubResults.length === 0 && hubQuery.trim() && (
            <div className="text-xs text-gray-500 py-4 text-center">No results found.</div>
          )}

          {!hubSearching && hubResults.length === 0 && !hubQuery.trim() && (
            <div className="text-xs text-gray-500 py-4 text-center">
              Search for community skills to extend the agent's capabilities.
            </div>
          )}

          {hubResults.length > 0 && (
            <div className="space-y-2">
              {hubResults.map((item) => {
                const isInstalling = installing.has(item.slug);
                const msg = installMsg?.slug === item.slug ? installMsg : null;

                return (
                  <div key={item.slug} className="bg-gray-800 rounded px-3 py-2 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-200 truncate">{item.name}</span>
                        <span className="text-xs text-gray-500">v{item.version}</span>
                        <span className="text-xs text-gray-600 bg-gray-700 rounded px-1">{item.category}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                        {item.author && <span>{t("settings.skills.author")}: {item.author}</span>}
                        {item.downloads !== undefined && (
                          <span>{item.downloads.toLocaleString()} {t("settings.skills.downloads")}</span>
                        )}
                      </div>
                      {msg && (
                        <span className={`text-xs ${msg.ok ? "text-green-400" : "text-red-400"}`}>
                          {msg.ok ? t("settings.skills.installSuccess") : t("settings.skills.installFailed")}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleInstall(item)}
                      disabled={isInstalling}
                      className={`px-3 py-1 text-xs rounded flex-shrink-0 transition-colors ${
                        msg?.ok
                          ? "bg-green-700 text-white"
                          : isInstalling
                          ? "bg-gray-600 text-gray-400 cursor-wait"
                          : "bg-blue-600 hover:bg-blue-500 text-white"
                      }`}
                    >
                      {isInstalling ? t("settings.skills.installing") : msg?.ok ? "✓" : t("settings.skills.install")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

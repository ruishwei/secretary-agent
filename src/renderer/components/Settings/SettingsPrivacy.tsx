import React, { useState, useEffect } from "react";
import { useStore } from "../../store";
import { useI18n } from "../../i18n/useI18n";
import type { PasswordEntry } from "../../../shared/types";

export function SettingsPrivacy() {
  const { t } = useI18n();
  const [entries, setEntries] = useState<PasswordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<PasswordEntry | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({ domain: "", username: "", password: "" });

  const loadEntries = () => {
    setLoading(true);
    window.electronAPI?.password.getAll().then((list) => {
      setEntries(list);
      setLoading(false);
    });
  };

  useEffect(() => { loadEntries(); }, []);

  const resetForm = () => {
    setForm({ domain: "", username: "", password: "" });
    setEditing(null);
    setAdding(false);
  };

  const handleSave = async () => {
    const result = await window.electronAPI?.password.save(form, editing?.id);
    if (result?.success) {
      resetForm();
      loadEntries();
    }
  };

  const handleDelete = async (id: string) => {
    await window.electronAPI?.password.delete(id);
    setConfirmDelete(null);
    loadEntries();
  };

  const toggleReveal = (id: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const startEdit = (entry: PasswordEntry) => {
    setEditing(entry);
    setForm({ domain: entry.domain, username: entry.username, password: entry.password });
    setAdding(false);
  };

  return (
    <div className="space-y-3">
      {loading ? (
        <div className="text-xs text-gray-400">{t("common.loading")}</div>
      ) : entries.length === 0 && !adding ? (
        <div className="text-xs text-gray-500 py-4 text-center">{t("privacy.noEntries")}</div>
      ) : (
        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="bg-gray-800 rounded px-2 py-1.5 flex items-center justify-between text-xs">
              <div className="flex-1 min-w-0">
                <span className="text-gray-200">{entry.domain}</span>
                <span className="text-gray-500 mx-2">|</span>
                <span className="text-gray-400">{entry.username}</span>
                <span className="text-gray-500 mx-2">|</span>
                <span className="text-gray-500 font-mono">
                  {revealed.has(entry.id) ? entry.password : "••••••"}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                <button
                  onClick={() => toggleReveal(entry.id)}
                  className="text-xs text-gray-500 hover:text-gray-300"
                >
                  {revealed.has(entry.id) ? t("privacy.hide") : t("privacy.reveal")}
                </button>
                <button onClick={() => startEdit(entry)} className="text-xs text-gray-500 hover:text-blue-400">
                  {t("common.edit")}
                </button>
                <button onClick={() => setConfirmDelete(entry.id)} className="text-xs text-gray-500 hover:text-red-400">
                  {t("common.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(adding || editing) ? (
        <div className="bg-gray-800/50 border border-gray-700 rounded p-3 space-y-2">
          <div className="text-xs text-gray-400 font-medium">
            {editing ? t("privacy.editEntry") : t("privacy.addEntry")}
          </div>
          <input
            type="text"
            placeholder={t("privacy.domain")}
            value={form.domain}
            onChange={(e) => setForm({ ...form, domain: e.target.value.trim() })}
            className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm"
          />
          <input
            type="text"
            placeholder={t("privacy.username")}
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value.trim() })}
            className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm"
          />
          <input
            type="password"
            placeholder={t("privacy.password")}
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm"
          />
          <div className="flex space-x-2">
            <button onClick={handleSave} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded">
              {t("privacy.save")}
            </button>
            <button onClick={resetForm} className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded self-start"
        >
          {t("privacy.addEntry")}
        </button>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded p-4 w-72">
            <p className="text-xs text-gray-300 mb-3">{t("privacy.confirmDelete")}</p>
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

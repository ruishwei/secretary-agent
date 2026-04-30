import { useStore } from "../store";
import translations from "./translations";

export function useI18n() {
  const language = useStore((s) => s.settings.language || "zh-CN");

  return {
    t: (key: string): string => {
      return translations[language]?.[key]
        ?? translations["en"]?.[key]
        ?? key;
    },
    language,
  };
}

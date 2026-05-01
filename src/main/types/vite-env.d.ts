// Vite-injected globals from Electron Forge's Vite plugin
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare module "adm-zip" {
  class AdmZip {
    constructor(filePath: string);
    getEntries(): Array<{
      entryName: string;
      isDirectory: boolean;
      getData(): Buffer;
    }>;
  }
  export default AdmZip;
}

declare module "turndown" {
  interface Options {
    headingStyle?: "setext" | "atx";
    hr?: string;
    bulletListMarker?: string;
    codeBlockStyle?: "indented" | "fenced";
    fence?: string;
    emDelimiter?: string;
    strongDelimiter?: string;
    linkStyle?: "inlined" | "referenced";
    linkReferenceStyle?: "full" | "collapsed" | "shortcut";
  }
  class TurndownService {
    constructor(options?: Options);
    turndown(html: string | HTMLElement): string;
    use(plugins: any | any[]): TurndownService;
    addRule(key: string, rule: any): TurndownService;
    keep(filter: any): TurndownService;
    remove(filter: any): TurndownService;
    escape(str: string): string;
  }
  export = TurndownService;
  export as namespace TurndownService;
}

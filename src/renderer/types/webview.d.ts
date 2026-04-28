// Declare the Electron <webview> tag as a valid JSX element
declare namespace JSX {
  interface IntrinsicElements {
    webview: {
      id?: string;
      src?: string;
      style?: React.CSSProperties;
      allowpopups?: string;
      partition?: string;
      preload?: string;
      httpreferrer?: string;
      useragent?: string;
      disablewebsecurity?: string;
      nodeintegration?: string;
      plugins?: string;
      className?: string;
      ref?: React.Ref<HTMLElement>;
    };
  }
}

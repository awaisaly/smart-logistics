/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API gateway. Defaults to http://localhost:4000 when unset. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

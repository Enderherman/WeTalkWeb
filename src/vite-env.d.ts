/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

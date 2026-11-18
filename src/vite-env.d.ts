/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional AI tutor server endpoint (see server/tutor-proxy.mjs). */
  readonly VITE_TUTOR_ENDPOINT?: string;
}

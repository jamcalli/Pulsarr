// Global type declarations for client-side code

declare global {
  const __APP_VERSION__: string

  interface Window {
    __BASE_PATH__: string
  }
}

export {}

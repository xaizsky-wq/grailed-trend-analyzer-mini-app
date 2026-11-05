export type TelegramUser = {
  id: number
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

type TelegramWebApp = {
  initData: string
  initDataUnsafe: { user?: TelegramUser }
  version?: string
  colorScheme?: 'light' | 'dark'
  platform?: string
  ready(): void
  expand(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  downloadFile?(params: { url: string; file_name: string }, callback?: (accepted: boolean) => void): void
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void }
}

function versionAtLeast(current: string | undefined, required: number) {
  const parsed = Number.parseFloat(current || '0')
  return Number.isFinite(parsed) && parsed >= required
}

export function downloadTelegramFile(url: string, fileName: string) {
  const app = window.Telegram?.WebApp
  if (app?.downloadFile && versionAtLeast(app.version, 8)) {
    try {
      app.downloadFile({ url, file_name: fileName })
      return true
    } catch { /* fall through for older or partially supported clients */ }
  }
  openExternalUrl(url)
  return false
}

export function openExternalUrl(url: string) {
  const app = window.Telegram?.WebApp
  if (app?.openLink) { app.openLink(url, { try_instant_view: false }); return }
  window.open(url, '_blank', 'noopener,noreferrer')
}

declare global {
  interface Window { Telegram?: { WebApp?: TelegramWebApp } }
}

export function initTelegram() {
  const app = window.Telegram?.WebApp
  if (!app) return null
  app.ready(); app.expand(); app.disableVerticalSwipes?.()
  app.setHeaderColor?.('#090909'); app.setBackgroundColor?.('#090909')
  document.documentElement.dataset.telegram = 'true'
  return app
}

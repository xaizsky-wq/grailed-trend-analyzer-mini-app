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
  colorScheme?: 'light' | 'dark'
  platform?: string
  ready(): void
  expand(): void
  disableVerticalSwipes?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void }
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

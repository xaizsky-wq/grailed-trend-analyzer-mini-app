export async function downloadImage(url: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'listing-photo'
  try {
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) throw new Error('Image download failed')
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${safeName}.${blob.type.includes('png') ? 'png' : 'jpg'}`
    document.body.appendChild(anchor); anchor.click(); anchor.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export async function downloadListingGallery(id: string, title: string) {
  void title
  const url = new URL(`/api/listings/${encodeURIComponent(id)}/gallery.zip`, window.location.origin).toString()
  openExternalUrl(url)
  return true
}
import { openExternalUrl } from './telegram'


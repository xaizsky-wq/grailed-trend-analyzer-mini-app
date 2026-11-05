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
  const safeName = title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '-').replace(/-+/g, '-').slice(0, 70) || `listing-${id}`
  const response = await fetch(`/api/listings/${encodeURIComponent(id)}/gallery.zip`)
  if (!response.ok) throw new Error('Не удалось собрать ZIP. Повторите ещё раз.')
  const blob = await response.blob(), objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${safeName}-all-photos.zip`; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
  return true
}

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

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0 }
  return table
})()

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function u16(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255]) }
function u32(value: number) { return new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]) }
function join(parts: Uint8Array[]) { const size = parts.reduce((sum, part) => sum + part.length, 0); const out = new Uint8Array(size); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length } return out }

function createZip(files: Array<{ name: string; bytes: Uint8Array }>) {
  const encoder = new TextEncoder(), localParts: Uint8Array[] = [], centralParts: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name), crc = crc32(file.bytes), size = file.bytes.length
    const local = join([u32(0x04034b50),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0),name,file.bytes])
    localParts.push(local)
    centralParts.push(join([u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),u16(0),u16(0),u32(crc),u32(size),u32(size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]))
    offset += local.length
  }
  const central = join(centralParts), local = join(localParts)
  return new Blob([local, central, join([u32(0x06054b50),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(local.length),u16(0)])], { type: 'application/zip' })
}

export async function downloadListingGallery(id: string, title: string) {
  const proxyUrl = `https://r.jina.ai/http://www.grailed.com/api/listings/${encodeURIComponent(id)}`
  const response = await fetch(proxyUrl)
  if (!response.ok) throw new Error('Не удалось получить галерею объявления')
  const text = await response.text(), marker = 'Markdown Content:'
  const jsonText = text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length).trim() : text.trim()
  const payload = JSON.parse(jsonText) as { data?: { photos?: Array<{ url?: string }> } }
  const urls = (payload.data?.photos || []).map(photo => photo.url).filter((url): url is string => Boolean(url))
  if (!urls.length) throw new Error('В объявлении не найдены фотографии')
  const files = await Promise.all(urls.map(async (url, index) => {
    const image = await fetch(url)
    if (!image.ok) throw new Error(`Не удалось загрузить фото ${index + 1}`)
    const bytes = new Uint8Array(await image.arrayBuffer())
    const type = image.headers.get('content-type') || ''
    return { name: `${String(index + 1).padStart(2, '0')}.${type.includes('png') ? 'png' : type.includes('webp') ? 'webp' : 'jpg'}`, bytes }
  }))
  const zip = createZip(files), objectUrl = URL.createObjectURL(zip)
  const safeName = title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '-').replace(/-+/g, '-').slice(0, 70) || `listing-${id}`
  const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = `${safeName}-all-photos.zip`; document.body.appendChild(anchor); anchor.click(); anchor.remove()
  setTimeout(() => URL.revokeObjectURL(objectUrl), 2000)
  return files.length
}

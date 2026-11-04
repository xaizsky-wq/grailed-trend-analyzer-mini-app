import { useEffect, useState } from 'react'

export function PhotoUnique() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => { if (!file) { setPreview(null); return }; const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url) }, [file])

  async function process() {
    if (!file) return
    setBusy(true); setMessage('Очищаем метаданные и создаём новый файл…')
    try {
      const image = new Image()
      image.src = URL.createObjectURL(file)
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось открыть фото')) })
      const canvas = document.createElement('canvas')
      const max = 2200; const scale = Math.min(1, max / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
      if (!blob) throw new Error('Не удалось подготовить файл')
      setResult(URL.createObjectURL(blob)); setMessage('Готово: новый JPEG без исходных EXIF-метаданных.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Не удалось обработать фото') } finally { setBusy(false) }
  }

  return <section className="photo-search unique-tool">
    <div className="photo-heading"><div><p className="eyebrow">FILE CLEANUP · LOCAL</p><h2>Уникализация фото</h2></div><p>Обработка выполняется в браузере: исходное фото не загружается на сервер.</p></div>
    <div className="unique-grid">
      <label className="dropzone has-image">{preview ? <img src={preview} alt="Исходное фото" /> : <><span className="drop-icon">＋</span><strong>Выбрать фото</strong><small>JPG, PNG или WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { setFile(e.target.files?.[0] || null); setResult(null); setMessage('') }} /></label>
      <div className="photo-fields"><p className="field-help">Пересохраняем изображение в новый JPEG, удаляя EXIF и другие встроенные метаданные. Это не удаляет видимые водяные знаки или текст с картинки.</p><button className="primary" type="button" onClick={() => void process()} disabled={busy || !file}>{busy ? 'Обработка…' : 'Очистить и создать копию'}</button>{message && <p className="search-status" role="status">{message}</p>}{result && <a className="primary download-link" href={result} download={`grailed-clean-${Date.now()}.jpg`}>Скачать очищенное фото</a>}</div>
    </div>
  </section>
}

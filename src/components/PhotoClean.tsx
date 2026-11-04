import { useEffect, useState } from 'react'

export function PhotoClean() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file); setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  async function clean() {
    if (!file) return
    setBusy(true); setMessage('Удаляем EXIF, GPS, сведения об устройстве и исходном файле…')
    try {
      const image = new Image(); const source = URL.createObjectURL(file); image.src = source
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Не удалось прочитать изображение')) })
      URL.revokeObjectURL(source)
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .94))
      if (!blob) throw new Error('Не удалось создать очищенную копию')
      if (result) URL.revokeObjectURL(result)
      setResult(URL.createObjectURL(blob)); setMessage('Готово. Видимое изображение сохранено, встроенные метаданные удалены.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Ошибка обработки') } finally { setBusy(false) }
  }

  return <section className="photo-search clean-tool">
    <div className="photo-heading"><div><p className="eyebrow">PRIVACY · LOCAL</p><h2>Очистка следов</h2></div><p>Создаёт новую копию без EXIF, GPS-координат, модели устройства, даты съёмки и имени исходного файла. Фото обрабатывается локально.</p></div>
    <div className="unique-grid">
      <label className="dropzone has-image">{preview ? <img src={preview} alt="Выбранное фото" /> : <><span className="drop-icon">＋</span><strong>Выбрать фото</strong><small>JPG, PNG или WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setFile(event.target.files?.[0] || null); setResult(null); setMessage('') }} /></label>
      <div className="photo-fields"><p className="field-help">Изображение визуально не изменяется. Результат сохраняется как новый JPEG без встроенной информации исходного файла.</p><button className="primary" type="button" onClick={() => void clean()} disabled={!file || busy}>{busy ? 'Очистка…' : 'Удалить цифровые следы'}</button>{message && <p className="search-status" role="status">{busy && <span />}{message}</p>}{result && <><img className="clean-preview" src={result} alt="Очищенная копия" /><a className="primary download-link" href={result} download={`clean-photo-${Date.now()}.jpg`}>Скачать очищенную копию</a></>}</div>
    </div>
  </section>
}

import { memo, useEffect, useRef, useState } from 'react'

type Props = { src: string; alt?: string; className?: string }

export const SmartImage = memo(function SmartImage({ src, alt = '', className }: Props) {
  const host = useRef<HTMLSpanElement | null>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = host.current
    if (!element || visible) return
    if (!('IntersectionObserver' in window)) { setVisible(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '320px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])
  return <span ref={host} className={`smart-image${className ? ` ${className}` : ''}`}>
    {visible ? <img src={src} alt={alt} loading="lazy" decoding="async" fetchPriority="low" /> : <span className="smart-image-placeholder" />}
  </span>
})

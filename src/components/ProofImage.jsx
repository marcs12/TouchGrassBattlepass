import { useEffect, useState } from 'react'

/**
 * A proof photo. Both backends hand back a URL asynchronously - a signed one
 * from storage when synced, an object URL off IndexedDB when not - so the box
 * is drawn at the photo's own aspect ratio first and filled in after. Without
 * that the log jumps around as pictures land.
 */
export default function ProofImage({ path, w, h, alt, proofUrl, className = '' }) {
  const [src, setSrc] = useState(null)

  useEffect(() => {
    let live = true
    setSrc(null)
    if (!path || !proofUrl) return undefined

    proofUrl(path).then((url) => {
      if (live) setSrc(url)
    })
    return () => {
      live = false
    }
  }, [path, proofUrl])

  return (
    <span
      className={`proof ${className}`}
      style={{ '--ar': w && h ? w / h : 1 }}
      data-loaded={src ? 'yes' : 'no'}
    >
      {src && <img src={src} alt={alt} loading="lazy" decoding="async" />}
    </span>
  )
}

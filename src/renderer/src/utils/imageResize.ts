// Resizes/compresses a user-picked image into a square JPEG data URL before it
// ever reaches persistence — keeps the (JSON-file-backed) data store from
// bloating on a multi-megabyte photo, and gives every podcast a consistent
// square icon regardless of what aspect ratio the source image was.
export function resizeImageToDataUrl(file: File, maxSize = 512, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read the selected file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to load the selected image'))
      img.onload = () => {
        const size = Math.min(maxSize, Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas is not supported'))
          return
        }
        // Center-crop to a square, covering the canvas (like CSS object-fit: cover).
        const scale = size / Math.min(img.width, img.height)
        const drawWidth = img.width * scale
        const drawHeight = img.height * scale
        ctx.drawImage(
          img,
          (size - drawWidth) / 2,
          (size - drawHeight) / 2,
          drawWidth,
          drawHeight
        )
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

const CDN_URL = 'https://unpkg.com/html-to-image@1.11.11/dist/html-to-image.js'

let loadPromise

function loadHtmlToImage() {
  if (window.htmlToImage?.toPng) {
    return Promise.resolve(window.htmlToImage)
  }

  if (loadPromise) {
    return loadPromise
  }

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CDN_URL
    script.async = true
    script.onload = () => {
      if (window.htmlToImage?.toPng) {
        resolve(window.htmlToImage)
      } else {
        reject(new Error('html-to-image failed to load'))
      }
    }
    script.onerror = () => reject(new Error('Could not load html-to-image CDN script'))
    document.head.appendChild(script)
  })

  return loadPromise
}

export async function exportNodeToPng(node, fileName = 'harmony-notes.png', dark = true) {
  const htmlToImage = await loadHtmlToImage()
  const dataUrl = await htmlToImage.toPng(node, {
    cacheBust: true,
    pixelRatio: 3,
    backgroundColor: dark ? '#0e1117' : '#ffffff',
  })

  const link = document.createElement('a')
  link.download = fileName
  link.href = dataUrl
  link.click()
}

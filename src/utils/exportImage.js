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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load image asset'))
    image.src = src
  })
}

function createExportClone(node) {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-100000px'
  wrapper.style.top = '0'
  wrapper.style.pointerEvents = 'none'
  wrapper.style.opacity = '0'

  const clone = node.cloneNode(true)
  clone.style.overflow = 'visible'
  clone.style.width = `${node.scrollWidth}px`
  clone.style.maxWidth = 'none'
  clone.style.height = 'auto'

  clone.querySelectorAll('.hymnSheet').forEach((sheet) => {
    sheet.style.overflow = 'visible'
    sheet.style.width = `${node.scrollWidth}px`
    sheet.style.maxWidth = 'none'
  })

  wrapper.appendChild(clone)
  document.body.appendChild(wrapper)
  return { wrapper, clone }
}

async function appendLogoToDataUrl(dataUrl, logoUrl) {
  if (!logoUrl) {
    return dataUrl
  }

  const [baseImage, logoImage] = await Promise.all([loadImage(dataUrl), loadImage(encodeURI(logoUrl))])
  const canvas = document.createElement('canvas')
  canvas.width = baseImage.width
  canvas.height = baseImage.height
  const ctx = canvas.getContext('2d')

  ctx.drawImage(baseImage, 0, 0)

  const logoWidth = Math.max(180, Math.round(canvas.width * 0.17))
  const scale = logoWidth / logoImage.width
  const logoHeight = Math.round(logoImage.height * scale)
  const padding = Math.max(20, Math.round(canvas.width * 0.02))
  const x = padding
  const y = padding
  const siteUrl = 'www.harmonyn.netlify.app'
  const fontSize = Math.max(14, Math.round(canvas.width * 0.012))

  const linkY = y + logoHeight + fontSize + 12
  ctx.font = `600 ${fontSize}px Arial, sans-serif`
  const linkWidth = ctx.measureText(siteUrl).width

  ctx.fillStyle = 'rgba(13,19,37,0.45)'
  ctx.fillRect(x - 10, y - 10, Math.max(logoWidth, linkWidth) + 20, logoHeight + fontSize + 28)
  ctx.globalAlpha = 0.95
  ctx.drawImage(logoImage, x, y, logoWidth, logoHeight)
  ctx.fillStyle = '#8cc7ff'
  ctx.textBaseline = 'middle'
  ctx.fillText(siteUrl, x, linkY)
  ctx.globalAlpha = 1

  return canvas.toDataURL('image/png')
}

export async function exportNodeToPng(node, fileName = 'harmony-notes.png', dark = true, options = {}) {
  const htmlToImage = await loadHtmlToImage()
  const { wrapper, clone } = createExportClone(node)
  let dataUrl = ''
  try {
    dataUrl = await htmlToImage.toPng(clone, {
      cacheBust: true,
      pixelRatio: 3,
      backgroundColor: dark ? '#0e1117' : '#ffffff',
      width: clone.scrollWidth,
      height: clone.scrollHeight,
    })
  } finally {
    wrapper.remove()
  }
  let nextDataUrl = dataUrl
  try {
    nextDataUrl = await appendLogoToDataUrl(dataUrl, options.logoUrl)
  } catch {
    nextDataUrl = dataUrl
  }

  const link = document.createElement('a')
  link.download = fileName
  link.href = nextDataUrl
  link.click()
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load image asset"));
    image.src = src;
  });
}

function createExportClone(node, desktopWidth = 800, dark = true) {
  const wrapper = document.createElement("div");
  wrapper.style.position = "fixed";
  wrapper.style.left = "-100000px";
  wrapper.style.top = "0";
  wrapper.style.width = `${desktopWidth}px`;
  wrapper.style.height = "auto";
  wrapper.style.maxHeight = "none";
  wrapper.style.overflow = "visible";
  wrapper.style.pointerEvents = "none";
  wrapper.style.opacity = "0";

  const themeRoot = document.createElement("div");
  themeRoot.className = dark ? "app dark export-container" : "app light export-container";
  themeRoot.lang = "ar";
  themeRoot.setAttribute("dir", "rtl");
  themeRoot.style.width = `${desktopWidth}px`;
  themeRoot.style.maxWidth = `${desktopWidth}px`;
  themeRoot.style.minHeight = "0";
  themeRoot.style.height = "auto";
  themeRoot.style.padding = "0";
  themeRoot.style.margin = "0";
  themeRoot.style.background = "#ffffff";
  themeRoot.style.overflow = "visible";

  const clone = node.cloneNode(true);
  clone.classList.add("exportSheet");
  clone.classList.add("export-container");
  clone.style.width = `${desktopWidth}px`;
  clone.style.maxWidth = `${desktopWidth}px`;
  clone.style.minWidth = `${desktopWidth}px`;
  clone.style.height = "auto";
  clone.style.maxHeight = "none";
  clone.style.overflow = "visible";
  clone.style.background = "#ffffff";
  clone.style.boxShadow = "none";
  clone.style.border = "0";
  clone.style.borderRadius = "0";
  clone.style.padding = "22px 24px 28px";

  clone.querySelectorAll(".hymnSheet").forEach((sheet) => {
    sheet.style.overflow = "visible";
    sheet.style.width = `${desktopWidth}px`;
    sheet.style.maxWidth = `${desktopWidth}px`;
    sheet.style.minWidth = `${desktopWidth}px`;
    sheet.style.height = "auto";
    sheet.style.maxHeight = "none";
    sheet.style.background = "transparent";
  });

  clone.querySelectorAll(".sheetLines, .sheetLine, .lyricWord, .lyricWordChords, .cell").forEach((item) => {
    item.style.overflow = "visible";
    item.style.maxWidth = "none";
    item.style.minWidth = "0";
  });

  clone.querySelectorAll(".hymnSheet .chord, .lyricWordChord, .lyricWordText").forEach((item) => {
    item.style.background = "transparent";
    item.style.border = "0";
    item.style.boxShadow = "none";
    item.style.textShadow = "none";
  });

  clone.querySelectorAll(".hymnSheet .chord").forEach((item) => {
    item.style.color = "#c0392b";
    item.style.fontSize = "1.05rem";
    item.style.fontWeight = "700";
    item.style.padding = "0";
    item.style.minWidth = "0";
    item.style.borderRadius = "0";
    item.style.background = "transparent";
    item.style.border = "none";
  });

  clone.querySelectorAll(".sidebar-logo, .watermark-box, .previewWrap, .topBar, aside, .sidebar, .hymnList, .floatingResetBtn, .floatingThemeBtn, .toastNotice, .syncBadge, .roleBadge").forEach((nodeItem) => {
    nodeItem.style.display = "none";
  });

  const exportHeader = clone.querySelector(".sheetHeader");
  if (exportHeader) {
    const titleNode = clone.querySelector(".sheetHeader h1");
    const keyNode = clone.querySelector(".sheetKeyPill strong");
    const titleText = titleNode?.textContent?.trim() || "ترنيمة بدون عنوان";
    const keyText = keyNode?.textContent?.trim() || "—";

    exportHeader.innerHTML = `
      <div class="export-title-line" dir="rtl">
        <span class="export-title-prefix">ترنيمة</span>
        <span class="export-title-text">"${titleText}"</span>
        <span class="export-title-separator">:</span>
        <span class="export-title-key">${keyText}</span>
      </div>
    `;
  }

  clone.querySelectorAll(".hymnSheet .lyric").forEach((item) => {
    item.style.fontSize = "1.5rem";
    item.style.background = "transparent";
    item.style.color = "#191919";
  });

  themeRoot.appendChild(clone);
  wrapper.appendChild(themeRoot);
  document.body.appendChild(wrapper);
  return { wrapper, rootForCapture: themeRoot };
}

async function appendLogoToDataUrl(dataUrl, logoUrl) {
  if (!logoUrl) {
    return dataUrl;
  }

  const [baseImage, logoImage] = await Promise.all([
    loadImage(dataUrl),
    loadImage(encodeURI(logoUrl)),
  ]);
  const canvas = document.createElement("canvas");
  canvas.width = baseImage.width;
  canvas.height = baseImage.height;
  const ctx = canvas.getContext("2d");

  ctx.drawImage(baseImage, 0, 0);

  const logoWidth = Math.max(180, Math.round(canvas.width * 0.17));
  const scale = logoWidth / logoImage.width;
  const logoHeight = Math.round(logoImage.height * scale);
  const padding = Math.max(20, Math.round(canvas.width * 0.02));
  const x = padding;
  const y = padding;
  const siteUrl = "www.harmonyn.netlify.app";
  const fontSize = Math.max(14, Math.round(canvas.width * 0.012));

  const linkY = y + logoHeight + fontSize + 12;
  ctx.font = `600 ${fontSize}px Arial, sans-serif`;
  const linkWidth = ctx.measureText(siteUrl).width;

  ctx.fillStyle = "rgba(13,19,37,0.45)";
  ctx.fillRect(
    x - 10,
    y - 10,
    Math.max(logoWidth, linkWidth) + 20,
    logoHeight + fontSize + 28,
  );
  ctx.globalAlpha = 0.95;
  ctx.drawImage(logoImage, x, y, logoWidth, logoHeight);
  ctx.fillStyle = "#8cc7ff";
  ctx.textBaseline = "middle";
  ctx.fillText(siteUrl, x, linkY);
  ctx.globalAlpha = 1;

  return canvas.toDataURL("image/png");
}

export async function exportNodeToPng(
  node,
  fileName = "harmony-notes.png",
  dark = true,
  options = {},
) {
  const { toPng } = await import("html-to-image");
  const desktopWidth = options.desktopWidth || 800;
  const { wrapper, rootForCapture } = createExportClone(
    node,
    desktopWidth,
    dark,
  );
  let dataUrl = "";
  try {
    dataUrl = await toPng(rootForCapture, {
      cacheBust: true,
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      width: desktopWidth,
      height: rootForCapture.scrollHeight,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.offsetWidth,
      style: {
        width: `${desktopWidth}px`,
        height: "auto",
        overflow: "visible",
        background: "#ffffff",
        direction: "rtl",
        textAlign: "right",
      },
      onclone: (clonedDoc) => {
        const exportRoot =
          clonedDoc.querySelector(".export-container") || clonedDoc.body;

        if (exportRoot) {
          exportRoot.setAttribute("dir", "rtl");
          exportRoot.style.direction = "rtl";
          exportRoot.style.textAlign = "right";
        }

        clonedDoc.querySelectorAll(
          ".sidebar-logo, .watermark-box, .previewWrap, .topBar, aside, .sidebar, .hymnList, .floatingResetBtn, .floatingThemeBtn, .toastNotice, .syncBadge, .roleBadge, .sheetKicker, .sheetMetaHint",
        ).forEach((item) => {
          item.style.display = "none";
        });

        const chordBadges = clonedDoc.querySelectorAll(
          '.chord-badge, .chord, [class*="chord"]',
        );

        chordBadges.forEach((el) => {
          el.style.background = "transparent";
          el.style.backgroundColor = "transparent";
          el.style.border = "none";
          el.style.borderColor = "transparent";
          el.style.outline = "none";
          el.style.boxShadow = "none";
          el.style.WebkitBoxShadow = "none";
          el.style.borderRadius = "0";
          el.style.color = "#c0392b";
          el.style.fontWeight = "bold";
          el.style.padding = "0";
          el.style.minWidth = "0";
          el.style.textShadow = "none";
        });
      },
    });
  } finally {
    wrapper.remove();
  }
  let nextDataUrl = dataUrl;
  if (options.logoUrl) {
    try {
      nextDataUrl = await appendLogoToDataUrl(dataUrl, options.logoUrl);
    } catch {
      nextDataUrl = dataUrl;
    }
  }

  const link = document.createElement("a");
  link.download = fileName;
  link.href = nextDataUrl;
  link.click();
}

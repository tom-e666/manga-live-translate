pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

let pdfDoc = null;
let uploadedFiles = [];
let totalPages = 0;
let translatedCanvases = [];

const readerContainer = document.getElementById('reader-container');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const btnStart = document.getElementById('btn-start');
const btnDownload = document.getElementById('btn-download');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const statusText = document.getElementById('status-text');
const apiKeyInput = document.getElementById('api-key');
const sourceLangSelect = document.getElementById('source-lang');
const targetLangSelect = document.getElementById('target-lang');
const zoomSlider = document.getElementById('zoom-slider');
const zoomValue = document.getElementById('zoom-value');

// Width adjustment
function updateMangaWidth(width) {
  document.documentElement.style.setProperty('--manga-width', `${width}px`);
  if (zoomValue) zoomValue.innerText = `${width}px`;
}
if (zoomSlider) {
  zoomSlider.addEventListener('input', (e) => updateMangaWidth(e.target.value));
  updateMangaWidth(zoomSlider.value);
}

const ocrEngineSelect = document.getElementById('ocr-engine');
const apiKeyContainer = document.getElementById('api-key-container');

if (ocrEngineSelect && apiKeyContainer) {
  ocrEngineSelect.addEventListener('change', (e) => {
    if (e.target.value === 'cloud') {
      apiKeyContainer.classList.remove('hidden');
    } else {
      apiKeyContainer.classList.add('hidden');
    }
  });
  
  // Tự động chuyển sang Cloud khi chạy trên hosting tĩnh (không phải localhost)
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    ocrEngineSelect.value = 'cloud';
    apiKeyContainer.classList.remove('hidden');
  }
}

// Sidebar double click collapse
const sidebar = document.getElementById('sidebar');
if (sidebar) {
  sidebar.addEventListener('dblclick', (e) => {
    if (e.target.tagName !== 'SELECT' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'BUTTON') {
      sidebar.classList.toggle('w-[260px]');
      sidebar.classList.toggle('w-[60px]');
      sidebar.querySelectorAll('.full-content, label, select, input, button, p, span:not(.text-xl)').forEach(el => {
        el.classList.toggle('hidden');
      });
    }
  });
}

// Drag & drop
dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-blue-500'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-blue-500');
  handleSelectedFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', (e) => handleSelectedFiles(e.target.files));

async function handleSelectedFiles(filesList) {
  if (filesList.length === 0) return;
  uploadedFiles = Array.from(filesList);
  uploadedFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));

  if (uploadedFiles.length === 1 && uploadedFiles[0].type === "application/pdf") {
    const file = uploadedFiles[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      pdfjsLib.getDocument({data: e.target.result}).promise.then((pdf) => {
        pdfDoc = pdf;
        totalPages = pdf.numPages;
        progressText.innerText = `0/${totalPages} trang`;
        statusText.innerText = "PDF nạp thành công";
      });
    };
    reader.readAsArrayBuffer(file);
  } else {
    pdfDoc = null;
    totalPages = uploadedFiles.length;
    progressText.innerText = `0/${totalPages} trang`;
    statusText.innerText = `Đã nạp ${totalPages} ảnh`;
  }
  btnStart.removeAttribute('disabled');
}

btnStart.addEventListener('click', async () => {
  if (totalPages === 0) return;
  btnStart.setAttribute('disabled', 'true');
  btnDownload.classList.add('hidden');
  readerContainer.innerHTML = "";
  translatedCanvases = new Array(totalPages);

  for (let i = 1; i <= totalPages; i++) {
    createPlaceholder(i);
  }

  const CONCURRENT_WORKERS = 4;
  let pageIndex = 1;
  let completedCount = 0;

  async function worker() {
    while (pageIndex <= totalPages) {
      const currentPageNum = pageIndex++;
      try {
        let canvas = null;
        if (pdfDoc) {
          canvas = await renderPdfPage(currentPageNum);
        } else {
          canvas = await loadImage(uploadedFiles[currentPageNum - 1]);
        }

        canvas = await translatePage(canvas, currentPageNum);
        translatedCanvases[currentPageNum - 1] = canvas;
        replacePlaceholder(canvas, currentPageNum);
      } catch (err) {
        console.error(`Lỗi trang ${currentPageNum}:`, err);
      }
      completedCount++;
      updateProgress(Math.round((completedCount / totalPages) * 100), `Đang dịch... (${completedCount}/${totalPages})`);
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENT_WORKERS, totalPages); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  statusText.innerText = "Dịch hoàn tất!";
  btnDownload.classList.remove('hidden');
  btnStart.removeAttribute('disabled');
});

function createPlaceholder(pageNum) {
  const wrapper = document.createElement('div');
  wrapper.id = `page-wrapper-${pageNum}`;
  wrapper.className = "manga-page-wrapper min-h-[300px] flex flex-col items-center justify-center relative";
  wrapper.innerHTML = `
    <span class="absolute top-2 left-2 bg-black/70 text-zinc-300 text-[10px] px-2 py-0.5 rounded">Trang ${pageNum}</span>
    <div class="text-zinc-500 text-xs flex flex-col items-center gap-2">
      <div class="w-6 h-6 border-2 border-t-blue-500 border-zinc-700 rounded-full animate-spin"></div>
      <span>Đang dịch...</span>
    </div>
  `;
  readerContainer.appendChild(wrapper);
}

function replacePlaceholder(canvas, pageNum) {
  const wrapper = document.getElementById(`page-wrapper-${pageNum}`);
  if (wrapper) {
    wrapper.innerHTML = "";
    wrapper.className = "manga-page-wrapper relative";
    
    const label = document.createElement('span');
    label.className = "absolute top-2 left-2 bg-black/70 text-zinc-300 text-[10px] px-2 py-0.5 rounded z-10 opacity-0 hover:opacity-100 transition-opacity";
    label.innerText = `Trang ${pageNum}`;
    
    wrapper.appendChild(label);
    wrapper.appendChild(canvas);
  }
}

function loadImage(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function renderPdfPage(pageNum) {
  return new Promise((resolve) => {
    pdfDoc.getPage(pageNum).then((page) => {
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: viewport
      }).promise.then(() => resolve(canvas));
    });
  });
}

async function translatePage(canvas, pageNum) {
  const ctx = canvas.getContext('2d');
  const base64Image = canvas.toDataURL('image/jpeg', 0.85);
  
  const language = sourceLangSelect.value;
  const ocrLang = language === "KOREAN" ? "ko" : (language === "JAPANESE" ? "ja" : (language === "CHINESE" ? "ch" : "en"));
  const ocrEngine = ocrEngineSelect ? ocrEngineSelect.value : 'local';

  try {
    let textLines = [];
    
    if (ocrEngine === 'local') {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64Image, lang: ocrLang })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "OCR server error");
      }
      
      const data = await response.json();
      textLines = data.Lines || [];
    } else {
      // Cloud OCR.space API
      const apiKey = apiKeyInput.value || "helloworld";
      const formData = new FormData();
      formData.append("apikey", apiKey);
      formData.append("base64Image", base64Image);
      const ocrSpaceLang = ocrLang === "ko" ? "kor" : (ocrLang === "ja" ? "jpn" : (ocrLang === "ch" ? "chs" : "eng"));
      formData.append("language", ocrSpaceLang);
      formData.append("isOverlayRequired", "true");
      
      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData
      });
      
      const data = await response.json();
      if (data.OCRExitCode === 1 && data.ParsedResults && data.ParsedResults.length > 0) {
        const lines = data.ParsedResults[0].TextOverlay ? data.ParsedResults[0].TextOverlay.Lines : [];
        textLines = lines.map(l => ({
          LineText: l.LineText,
          Words: l.Words.map(w => ({
            Left: w.Left,
            Top: w.Top,
            Width: w.Width,
            Height: w.Height
          }))
        }));
      } else {
        const errorMsg = data.ErrorMessage ? data.ErrorMessage[0] : "OCR Cloud Error";
        throw new Error(errorMsg);
      }
    }
    
    const validLines = textLines.filter(l => l.LineText && l.Words && l.Words.length > 0);

    if (validLines.length > 0) {
      // Gom nhóm các dòng chữ gần nhau thành "Bong bóng thoại" (Speech Bubbles)
      const bubbles = groupLinesIntoBubbles(validLines);

      for (let bubble of bubbles) {
        // Sắp xếp các dòng trong bong bóng từ trên xuống dưới
        bubble.sort((a, b) => a.Words[0].Top - b.Words[0].Top);

        // Ghép text các dòng trong bong bóng thành câu hoàn chỉnh để dịch nghĩa chính xác
        const combinedText = bubble.map(l => l.LineText.trim()).join(" ");
        const translatedText = await translateText(combinedText);

        // Tính toán hộp bao (Bounding Box) bao quanh toàn bộ bong bóng
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        bubble.forEach(line => {
          line.Words.forEach(w => {
            minX = Math.min(minX, w.Left);
            minY = Math.min(minY, w.Top);
            maxX = Math.max(maxX, w.Left + w.Width);
            maxY = Math.max(maxY, w.Top + w.Height);
          });
        });

        const boxW = maxX - minX;
        const boxH = maxY - minY;

        if (translatedText) {
          overlayText(ctx, translatedText, bubble, minX, minY, boxW, boxH);
        }
      }
    }
  } catch (err) {
    console.error(`Error processing page ${pageNum}:`, err);
    updateProgress(Math.round((pageNum / totalPages) * 100), `⚠️ Lỗi dịch trang ${pageNum}: ${err.message}`);
  }
  return canvas;
}

function groupLinesIntoBubbles(lines) {
  const bubbles = [];
  const visited = new Set();
  
  for (let i = 0; i < lines.length; i++) {
    if (visited.has(i)) continue;
    
    const currentBubble = [lines[i]];
    visited.add(i);
    
    let added = true;
    while (added) {
      added = false;
      for (let j = 0; j < lines.length; j++) {
        if (visited.has(j)) continue;
        
        const lineJ = lines[j];
        const isClose = currentBubble.some(lineB => {
          const vDist = Math.abs(lineJ.Words[0].Top - lineB.Words[0].Top);
          const hDist = Math.abs(lineJ.Words[0].Left - lineB.Words[0].Left);
          
          // Khoảng cách gom nhóm bong bóng thoại (đứng dưới 60px, ngang dưới 100px)
          return vDist < 60 && hDist < 100;
        });
        
        if (isClose) {
          currentBubble.push(lineJ);
          visited.add(j);
          added = true;
        }
      }
    }
    bubbles.push(currentBubble);
  }
  return bubbles;
}

async function translateText(text) {
  try {
    const targetLang = targetLangSelect ? targetLangSelect.value : 'vi';
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data && data[0]) {
      return data[0].map(chunk => chunk[0] || "").join("");
    }
  } catch (e) {
    console.error("Translation error:", e);
  }
  return text;
}

function overlayText(ctx, text, lines, minX, minY, boxW, boxH) {
  let lightCount = 0;
  let darkCount = 0;
  
  // 1. Tính toán màu nền chủ đạo bằng cách lấy mẫu ở các góc của tất cả các dòng
  for (let line of lines) {
    let lX = Infinity, lY = Infinity, lMaxX = 0, lMaxY = 0;
    line.Words.forEach(w => {
      lX = Math.min(lX, w.Left);
      lY = Math.min(lY, w.Top);
      lMaxX = Math.max(lMaxX, w.Left + w.Width);
      lMaxY = Math.max(lMaxY, w.Top + w.Height);
    });
    const lW = lMaxX - lX;
    const lH = lMaxY - lY;
    
    const samplePoints = [
      {x: lX - 2, y: lY - 2},
      {x: lX + lW + 2, y: lY - 2},
      {x: lX - 2, y: lY + lH + 2},
      {x: lX + lW + 2, y: lY + lH + 2}
    ];
    
    for (let pt of samplePoints) {
      try {
        const p = ctx.getImageData(pt.x, pt.y, 1, 1).data;
        const brightness = (p[0] * 299 + p[1] * 587 + p[2] * 114) / 1000;
        if (brightness > 180) {
          lightCount++;
        } else {
          darkCount++;
        }
      } catch (e) {}
    }
  }
  
  const isLight = lightCount >= darkCount;
  ctx.fillStyle = isLight ? "#ffffff" : "#000000";
  
  // 2. CHỈ che phủ nền đè lên từng dòng chữ gốc riêng lẻ (giữ lại các chi tiết vẽ ở giữa các dòng)
  for (let line of lines) {
    let lX = Infinity, lY = Infinity, lMaxX = 0, lMaxY = 0;
    line.Words.forEach(w => {
      lX = Math.min(lX, w.Left);
      lY = Math.min(lY, w.Top);
      lMaxX = Math.max(lMaxX, w.Left + w.Width);
      lMaxY = Math.max(lMaxY, w.Top + w.Height);
    });
    ctx.fillRect(lX - 3, lY - 3, (lMaxX - lX) + 6, (lMaxY - lY) + 6);
  }
  
  // 3. Vẽ chữ dịch đè lên toàn bộ khối bong bóng
  ctx.fillStyle = isLight ? "#000000" : "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  const fontSize = Math.max(10, Math.min(boxH * 0.7, 16));
  ctx.font = `bold ${fontSize}px sans-serif`;
  
  wrapText(ctx, text, minX + (boxW / 2), minY + (boxH / 2), boxW, fontSize);
}

function wrapText(ctx, text, centerX, centerY, maxWidth, fontSize) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  for (let i = 0; i < words.length; i++) {
    const testLine = currentLine + (currentLine ? ' ' : '') + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && i > 0) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  
  const totalHeight = lines.length * (fontSize + 2);
  let startY = centerY - (totalHeight / 2) + (fontSize / 2);
  
  lines.forEach((line) => {
    ctx.fillText(line, centerX, startY);
    startY += fontSize + 2;
  });
}

function updateProgress(percent, status) {
  progressBar.style.width = `${percent}%`;
  statusText.innerText = status;
  const finished = translatedCanvases.filter(c => c !== undefined).length;
  progressText.innerText = `${finished}/${totalPages} trang`;
}

btnDownload.addEventListener('click', () => {
  const validCanvases = translatedCanvases.filter(c => c !== undefined);
  if (validCanvases.length === 0) return;
  statusText.innerText = "Đang tạo PDF...";

  const { jsPDF } = window.jspdf;
  const first = validCanvases[0];
  const pdf = new jsPDF({
    orientation: first.width > first.height ? 'l' : 'p',
    unit: 'px',
    format: [first.width, first.height]
  });

  validCanvases.forEach((canvas, index) => {
    if (index > 0) pdf.addPage([canvas.width, canvas.height], canvas.width > canvas.height ? 'l' : 'p');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, canvas.width, canvas.height);
  });

  pdf.save("translated_manga.pdf");
  statusText.innerText = "Tải thành công!";
});

window.addEventListener('DOMContentLoaded', async () => {
  const defaultImages = [
    'page_001.png',
    'page_002.png',
    'page_003.png',
    'page_004.png',
    'page_005.png',
    'page_006.png'
  ];
  
  try {
    const filePromises = defaultImages.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      return new File([blob], url, { type: blob.type });
    });
    
    uploadedFiles = await Promise.all(filePromises);
    pdfDoc = null;
    totalPages = uploadedFiles.length;
    progressText.innerText = `0/${totalPages} trang`;
    statusText.innerText = "Đã tự động nạp 6 ảnh mặc định";
    btnStart.removeAttribute('disabled');
    btnStart.click(); // Tự động dịch luôn
  } catch (err) {
    console.log("Không thể nạp 6 ảnh mặc định:", err);
  }
});

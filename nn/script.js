const qrText = document.getElementById('qrText');
const teraboxUrlInput = document.getElementById('teraboxUrl');
const teraboxUrlInput2 = document.getElementById('teraboxUrl2');
const teraboxUrlInput3 = document.getElementById('teraboxUrl3');
const teraboxUrlInput4 = document.getElementById('teraboxUrl4');
const generatorSection = document.getElementById('generatorSection');
const qrSection = document.getElementById('qrSection');
const scanBtn = document.getElementById('scanBtn');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const scannerPanel = document.getElementById('scannerPanel');
const startScanBtn = document.getElementById('startScanBtn');
const scanFileInput = document.getElementById('scanFileInput');
const scanVideo = document.getElementById('scanVideo');
const scanStatus = document.getElementById('scanStatus');
const scanResultBox = document.getElementById('scanResultBox');
const scanResult = document.getElementById('scanResult');
const copyScanBtn = document.getElementById('copyScanBtn');
const downloadScanBtn = document.getElementById('downloadScanBtn');
const generateBtn = document.getElementById('generateBtn');
const downloadBtn = document.getElementById('downloadBtn');
const statusBox = document.getElementById('status');
const qrCanvas = document.getElementById('qrCanvas');
const qrGallery = document.getElementById('qrGallery');
const SIGNATURE = 'D_c0mrade';
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;
const MAX_QR_PAYLOAD_LENGTH = 1400;
let uploadedFile = null;

function setStatus(message, type = '') {
  statusBox.textContent = message;
  statusBox.classList.remove('error', 'success');
  if (type) statusBox.classList.add(type);
}

function renderSingleQrToCanvas(payload, targetCanvas, showSignature = true) {
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const moduleSize = 10;
  const padding = 20;
  const canvasSize = moduleCount * moduleSize + padding * 2;

  targetCanvas.width = canvasSize;
  targetCanvas.height = canvasSize;

  const ctx = targetCanvas.getContext('2d');
  ctx.clearRect(0, 0, canvasSize, canvasSize);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  for (let row = 0; row < moduleCount; row += 1) {
    for (let col = 0; col < moduleCount; col += 1) {
      if (!qr.isDark(row, col)) continue;
      ctx.fillStyle = '#111827';
      ctx.fillRect(padding + col * moduleSize, padding + row * moduleSize, moduleSize, moduleSize);
    }
  }

  if (!showSignature) return;

  const centerBox = Math.max(60, Math.min(110, moduleCount * moduleSize * 0.22));
  const centerX = canvasSize / 2 - centerBox / 2;
  const centerY = canvasSize / 2 - centerBox / 2;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(centerX, centerY, centerBox, centerBox);

  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX, centerY, centerBox, centerBox);

  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold ${Math.max(10, centerBox * 0.18)}px Arial`;
  ctx.fillText('D_c0mrade', canvasSize / 2, canvasSize / 2);
}

async function buildQrPayload() {
  const textValue = qrText.value.trim();
  const links = [
    (teraboxUrlInput.value || '').trim(),
    (teraboxUrlInput2.value || '').trim(),
    (teraboxUrlInput3.value || '').trim(),
    (teraboxUrlInput4.value || '').trim(),
  ].filter(Boolean);

  const lines = [`Signature: ${SIGNATURE}`];

  if (textValue) {
    lines.push(`Text: ${textValue}`);
  }

  links.forEach((link, index) => {
    lines.push(`URL ${index + 1}: ${link}`);
  });

  if (!textValue && links.length === 0) {
    throw new Error('Please type some text or paste at least one URL before generating the QR code.');
  }

  const payload = lines.join('\n');

  if (payload.length > MAX_QR_PAYLOAD_LENGTH) {
    throw new Error('This content is too large for one QR code. Please use shorter text or fewer links.');
  }

  return payload;
}

generateBtn.addEventListener('click', async () => {
  try {
    const payload = await buildQrPayload();
    renderSingleQrToCanvas(payload, qrCanvas, true);
    qrGallery.innerHTML = '';
    setStatus('Single QR generated. Scan it to see the full data.', 'success');
  } catch (error) {
    setStatus(error.message || 'QR generation failed. Please try again.', 'error');
    console.error(error);
  }
});

downloadBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'qr-code.png';
  link.href = qrCanvas.toDataURL('image/png');
  link.click();
});

function showOnlyScanner() {
  generatorSection.classList.add('hidden');
  qrSection.classList.add('hidden');
  scannerPanel.classList.remove('hidden');
  scanStatus.textContent = 'Camera is ready when you start scanning.';
  scanResultBox.classList.add('hidden');
}

function showMainWorkspace() {
  generatorSection.classList.remove('hidden');
  qrSection.classList.remove('hidden');
  scannerPanel.classList.add('hidden');
  stopScanner();
}

scanBtn.addEventListener('click', () => {
  showOnlyScanner();
});

closeScannerBtn.addEventListener('click', () => {
  showMainWorkspace();
});

let cameraStream = null;
let scannerLoop = null;

function stopScanner() {
  if (scannerLoop) {
    cancelAnimationFrame(scannerLoop);
    scannerLoop = null;
  }

  if (cameraStream) {
    cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
  }

  if (scanVideo) {
    scanVideo.srcObject = null;
  }
}

async function startCameraScanner() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    scanStatus.textContent = 'This browser does not support camera scanning.';
    return;
  }

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    });

    scanVideo.srcObject = cameraStream;
    await scanVideo.play();
    scanStatus.textContent = 'Scanning in progress...';
    scanResultBox.classList.add('hidden');
    scanFrame();
  } catch (error) {
    scanStatus.textContent = 'Camera access was blocked. Please allow camera permission or upload an image.';
    console.error(error);
  }
}

function scanFrame() {
  if (!cameraStream || !scanVideo.videoWidth || !scanVideo.videoHeight) {
    scannerLoop = requestAnimationFrame(scanFrame);
    return;
  }

  const video = scanVideo;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const code = typeof jsQR !== 'undefined' ? jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' }) : null;

  if (code) {
    handleScannedData(code.data);
    return;
  }

  if (window.BarcodeDetector) {
    const detector = new BarcodeDetector({ formats: ['qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e'] });
    detector.detect(canvas)
      .then((results) => {
        if (results && results.length && results[0] && results[0].rawValue) {
          handleScannedData(results[0].rawValue);
          return;
        }
        scannerLoop = requestAnimationFrame(scanFrame);
      })
      .catch(() => {
        scannerLoop = requestAnimationFrame(scanFrame);
      });
    return;
  }

  scannerLoop = requestAnimationFrame(scanFrame);
}

function handleScannedData(data) {
  if (!data) return;

  scanStatus.textContent = 'Code detected successfully.';
  scanResult.value = data;
  scanResultBox.classList.remove('hidden');
  stopScanner();
}

startScanBtn.addEventListener('click', () => {
  stopScanner();
  startCameraScanner();
});

scanFileInput.addEventListener('change', (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (loadEvent) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, img.width, img.height);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = typeof jsQR !== 'undefined' ? jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'dontInvert' }) : null;

      if (code) {
        handleScannedData(code.data);
      } else {
        scanStatus.textContent = 'No code found in the image. Try another image.';
      }
    };
    img.src = loadEvent.target.result;
  };
  reader.readAsDataURL(file);
  scanFileInput.value = '';
});

copyScanBtn.addEventListener('click', async () => {
  if (!scanResult.value) return;
  try {
    await navigator.clipboard.writeText(scanResult.value);
    scanStatus.textContent = 'Scanned data copied to clipboard.';
  } catch {
    scanStatus.textContent = 'Copy failed. You can still select and copy manually.';
  }
});

downloadScanBtn.addEventListener('click', () => {
  if (!scanResult.value) return;
  const blob = new Blob([scanResult.value], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'scanned-data.txt';
  link.click();
  URL.revokeObjectURL(link.href);
});

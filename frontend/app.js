// Student Achievement Tracker — frontend app logic.
// Plain JS, no framework/build step (per brief). Single-page state machine
// toggling five <section class="screen"> blocks in index.html.
//
// Loaded as a native ES module (see index.html) because current pdf.js
// versions only ship as .mjs — there's no classic UMD build to load via a
// plain <script> tag anymore.
import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.1.200/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.1.200/pdf.worker.min.mjs';

const state = {
  rollNo: '',
  file: null,       // the selected/captured File
  fileType: null,   // 'pdf' | 'image'
  fields: null       // structured fields from Gemini, pre-fill for confirm screen
};

// ---- DOM refs ----
const screens = {
  home: document.getElementById('screen-home'),
  preview: document.getElementById('screen-preview'),
  processing: document.getElementById('screen-processing'),
  confirm: document.getElementById('screen-confirm'),
  done: document.getElementById('screen-done')
};

const rollNoInput = document.getElementById('rollNoInput');
const scanBtn = document.getElementById('scanBtn');
const uploadBtn = document.getElementById('uploadBtn');
const cameraInput = document.getElementById('cameraInput');
const fileInput = document.getElementById('fileInput');

const previewArea = document.getElementById('previewArea');
const confirmPreviewArea = document.getElementById('confirmPreviewArea');
const retakeBtn = document.getElementById('retakeBtn');
const proceedBtn = document.getElementById('proceedBtn');

const processingStatus = document.getElementById('processingStatus');
const processingError = document.getElementById('processingError');
const processingBackBtn = document.getElementById('processingBackBtn');

const confirmRollNo = document.getElementById('confirmRollNo');
const confirmName = document.getElementById('confirmName');
const confirmCertType = document.getElementById('confirmCertType');
const confirmCertTypeOther = document.getElementById('confirmCertTypeOther');
const confirmCertTypeOtherHint = document.getElementById('confirmCertTypeOtherHint');
const confirmPositionRank = document.getElementById('confirmPositionRank');
const confirmEvent = document.getElementById('confirmEvent');
const confirmIssuingBody = document.getElementById('confirmIssuingBody');
const confirmDate = document.getElementById('confirmDate');
const confirmError = document.getElementById('confirmError');
const startOverBtn = document.getElementById('startOverBtn');
const submitBtn = document.getElementById('submitBtn');

const doneTitle = document.getElementById('doneTitle');
const doneMessage = document.getElementById('doneMessage');
const doneFileLink = document.getElementById('doneFileLink');
const submitAnotherBtn = document.getElementById('submitAnotherBtn');

// ---- Screen helper ----
function showScreen(name) {
  Object.values(screens).forEach((el) => el.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

// ---- Home screen ----
rollNoInput.addEventListener('input', () => {
  state.rollNo = rollNoInput.value.trim();
  const enabled = state.rollNo.length > 0;
  scanBtn.disabled = !enabled;
  uploadBtn.disabled = !enabled;
});

scanBtn.addEventListener('click', () => cameraInput.click());
uploadBtn.addEventListener('click', () => fileInput.click());

cameraInput.addEventListener('change', (e) => handleFileSelected(e.target.files[0]));
fileInput.addEventListener('change', (e) => handleFileSelected(e.target.files[0]));

function handleFileSelected(file) {
  if (!file) return;
  state.file = file;
  state.fileType = file.type === 'application/pdf' ? 'pdf' : 'image';
  // reset inputs so selecting the same file again still fires 'change'
  cameraInput.value = '';
  fileInput.value = '';
  renderPreview(file, previewArea);
  showScreen('preview');
}

// ---- Preview rendering (used on both the Preview screen and, so students
// can visually cross-check fields like Name/Event while editing, the
// Confirm screen) ----
//
// PDFs are shown via the browser's own native PDF viewer in an iframe
// (blob: URL), not pdf.js canvas rendering. pdf.js's page.render() proved
// unreliable here: it needs a same-origin worker (the CDN-hosted worker
// triggers cross-origin Worker issues in some browsers) and, even after
// working around that, the render() call itself could hang indefinitely.
// The native viewer sidesteps all of that, and as a bonus supports
// scrolling multi-page certificates and the browser's own zoom controls.
// pdf.js is still used for text extraction (extractPdfText), which doesn't
// touch rendering and has been reliable.
let lastPreviewObjectUrl = null;

function renderPreview(file, container) {
  container.innerHTML = '';
  if (lastPreviewObjectUrl) {
    URL.revokeObjectURL(lastPreviewObjectUrl);
  }
  const objectUrl = URL.createObjectURL(file);
  lastPreviewObjectUrl = objectUrl;

  if (state.fileType === 'image') {
    const img = document.createElement('img');
    img.src = objectUrl;
    container.appendChild(img);
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = objectUrl;
    iframe.className = 'pdf-frame';
    iframe.title = 'Certificate preview';
    container.appendChild(iframe);
  }

  const fullSizeLink = document.createElement('a');
  fullSizeLink.href = objectUrl;
  fullSizeLink.target = '_blank';
  fullSizeLink.rel = 'noopener';
  fullSizeLink.className = 'view-full-size';
  fullSizeLink.textContent = 'View full size ↗';
  container.appendChild(fullSizeLink);
}

retakeBtn.addEventListener('click', () => {
  state.file = null;
  state.fileType = null;
  showScreen('home');
});

proceedBtn.addEventListener('click', () => {
  showScreen('processing');
  processingError.classList.add('hidden');
  processingBackBtn.classList.add('hidden');
  runPipeline().catch((err) => {
    processingStatus.textContent = 'Something went wrong.';
    processingError.textContent = err.message || String(err);
    processingError.classList.remove('hidden');
    processingBackBtn.classList.remove('hidden');
  });
});

processingBackBtn.addEventListener('click', () => showScreen('preview'));

// ---- Processing pipeline: extract text -> Gemini structuring -> confirm screen ----
async function runPipeline() {
  processingStatus.textContent = state.fileType === 'pdf'
    ? 'Extracting text from PDF...'
    : 'Reading certificate (this can take a few seconds)...';

  const rawText = state.fileType === 'pdf'
    ? await extractPdfText(state.file)
    : await runOcr(state.file);

  processingStatus.textContent = 'Structuring data with AI...';
  state.fields = await callStructureApi(rawText);

  populateConfirmScreen();
  await renderPreview(state.file, confirmPreviewArea);
  showScreen('confirm');
}

async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => item.str).join(' ') + '\n';
  }
  return text;
}

function runOcr(file) {
  return Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        processingStatus.textContent = 'Reading certificate... ' + Math.round(m.progress * 100) + '%';
      }
    }
  }).then((result) => result.data.text);
}

async function callStructureApi(text) {
  const response = await fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body: JSON.stringify({ action: 'structure', text })
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to structure certificate data.');
  }
  return result.fields;
}

// ---- Confirm screen ----
// The three fixed categories; anything else (a custom phrase from Gemini, or
// the student's own wording) is treated as "Other" with free text.
const FIXED_CERT_TYPES = ['Participation', 'Appreciation', 'Merit'];

function toggleCertTypeOther() {
  const isOther = confirmCertType.value === 'Other';
  confirmCertTypeOther.classList.toggle('hidden', !isOther);
  confirmCertTypeOtherHint.classList.toggle('hidden', !isOther);
}

confirmCertType.addEventListener('change', () => {
  toggleCertTypeOther();
  if (confirmCertType.value === 'Other') confirmCertTypeOther.focus();
});

function populateConfirmScreen() {
  const fields = state.fields || {};
  confirmRollNo.value = state.rollNo;
  confirmName.value = fields['Name'] || '';

  const certType = fields['Certificate Type'] || 'Participation';
  if (FIXED_CERT_TYPES.includes(certType)) {
    confirmCertType.value = certType;
    confirmCertTypeOther.value = '';
  } else {
    confirmCertType.value = 'Other';
    confirmCertTypeOther.value = certType;
  }
  toggleCertTypeOther();

  confirmPositionRank.value = fields['Position/Rank'] || '';
  confirmEvent.value = fields['Event/Course/Activity'] || '';
  confirmIssuingBody.value = fields['Issuing Body'] || '';
  confirmDate.value = fields['Date'] || '';
  confirmError.classList.add('hidden');
}

startOverBtn.addEventListener('click', () => resetToHome());

submitBtn.addEventListener('click', () => {
  submitCertificate().catch((err) => {
    confirmError.textContent = err.message || String(err);
    confirmError.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit';
  });
});

async function submitCertificate() {
  const certificateType = confirmCertType.value === 'Other'
    ? confirmCertTypeOther.value.trim()
    : confirmCertType.value;

  const payload = {
    action: 'submit',
    rollNo: confirmRollNo.value.trim(),
    name: confirmName.value.trim(),
    certificateType,
    positionRank: confirmPositionRank.value,
    event: confirmEvent.value.trim(),
    issuingBody: confirmIssuingBody.value.trim(),
    date: confirmDate.value.trim()
  };

  const missing = ['rollNo', 'name', 'certificateType', 'event', 'issuingBody', 'date'].filter((key) => !payload[key]);
  if (missing.length) {
    throw new Error(missing.includes('certificateType')
      ? 'Please describe the certificate type (you selected "Other").'
      : 'Please fill in all fields before submitting.');
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  const base64 = await fileToBase64(state.file);
  payload.fileName = state.file.name || ('capture_' + Date.now() + (state.fileType === 'pdf' ? '.pdf' : '.jpg'));
  payload.mimeType = state.file.type || (state.fileType === 'pdf' ? 'application/pdf' : 'image/jpeg');
  payload.fileBase64 = base64;

  const response = await fetch(CONFIG.WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Submission failed.');
  }

  doneTitle.textContent = 'Submitted';
  doneMessage.textContent = 'Your certificate has been recorded.';
  doneFileLink.href = result.fileUrl;
  doneFileLink.classList.remove('hidden');
  submitBtn.disabled = false;
  submitBtn.textContent = 'Submit';
  showScreen('done');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

// ---- Done screen ----
submitAnotherBtn.addEventListener('click', () => resetToHome());

function resetToHome() {
  state.file = null;
  state.fileType = null;
  state.fields = null;
  doneFileLink.classList.add('hidden');
  showScreen('home');
}

// ---- PWA install ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // Non-fatal: app still works without offline shell caching.
    });
  });
}

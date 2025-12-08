// Configure PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

const uploadForm = document.getElementById('uploadForm');
const fileInput = document.getElementById('fileInput');
const messageDiv = document.getElementById('message');
const submitBtn = document.getElementById('submitBtn');
const clearBtn = document.getElementById('clearBtn');
const loading = document.getElementById('loading');
const fileInputLabel = document.getElementById('fileInputLabel');
const filesList = document.getElementById('filesList');
const colorTypeInputs = document.querySelectorAll('input[name="colorType"]');
const costDisplay = document.getElementById('costDisplay');
const totalCostSpan = document.getElementById('totalCost');
const paymentSection = document.getElementById('paymentSection');

// --- আপনার ngrok লিংক (শেষে /upload সহ) ---
const SERVER_UPLOAD_URL = 'https://jace-nonpuristic-carter.ngrok-free.dev/upload';
const SIMULATE_PAYMENT = false;

let selectedFiles = [];
let totalPages = 0;

fileInput.addEventListener('change', (e) => {
  if (!e.target.files) return;
  addFiles(e.target.files);
});

fileInputLabel.addEventListener('dragover', (e) => {
  e.preventDefault();
  fileInputLabel.classList.add('drag-over');
});
fileInputLabel.addEventListener('dragleave', () => fileInputLabel.classList.remove('drag-over'));
fileInputLabel.addEventListener('drop', (e) => {
  e.preventDefault();
  fileInputLabel.classList.remove('drag-over');
  if (e.dataTransfer && e.dataTransfer.files) {
    addFiles(e.dataTransfer.files);
  }
});

function updateFilesList() {
  filesList.innerHTML = '';
  selectedFiles.forEach((item, index) => {
    const file = item.file;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'file-item';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

    const pc = item.pageCount || 0; // ডিফল্ট ০ ধরছি যাতে লজিক কাজ করে
    const fromVal = item.from ? parseInt(item.from, 10) : null;
    const toVal = item.to ? parseInt(item.to, 10) : null;

    let selectedCount = '...';

    // --- Page Count Logic Fix ---
    if (item.isImage) {
        selectedCount = 1;
    } else if (pc > 0) {
        // PDF-এর জন্য লজিক
        if (fromVal && toVal && toVal >= fromVal) {
            selectedCount = Math.max(0, Math.min(toVal, pc) - Math.max(fromVal, 1) + 1);
        } else {
            selectedCount = pc;
        }
    } else {
        // DOCX বা অন্য ফাইলের জন্য (যেখানে পেজ অজানা)
        if (fromVal && toVal && toVal >= fromVal) {
            selectedCount = (toVal - fromVal) + 1;
        } else {
            selectedCount = "Auto"; // ইউজারকে বুঝানো
        }
    }
    // ----------------------------

    // HTML Rendering
    let inputsHTML = '';
    if (!item.isImage) {
        inputsHTML = `
            <label style="font-weight:600">From</label>
            <input type="number" min="1" class="file-from" data-index="${index}" value="${item.from || ''}" style="width:60px; padding:5px;">
            <span>to</span>
            <input type="number" min="1" class="file-to" data-index="${index}" value="${item.to || ''}" style="width:60px; padding:5px;">
        `;
    }

    itemDiv.innerHTML = `
        <div class="file-left">
            <div class="file-name">${file.name} (${sizeMB} MB)</div>
            <div style="font-size:0.9em; color:#444; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                ${inputsHTML}
                <span style="margin-left:8px; color:#666;">Total: <strong>${pc > 0 ? pc : '?'}</strong></span>
                <span style="margin-left:8px; color:#666;">Select: <strong>${selectedCount}</strong></span>
            </div>
        </div>
        <div style="margin-left:12px;">
            <button type="button" onclick="removeFile(${index})">Remove</button>
        </div>
    `;
    filesList.appendChild(itemDiv);
  });

  // Event Listeners
  filesList.querySelectorAll('.file-from').forEach(inp => {
    inp.addEventListener('change', (e) => {
      setFileRange(parseInt(e.target.dataset.index), e.target.value, selectedFiles[parseInt(e.target.dataset.index)].to);
    });
  });
  filesList.querySelectorAll('.file-to').forEach(inp => {
    inp.addEventListener('change', (e) => {
      setFileRange(parseInt(e.target.dataset.index), selectedFiles[parseInt(e.target.dataset.index)].from, e.target.value);
    });
  });
}

function setFileRange(index, from, to) {
  if (!selectedFiles[index]) return;
  selectedFiles[index].from = from ? String(from) : '';
  selectedFiles[index].to = to ? String(to) : '';
  updateCost();
}

function addFiles(fileList) {
  Array.from(fileList).forEach(f => {
    const isImage = /^image\//.test(f.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name);
    selectedFiles.push({ file: f, from: '', to: '', pageCount: 0, isImage });
  });
  updateFilesList();
  estimatePageCount();
}

window.removeFile = function(index) {
  selectedFiles.splice(index, 1);
  fileInput.value = '';
  updateFilesList();
  estimatePageCount();
};

async function estimatePageCount() {
  if (selectedFiles.length === 0) {
    totalPages = 0;
    updateCost();
    return;
  }
  await Promise.all(selectedFiles.map(async (item) => {
    if (item.pageCount > 0) return; // Already counted
    try {
      if (item.file.name.toLowerCase().endsWith('.pdf') && window.pdfjsLib) {
        const arrayBuffer = await item.file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        item.pageCount = pdf.numPages;
      } else if (item.isImage) {
        item.pageCount = 1;
      }
    } catch (e) { console.error(e); }
  }));
  updateCost();
}

function updateCost() {
  const colorType = document.querySelector('input[name="colorType"]:checked').value;
  const price = colorType === 'bw' ? 2 : 3;

  let pages = selectedFiles.reduce((sum, item) => {
    const pc = item.pageCount || 1; // Fallback 1 for cost calc
    const from = parseInt(item.from) || null;
    const to = parseInt(item.to) || null;

    if (from && to && to >= from) {
       // Manual range logic
       if (item.pageCount > 0) return sum + (Math.min(to, pc) - from + 1);
       return sum + (to - from + 1);
    }
    return sum + pc;
  }, 0);

  totalCostSpan.textContent = pages * price;
  document.getElementById('paymentPages').textContent = pages;
  document.getElementById('paymentAmount').textContent = (pages * price) + ' Taka';
  updateFilesList();
}

colorTypeInputs.forEach(input => input.addEventListener('change', updateCost));
clearBtn.addEventListener('click', () => { selectedFiles = []; updateFilesList(); updateCost(); paymentSection.classList.remove('show'); });

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (selectedFiles.length === 0) return showMessage('Select file', 'error');
  await estimatePageCount();
  paymentSection.classList.add('show');
  const type = document.querySelector('input[name="colorType"]:checked').value;
  document.getElementById('paymentFiles').textContent = selectedFiles.length;
  document.getElementById('paymentType').textContent = type === 'bw' ? 'B&W' : 'Color';
  submitBtn.disabled = true;
});

// Payment & Upload Logic
async function processPayment(gateway) {
  loading.classList.add('show');
  try {
    const formData = new FormData();
    const fileRanges = selectedFiles.map(item => ({
        name: item.file.name,
        from: item.from,
        to: item.to,
        isImage: item.isImage // isImage পাঠানো হচ্ছে
    }));

    selectedFiles.forEach(item => formData.append('files', item.file));
    formData.append('fileRanges', JSON.stringify(fileRanges));
    formData.append('colorType', document.querySelector('input[name="colorType"]:checked').value);
    formData.append('gateway', gateway);

    const res = await fetch(SERVER_UPLOAD_URL, { method: 'POST', body: formData });
    const result = await res.json();
    loading.classList.remove('show');

    if (res.ok) {
        showMessage('✅ Payment Successful! Printing...', 'success');
        selectedFiles = []; updateFilesList(); updateCost();
        paymentSection.classList.remove('show');
    } else {
        showMessage('❌ ' + result.error, 'error');
    }
    submitBtn.disabled = false;
  } catch (err) {
    loading.classList.remove('show');
    showMessage('❌ Connection Error', 'error');
    submitBtn.disabled = false;
  }
}

// Modal Logic
const modal = document.getElementById('confirmModal');
let pGateway = null;
function showConfirm(msg, gw) {
    document.getElementById('confirmMessage').textContent = msg;
    pGateway = gw;
    modal.classList.add('show');
}
document.getElementById('confirmOk').onclick = () => { modal.classList.remove('show'); if(pGateway) processPayment(pGateway); };
document.getElementById('confirmCancel').onclick = () => modal.classList.remove('show');

document.getElementById('stripeBtn').onclick = () => showConfirm('Pay via Stripe?', 'Stripe');
document.getElementById('bkashBtn').onclick = () => showConfirm('Pay via bKash?', 'bKash');
document.getElementById('nagadBtn').onclick = () => showConfirm('Pay via Nagad?', 'Nagad');

function showMessage(text, type) {
    messageDiv.textContent = text; messageDiv.className = 'show ' + type;
    setTimeout(() => messageDiv.className = '', 5000);
}
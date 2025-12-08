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
const totalCostSpan = document.getElementById('totalCost');
const paymentSection = document.getElementById('paymentSection');

// --- আপনার ngrok লিংক (শেষে /upload সহ) ---
const SERVER_UPLOAD_URL = 'https://jace-nonpuristic-carter.ngrok-free.dev/upload';
const SIMULATE_PAYMENT = false;

let selectedFiles = [];
// selectedFiles স্ট্রাকচার এখন: { file, from, to, pageCount, isImage, quantity }

fileInput.addEventListener('change', (e) => {
  if (!e.target.files || e.target.files.length === 0) return;
  addFiles(e.target.files);
  // ফাইল সিলেক্ট করার পরই ইনপুট ক্লিয়ার করা হচ্ছে যাতে একই ফাইল আবার সিলেক্ট করা যায়
  fileInput.value = '';
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

function addFiles(fileList) {
  Array.from(fileList).forEach(f => {
    // ডুপ্লিকেট চেকিং বাদ দেওয়া হলো যাতে ইউজার একই ফাইল বারবার এড করতে পারে যদি চায়
    // অথবা ডুপ্লিকেট আটকাতে চাইলে নিচের ২ লাইন আনকমেন্ট করুন
    /*
    const isDuplicate = selectedFiles.some(existing => existing.file.name === f.name && existing.file.size === f.size);
    if (isDuplicate) return;
    */

    const isImage = /^image\//.test(f.type) || /\.(jpe?g|png|gif|bmp|webp)$/i.test(f.name);
    // ডিফল্ট quantity = 1
    selectedFiles.push({ file: f, from: '', to: '', pageCount: 0, isImage, quantity: 1 });
  });
  updateFilesList();
  estimatePageCount();
}

function updateFilesList() {
  filesList.innerHTML = '';
  selectedFiles.forEach((item, index) => {
    const file = item.file;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'file-item';
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);

    const pc = item.pageCount || 0;

    // Page selection display logic
    const fromVal = item.from ? parseInt(item.from, 10) : null;
    const toVal = item.to ? parseInt(item.to, 10) : null;
    let pagesPerCopy = 1;

    if (item.isImage) {
        pagesPerCopy = 1;
    } else if (pc > 0) {
        if (fromVal && toVal && toVal >= fromVal) {
            pagesPerCopy = Math.max(0, Math.min(toVal, pc) - Math.max(fromVal, 1) + 1);
        } else {
            pagesPerCopy = pc;
        }
    } else {
        if (fromVal && toVal && toVal >= fromVal) {
            pagesPerCopy = (toVal - fromVal) + 1;
        }
    }

    let inputsHTML = '';
    if (!item.isImage) {
        inputsHTML = `
            <label style="font-weight:600">Pg:</label>
            <input type="number" min="1" class="file-from" data-index="${index}" value="${item.from || ''}" placeholder="Start" style="width:50px; padding:4px;">
            <span>-</span>
            <input type="number" min="1" class="file-to" data-index="${index}" value="${item.to || ''}" placeholder="End" style="width:50px; padding:4px;">
        `;
    }

    itemDiv.innerHTML = `
        <div class="file-left">
            <div class="file-name">${file.name} (${sizeMB} MB)</div>
            <div style="font-size:0.9em; color:#444; display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top:5px;">
                ${inputsHTML}
                
                <div class="qty-controls">
                    <button type="button" class="qty-btn" onclick="changeQty(${index}, -1)">-</button>
                    <span class="qty-display">${item.quantity} Copy</span>
                    <button type="button" class="qty-btn" onclick="changeQty(${index}, 1)">+</button>
                </div>

                <span style="color:#666;">Total Pages: <strong>${pagesPerCopy * item.quantity}</strong></span>
            </div>
        </div>
        <div style="margin-left:12px;">
            <button type="button" onclick="removeFile(${index})" style="background:#ff4757; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">✕</button>
        </div>
    `;
    filesList.appendChild(itemDiv);
  });

  // Listeners for inputs
  filesList.querySelectorAll('.file-from').forEach(inp => {
    inp.addEventListener('change', (e) => setFileRange(parseInt(e.target.dataset.index), e.target.value, selectedFiles[parseInt(e.target.dataset.index)].to));
  });
  filesList.querySelectorAll('.file-to').forEach(inp => {
    inp.addEventListener('change', (e) => setFileRange(parseInt(e.target.dataset.index), selectedFiles[parseInt(e.target.dataset.index)].from, e.target.value));
  });
}

// Global functions for inline onclick
window.changeQty = function(index, delta) {
    const item = selectedFiles[index];
    if (!item) return;
    let newQty = item.quantity + delta;
    if (newQty < 1) newQty = 1; // Minimum 1 copy
    item.quantity = newQty;
    updateFilesList();
    updateCost();
};

window.removeFile = function(index) {
  selectedFiles.splice(index, 1);
  updateFilesList();
  estimatePageCount(); // Will recalculate cost
};

function setFileRange(index, from, to) {
  if (!selectedFiles[index]) return;
  selectedFiles[index].from = from ? String(from) : '';
  selectedFiles[index].to = to ? String(to) : '';
  updateCost();
}

async function estimatePageCount() {
  if (selectedFiles.length === 0) {
    totalPages = 0;
    updateCost();
    return;
  }
  await Promise.all(selectedFiles.map(async (item) => {
    if (item.pageCount > 0) return;
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

  let totalCalculatedPages = selectedFiles.reduce((sum, item) => {
    const pc = item.pageCount || 1;
    const from = parseInt(item.from) || null;
    const to = parseInt(item.to) || null;
    let pagesPerCopy = pc;

    if (from && to && to >= from) {
       if (item.pageCount > 0) pagesPerCopy = Math.min(to, pc) - from + 1;
       else pagesPerCopy = to - from + 1;
    }

    // Multiply by quantity
    return sum + (pagesPerCopy * item.quantity);
  }, 0);

  totalCostSpan.textContent = totalCalculatedPages * price;

  if(document.getElementById('paymentPages')) {
      document.getElementById('paymentPages').textContent = totalCalculatedPages;
      document.getElementById('paymentCopies').textContent = selectedFiles.reduce((acc, i) => acc + i.quantity, 0);
      document.getElementById('paymentAmount').textContent = (totalCalculatedPages * price) + ' Taka';
  }

  // Do not call updateFilesList here to avoid input focus loss
}

// Reset Function (Fix for "File not selecting" issue)
function resetUI() {
    selectedFiles = [];
    fileInput.value = ''; // Important: Reset file input
    filesList.innerHTML = '';
    totalPages = 0;
    updateCost();
    paymentSection.classList.remove('show');
    submitBtn.disabled = false;
}

colorTypeInputs.forEach(input => input.addEventListener('change', updateCost));
clearBtn.addEventListener('click', resetUI);

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

// Payment Logic
async function processPayment(gateway) {
  loading.classList.add('show');
  try {
    if (SIMULATE_PAYMENT) {
      await new Promise(r => setTimeout(r, 1000));
      loading.classList.remove('show');
      showMessage('Demo Payment Successful', 'success');
      resetUI();
      return;
    }

    const formData = new FormData();
    const fileRanges = selectedFiles.map(item => ({
        name: item.file.name,
        from: item.from,
        to: item.to,
        isImage: item.isImage,
        quantity: item.quantity // Quantity সার্ভারে পাঠানো হচ্ছে
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
        resetUI(); // সফল হওয়ার পর সবকিছু ক্লিয়ার
    } else {
        showMessage('❌ ' + result.error, 'error');
        submitBtn.disabled = false;
    }
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

let messageTimer = null;
function showMessage(text, type) {
    if (messageTimer) clearTimeout(messageTimer);
    messageDiv.textContent = text;
    messageDiv.className = 'show ' + type;
    messageTimer = setTimeout(() => messageDiv.className = '', 5000);
}
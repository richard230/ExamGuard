// ===== CONFIGURATION =====
const API_BASE_URL = 'https://examguard-8rxe.onrender.com';
const CONFIG = {
  SCHOOL_BACKEND_URL: 'https://examguard-8rxe.onrender.com',
  UNIVERSAL_SERVER_URL: 'https://examguard-8rxe.onrender.com',
  FETCH_ENDPOINT: 'https://examguard-8rxe.onrender.com/api/results',
  UPLOAD_ENDPOINT: 'https://examguard-8rxe.onrender.com/api/results/upsert',
  API_KEY: localStorage.getItem('apiKey') || '',
  MAX_FILE_SIZE: 50 * 1024 * 1024,
};

// ===== STATE MANAGEMENT =====
const AppState = {
  files: [],
  data: [],
  uploadProgress: { total: 0, success: 0, failed: 0 },
  isUploading: false,
  isValidating: false,
  isSyncedFromBackend: false,
  schoolMetadata: {
    schoolId: '',
    schoolName: '',
    backendUrl: '',
    syncedAt: null,
    recordCount: 0,
    verified: false
  }
};

// ===== FILE HANDLING =====
function setupFileUpload() {
  const fileUploadArea = document.getElementById('fileUploadArea');
  const fileInput = document.getElementById('fileInput');

  fileUploadArea.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files);
    handleFiles(files);
  });

  fileUploadArea.addEventListener('dragover', handleDragOver);
  fileUploadArea.addEventListener('dragleave', handleDragLeave);
  fileUploadArea.addEventListener('drop', handleDrop);
}

function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('fileUploadArea').classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('fileUploadArea').classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  document.getElementById('fileUploadArea').classList.remove('dragover');
  const files = Array.from(e.dataTransfer.files);
  handleFiles(files);
}

function handleFiles(files) {
  const validFiles = files.filter(file => {
    if (file.size > CONFIG.MAX_FILE_SIZE) {
      showAlert('error', `File "${file.name}" exceeds 50MB limit`);
      return false;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['json', 'csv', 'xlsx'].includes(ext)) {
      showAlert('error', `File type ".${ext}" not supported`);
      return false;
    }
    return true;
  });

  if (validFiles.length > 0) {
    AppState.files = validFiles;
    AppState.isSyncedFromBackend = false;
    displayFiles();
    parseAndValidateFiles(validFiles);
  }
}

function displayFiles() {
  const fileList = document.getElementById('fileList');
  fileList.innerHTML = AppState.files.map((file, idx) => `
    <div class="file-item">
      <div class="file-item-info">
        <div class="file-item-icon">
          <i class="fas fa-${getFileIcon(file.name)}"></i>
        </div>
        <div class="file-item-details">
          <div class="file-item-name">${file.name}</div>
          <div class="file-item-size">${formatFileSize(file.size)}</div>
        </div>
      </div>
      <button type="button" class="file-item-remove" onclick="removeFile(${idx})">
        <i class="fas fa-trash"></i>
      </button>
    </div>
  `).join('');
}

function removeFile(idx) {
  AppState.files.splice(idx, 1);
  AppState.data = [];
  AppState.isSyncedFromBackend = false;
  displayFiles();
  document.getElementById('previewContent').style.display = 'block';
  document.getElementById('previewTable').style.display = 'none';
  showAlert('info', 'File removed');
}

function getFileIcon(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  return ext === 'json' ? 'file-code' : ext === 'csv' ? 'table' : 'file-excel';
}

function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// ===== FILE PARSING =====
async function parseAndValidateFiles(files) {
  AppState.data = [];

  for (const file of files) {
    try {
      const content = await file.text();
      const ext = file.name.split('.').pop().toLowerCase();

      let parsedData = [];
      if (ext === 'json') {
        parsedData = JSON.parse(content);
      } else if (ext === 'csv') {
        parsedData = parseCSV(content);
      } else if (ext === 'xlsx') {
        showAlert('warning', 'XLSX support requires additional processing');
        continue;
      }

      AppState.data = AppState.data.concat(Array.isArray(parsedData) ? parsedData : [parsedData]);
      showAlert('success', `Loaded ${parsedData.length || 1} records from ${file.name}`);
    } catch (err) {
      showAlert('error', `Failed to parse ${file.name}: ${err.message}`);
    }
  }

  if (AppState.data.length > 0) {
    updatePreview();
  }
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    data.push(obj);
  }

  return data;
}

// ===== PREVIEW =====
function updatePreview() {
  const previewContent = document.getElementById('previewContent');
  const previewTable = document.getElementById('previewTable');
  const previewHeader = document.getElementById('previewHeader');
  const previewBody = document.getElementById('previewBody');

  if (AppState.data.length === 0) {
    previewContent.style.display = 'block';
    previewTable.style.display = 'none';
    return;
  }

  previewContent.style.display = 'none';
  previewTable.style.display = 'block';

  const firstRecord = AppState.data[0];
  const keys = Object.keys(firstRecord);

  previewHeader.innerHTML = keys.map(key => `<th>${key}</th>`).join('') + '<th>Status</th>';
  previewBody.innerHTML = AppState.data.slice(0, 10).map(record => `
    <tr>
      ${keys.map(key => `<td>${record[key]}</td>`).join('')}
      <td><span class="status-badge status-pending">Pending</span></td>
    </tr>
  `).join('');

  if (AppState.data.length > 10) {
    previewBody.innerHTML += `<tr><td colspan="${keys.length + 1}" class="text-center" style="padding: 20px; color: var(--text-light);">Showing 10 of ${AppState.data.length} records</td></tr>`;
  }

  document.getElementById('totalRecords').textContent = AppState.data.length;
}

// ===== FETCH FROM BACKEND (STEP 1) =====
async function fetchFromBackend() {
  const backendUrl = document.getElementById('backendUrlInput')?.value.trim();
  const apiKey = document.getElementById('apiKeyInput')?.value.trim();
  const session = document.getElementById('sessionInput')?.value;
  const term = document.getElementById('termInput')?.value;
  const className = document.getElementById('classInput')?.value;

  if (!backendUrl) {
    showAlert('error', 'Please enter backend URL');
    return;
  }

  // Validate and normalize the URL
  let validUrl;
  try {
    const urlToTest = backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`;
    validUrl = new URL(urlToTest);
  } catch (err) {
    showAlert('error', 'Invalid backend URL format. Use: https://example.com or https://example.com/api');
    return;
  }

  const fetchBtn = event.target;
  const originalText = fetchBtn.innerHTML;
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<span class="spinner"></span><span>Syncing from Backend...</span>';

  try {
    // Build the fetch URL
    let endpoint = validUrl.pathname.endsWith('/') ? validUrl.pathname : validUrl.pathname + '/';
    if (!endpoint.includes('/api/results')) {
      endpoint += 'api/results/';
    }
    
    const fetchUrl = new URL(validUrl.origin + endpoint + 'dashboard/all');
    
    // Add query parameters for filtering (optional)
    if (session) fetchUrl.searchParams.set('session', session);
    if (term) fetchUrl.searchParams.set('term', term);
    if (className) fetchUrl.searchParams.set('class', className);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      // ✅ AUTO-SAVE API KEY TO LOCALSTORAGE ON SUCCESSFUL SYNC
      saveApiKeyToStorage(apiKey);
    }

    console.log('Fetching from:', fetchUrl.toString());

    const response = await fetch(fetchUrl.toString(), { 
      method: 'GET',
      headers, 
      mode: 'cors' 
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Response error:', errorData);
      throw new Error(`HTTP ${response.status}: ${errorData}`);
    }

    const data = await response.json();
    AppState.data = Array.isArray(data) ? data : [data];
    
    // Mark as synced from backend
    AppState.isSyncedFromBackend = true;
    
    // Store school metadata for cloud push
    AppState.schoolMetadata = {
      schoolId: '',
      schoolName: '',
      backendUrl: backendUrl,
      syncedAt: new Date().toISOString(),
      recordCount: AppState.data.length,
      verified: false
    };
    
    updatePreview();
    showAlert('success', `✓ Synced ${AppState.data.length} records from backend`);
    
    // Show cloud push section
    showCloudPushOption();
    
  } catch (err) {
    console.error('Fetch error:', err);
    showAlert('error', `Sync failed: ${err.message}`);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = originalText;
  }
}

// ===== AUTO-SAVE API KEY TO STORAGE =====
function saveApiKeyToStorage(apiKey) {
  try {
    if (apiKey && apiKey.trim().length > 0) {
      localStorage.setItem('apiKey', apiKey.trim());
      CONFIG.API_KEY = apiKey.trim();
      console.log('✓ API key saved to localStorage');
    }
  } catch (err) {
    console.error('Error saving API key:', err);
  }
}

// ===== SHOW CLOUD PUSH OPTION (Dynamic UI) =====
function showCloudPushOption() {
  let cloudPushSection = document.getElementById('cloudPushSection');
  
  if (!cloudPushSection) {
    const formContainer = document.querySelector('.button-group');
    if (!formContainer) return;
    
    cloudPushSection = document.createElement('div');
    cloudPushSection.id = 'cloudPushSection';
    cloudPushSection.style.cssText = 'margin-top: 28px; padding-top: 20px; border-top: 2px solid var(--accent-light);';
    cloudPushSection.innerHTML = `
      <h3 style="margin: 0 0 20px 0; color: var(--primary); font-size: 1.1rem; font-weight: 800;">
        <i class="fas fa-cloud-arrow-up" style="margin-right: 8px;"></i>
        Push to Universal Cloud
      </h3>
      
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">
            School ID <span class="required">*</span>
          </label>
          <input type="text" class="form-input" id="schoolIdInput" placeholder="e.g., SCH-2024-001" required>
          <span class="form-hint">Unique identifier for your school (will be verified)</span>
        </div>
        
        <div class="form-group">
          <label class="form-label">
            School Name <span class="required">*</span>
          </label>
          <input type="text" class="form-input" id="schoolNameInput" placeholder="e.g., Central High School" readonly>
          <span class="form-hint">Auto-populated after School ID verification</span>
        </div>
      </div>

      <div style="padding: 12px; background: var(--accent-light); border-radius: 6px; margin-bottom: 20px; display: none;" id="schoolVerificationInfo">
        <p style="margin: 0; font-size: 0.9rem; color: var(--primary);">
          <i class="fas fa-check-circle" style="margin-right: 6px;"></i>
          <span id="verificationMessage">School verified successfully</span>
        </p>
      </div>
      
      <div class="button-group" style="margin-top: 20px; border-top: none; padding-top: 0;">
        <button type="button" class="btn btn-primary" onclick="pushToUniversalCloud(event)">
          <i class="fas fa-cloud-arrow-up"></i>
          <span>Push to Universal Cloud</span>
        </button>
        <button type="button" class="btn btn-secondary" onclick="hideCloudPushOption()">
          <i class="fas fa-times"></i>
          <span>Cancel</span>
        </button>
        <button type="button" class="btn btn-outline" onclick="viewSyncHistory()">
          <i class="fas fa-history"></i>
          <span>View Sync History</span>
        </button>
      </div>
    `;
    
    formContainer.parentNode.insertBefore(cloudPushSection, formContainer.nextSibling);

    // Add event listener for School ID input to auto-verify
    const schoolIdInput = document.getElementById('schoolIdInput');
    if (schoolIdInput) {
      schoolIdInput.addEventListener('change', verifySchoolId);
      schoolIdInput.addEventListener('blur', verifySchoolId);
    }
  } else {
    cloudPushSection.style.display = 'block';
  }
}

// ===== HIDE CLOUD PUSH OPTION =====
function hideCloudPushOption() {
  const cloudPushSection = document.getElementById('cloudPushSection');
  if (cloudPushSection) {
    cloudPushSection.style.display = 'none';
  }
}

// ===== VERIFY SCHOOL ID =====
async function verifySchoolId() {
  const schoolIdInput = document.getElementById('schoolIdInput');
  const schoolNameInput = document.getElementById('schoolNameInput');
  const verificationInfo = document.getElementById('schoolVerificationInfo');
  const verificationMessage = document.getElementById('verificationMessage');

  const schoolId = schoolIdInput?.value.trim();

  if (!schoolId) {
    verificationInfo.style.display = 'none';
    schoolNameInput.value = '';
    AppState.schoolMetadata.verified = false;
    return;
  }

  try {
    console.log('Verifying School ID:', schoolId);

    const response = await fetch(`${CONFIG.SCHOOL_BACKEND_URL}/api/schools/by-id/${encodeURIComponent(schoolId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      mode: 'cors'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      const school = result.data;
      schoolNameInput.value = school.schoolName || '';
      AppState.schoolMetadata.verified = true;
      AppState.schoolMetadata.schoolId = schoolId;
      AppState.schoolMetadata.schoolName = school.schoolName || '';

      if (verificationMessage) {
        verificationMessage.textContent = `✓ School verified: ${school.schoolName}`;
      }
      verificationInfo.style.display = 'block';
      
      showAlert('success', `✓ School ID verified: ${school.schoolName}`);
    } else {
      throw new Error('School not found');
    }
  } catch (err) {
    console.error('School verification error:', err);
    schoolNameInput.value = '';
    AppState.schoolMetadata.verified = false;
    verificationInfo.style.display = 'none';
    showAlert('error', `School ID verification failed: ${err.message}`);
  }
}

// ===== PUSH TO UNIVERSAL CLOUD (STEP 2) - REFACTORED =====
async function pushToUniversalCloud(e) {
  e?.preventDefault?.();
  
  if (AppState.data.length === 0) {
    showAlert('error', 'No data to push. Sync from backend first.');
    return;
  }

  const schoolId = document.getElementById('schoolIdInput')?.value.trim();
  const schoolName = document.getElementById('schoolNameInput')?.value.trim();

  if (!schoolId || !schoolName || !AppState.schoolMetadata.verified) {
    showAlert('error', 'Please verify School ID before pushing');
    return;
  }

  let apiKey = CONFIG.API_KEY || localStorage.getItem('apiKey');
  if (!apiKey) {
    showAlert('error', 'API key not found');
    return;
  }

  const pushBtn = event?.target || document.querySelector('[onclick*="pushToUniversalCloud"]');
  const originalText = pushBtn?.innerHTML;
  
  if (pushBtn) {
    pushBtn.disabled = true;
    pushBtn.innerHTML = '<span class="spinner"></span><span>Pushing to Cloud...</span>';
  }

  try {
    // ✅ NEW ENDPOINT: /api/cloud/sync
    const payload = {
      schoolId,
      schoolName,
      results: AppState.data,
      sourceType: 'school_backend',
      upsert: true,
      metadata: {
        backendUrl: AppState.schoolMetadata?.backendUrl || null,
        syncedAt: new Date().toISOString()
      }
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    };

    // ✅ Changed endpoint from /api/results/upsert to /api/cloud/sync
    const response = await fetch(`${CONFIG.UNIVERSAL_SERVER_URL}/api/cloud/sync`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      mode: 'cors'
    });

    const result = await response.json();

    if (result.success) {
      showAlert('success', `✓ Upload received (ID: ${result.uploadId}). Processing in background...`);
      
      logCloudSync({
        uploadId: result.uploadId,
        schoolId,
        schoolName,
        recordsCount: AppState.data.length,
        status: result.status,
        timestamp: new Date().toISOString()
      });

      setTimeout(() => resetForm(), 2000);
    } else {
      showAlert('error', `Upload failed: ${result.error}`);
    }
  } catch (err) {
    console.error('Cloud push error:', err);
    showAlert('error', `Cloud push failed: ${err.message}`);
  } finally {
    if (pushBtn) {
      pushBtn.disabled = false;
      pushBtn.innerHTML = originalText;
    }
  }
}

// ===== LOG CLOUD SYNC =====
function logCloudSync(syncData) {
  try {
    const syncLogs = JSON.parse(localStorage.getItem('cloudSyncLogs') || '[]');
    syncLogs.push(syncData);
    
    // Keep only last 100 logs
    if (syncLogs.length > 100) {
      syncLogs.splice(0, syncLogs.length - 100);
    }
    
    localStorage.setItem('cloudSyncLogs', JSON.stringify(syncLogs));
    console.log('✓ Cloud sync logged:', syncData);
  } catch (err) {
    console.error('Error logging sync:', err);
  }
}

// ===== VIEW SYNC HISTORY =====
function viewSyncHistory() {
  try {
    const syncLogs = JSON.parse(localStorage.getItem('cloudSyncLogs') || '[]');
    
    if (syncLogs.length === 0) {
      showAlert('info', 'No cloud sync history found');
      return;
    }
    
    // Display sync history modal or table
    let historyHTML = `
      <div style="padding: 20px; background: var(--card-bg); border-radius: 10px; margin-top: 20px;">
        <h3 style="margin: 0 0 15px 0; color: var(--primary); font-weight: 800;">
          <i class="fas fa-history" style="margin-right: 8px;"></i>
          Cloud Sync History (Last ${syncLogs.length} records)
        </h3>
        <div class="table-responsive">
          <table class="table" style="font-size: 0.85rem;">
            <thead>
              <tr>
                <th>School ID</th>
                <th>School Name</th>
                <th>Records</th>
                <th>Success</th>
                <th>Failed</th>
                <th>Status</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    syncLogs.slice().reverse().forEach(log => {
      const statusBadge = log.status === 'success' 
        ? '<span class="status-badge status-success"><i class="fas fa-check"></i> Success</span>'
        : log.status === 'error'
        ? '<span class="status-badge status-error"><i class="fas fa-times"></i> Error</span>'
        : '<span class="status-badge status-pending"><i class="fas fa-clock"></i> Pending</span>';
      
      historyHTML += `
        <tr>
          <td>${log.schoolId}</td>
          <td>${log.schoolName}</td>
          <td>${log.recordsCount}</td>
          <td>${log.successCount}</td>
          <td>${log.failedCount}</td>
          <td>${statusBadge}</td>
          <td>${new Date(log.timestamp).toLocaleString()}</td>
        </tr>
      `;
    });
    
    historyHTML += `
            </tbody>
          </table>
        </div>
      </div>
    `;
    
    // Create a temporary container and display it
    const historyContainer = document.getElementById('syncHistoryContainer');
    if (historyContainer) {
      historyContainer.innerHTML = historyHTML;
      historyContainer.style.display = 'block';
    } else {
      console.log('Sync History:\n', syncLogs);
      alert(`Sync History (${syncLogs.length} records):\n${JSON.stringify(syncLogs, null, 2)}`);
    }
  } catch (err) {
    console.error('Error viewing sync history:', err);
    showAlert('error', 'Failed to load sync history: ' + err.message);
  }
}

// ===== UPLOAD (FOR FILE-BASED UPLOADS) =====
document.addEventListener('DOMContentLoaded', () => {
  setupFileUpload();
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', uploadToUniversalServer);
  }
});

async function uploadToUniversalServer(e) {
  e.preventDefault();

  const session = document.getElementById('sessionInput')?.value;
  const term = document.getElementById('termInput')?.value;
  const className = document.getElementById('classInput')?.value;
  const subject = document.getElementById('subjectInput')?.value;
  const scoreType = document.getElementById('scoreTypeInput')?.value;

  if (!session || !term || !className || !subject || !scoreType) {
    showAlert('error', 'Please fill in all required fields');
    return;
  }

  if (AppState.data.length === 0) {
    showAlert('error', 'No data to upload. Please select a file or fetch from backend');
    return;
  }

  AppState.isUploading = true;
  AppState.uploadProgress = { total: AppState.data.length, success: 0, failed: 0 };

  const progressSection = document.getElementById('progressSection');
  const submitBtn = document.getElementById('submitBtn');
  const uploadForm = document.getElementById('uploadForm');

  if (progressSection) progressSection.classList.add('show');
  if (submitBtn) submitBtn.disabled = true;
  if (uploadForm) {
    uploadForm.style.opacity = '0.6';
    uploadForm.style.pointerEvents = 'none';
  }

  try {
    await uploadBatch(session, term, className, subject, scoreType);
    updateStats();
    showAlert('success', `✓ Successfully uploaded ${AppState.uploadProgress.success}/${AppState.uploadProgress.total} records`);
  } catch (err) {
    showAlert('error', `Upload failed: ${err.message}`);
  } finally {
    AppState.isUploading = false;
    if (submitBtn) submitBtn.disabled = false;
    if (uploadForm) {
      uploadForm.style.opacity = '1';
      uploadForm.style.pointerEvents = 'auto';
    }
  }
}

async function uploadBatch(session, term, className, subject, scoreType) {
  const batchSize = 50;
  const batches = [];

  for (let i = 0; i < AppState.data.length; i += batchSize) {
    batches.push(AppState.data.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    const payload = {
      session,
      term,
      class: className,
      subject,
      resultType: scoreType,
      results: batch,
      upsert: true
    };

    try {
      const response = await fetch(`${CONFIG.UPLOAD_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        mode: 'cors'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const result = await response.json();

      if (result.success) {
        AppState.uploadProgress.success += result.inserted + result.updated;
        if (result.errors) {
          AppState.uploadProgress.failed += result.errors.length;
        }
      } else {
        AppState.uploadProgress.failed += batch.length;
      }
    } catch (err) {
      AppState.uploadProgress.failed += batch.length;
      console.error(`Batch ${batchIdx + 1} failed:`, err);
    }

    updateUploadProgress();
  }
}

function updateUploadProgress() {
  const { total, success, failed } = AppState.uploadProgress;
  const processed = success + failed;
  const percent = Math.round((processed / total) * 100);

  const progressPercent = document.getElementById('progressPercent');
  const progressBar = document.getElementById('progressBar');
  const processingCount = document.getElementById('processingCount');
  const successCount = document.getElementById('successCount');
  const failedCount = document.getElementById('failedCount');
  const totalUploadCount = document.getElementById('totalUploadCount');

  if (progressPercent) progressPercent.textContent = percent;
  if (progressBar) progressBar.style.width = percent + '%';
  if (processingCount) processingCount.textContent = total - processed;
  if (successCount) successCount.textContent = success;
  if (failedCount) failedCount.textContent = failed;
  if (totalUploadCount) totalUploadCount.textContent = total;
}

function updateStats() {
  const uploadedCount = document.getElementById('uploadedCount');
  const pendingCount = document.getElementById('pendingCount');
  const errorCount = document.getElementById('errorCount');

  if (uploadedCount) uploadedCount.textContent = AppState.uploadProgress.success;
  if (pendingCount) pendingCount.textContent = AppState.data.length - AppState.uploadProgress.success;
  if (errorCount) errorCount.textContent = AppState.uploadProgress.failed;
}

// ===== BULK OPERATIONS =====
async function executeBulkOperation() {
  const operationType = document.getElementById('bulkOperationType')?.value;
  const recordsInput = document.getElementById('recordsInput')?.value;

  if (!operationType) {
    showAlert('error', 'Please select an operation type');
    return;
  }

  const bulkStatusCard = document.getElementById('bulkStatusCard');
  if (bulkStatusCard) bulkStatusCard.style.display = 'block';

  const operationStatusText = document.getElementById('operationStatusText');
  if (operationStatusText) operationStatusText.textContent = `Executing ${operationType}...`;

  try {
    switch (operationType) {
      case 'merge':
        await executeMergeDuplicates();
        break;
      case 'publish':
        await executePublishDrafts();
        break;
      case 'sync':
        await executeSyncUniversal();
        break;
      case 'export':
        executeExportResults();
        break;
    }
    showAlert('success', 'Operation completed successfully');
  } catch (err) {
    showAlert('error', `Operation failed: ${err.message}`);
  }
}

async function executeMergeDuplicates() {
  const response = await fetch(`${CONFIG.UNIVERSAL_SERVER_URL}/api/results/merge-duplicates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors'
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const result = await response.json();

  const operationStatusText = document.getElementById('operationStatusText');
  const bulkSuccess = document.getElementById('bulkSuccess');

  if (operationStatusText) operationStatusText.textContent = `Merged ${result.mergedCount} duplicate groups`;
  if (bulkSuccess) bulkSuccess.textContent = result.mergedCount;
}

async function executePublishDrafts() {
  const response = await fetch(`${CONFIG.UNIVERSAL_SERVER_URL}/api/results?status=Draft`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    mode: 'cors'
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const drafts = await response.json();

  let published = 0;
  for (const draft of drafts) {
    try {
      const publishResponse = await fetch(`${CONFIG.UNIVERSAL_SERVER_URL}/api/results/${draft._id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });

      if (publishResponse.ok) published++;
    } catch (err) {
      console.error('Failed to publish:', err);
    }
  }

  const operationStatusText = document.getElementById('operationStatusText');
  const bulkSuccess = document.getElementById('bulkSuccess');

  if (operationStatusText) operationStatusText.textContent = `Published ${published}/${drafts.length} drafts`;
  if (bulkSuccess) bulkSuccess.textContent = published;
}

async function executeSyncUniversal() {
  if (AppState.data.length === 0) {
    throw new Error('No data available to sync');
  }

  const session = document.getElementById('sessionInput')?.value;
  const term = document.getElementById('termInput')?.value;
  const className = document.getElementById('classInput')?.value;
  const subject = document.getElementById('subjectInput')?.value;
  const scoreType = document.getElementById('scoreTypeInput')?.value;

  await uploadBatch(session, term, className, subject, scoreType);

  const operationStatusText = document.getElementById('operationStatusText');
  const bulkSuccess = document.getElementById('bulkSuccess');
  const bulkFailed = document.getElementById('bulkFailed');

  if (operationStatusText) operationStatusText.textContent = `Synced ${AppState.uploadProgress.success} records`;
  if (bulkSuccess) bulkSuccess.textContent = AppState.uploadProgress.success;
  if (bulkFailed) bulkFailed.textContent = AppState.uploadProgress.failed;
}

function executeExportResults() {
  if (AppState.data.length === 0) {
    showAlert('error', 'No data to export');
    return;
  }

  const session = document.getElementById('sessionInput')?.value || 'export';
  const dataStr = JSON.stringify(AppState.data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `results-${session}-${new Date().getTime()}.json`;
  link.click();
  URL.revokeObjectURL(url);

  const operationStatusText = document.getElementById('operationStatusText');
  const bulkSuccess = document.getElementById('bulkSuccess');

  if (operationStatusText) operationStatusText.textContent = `Exported ${AppState.data.length} records`;
  if (bulkSuccess) bulkSuccess.textContent = AppState.data.length;
}

function resetForm() {
  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) uploadForm.reset();

  const bulkOperationType = document.getElementById('bulkOperationType');
  if (bulkOperationType) bulkOperationType.value = '';

  const recordsInput = document.getElementById('recordsInput');
  if (recordsInput) recordsInput.value = '';

  AppState.files = [];
  AppState.data = [];
  AppState.isSyncedFromBackend = false;
  AppState.schoolMetadata = {
    schoolId: '',
    schoolName: '',
    backendUrl: '',
    syncedAt: null,
    recordCount: 0,
    verified: false
  };

  const fileList = document.getElementById('fileList');
  if (fileList) fileList.innerHTML = '';

  const previewContent = document.getElementById('previewContent');
  if (previewContent) previewContent.style.display = 'block';

  const previewTable = document.getElementById('previewTable');
  if (previewTable) previewTable.style.display = 'none';

  const progressSection = document.getElementById('progressSection');
  if (progressSection) progressSection.classList.remove('show');

  const bulkStatusCard = document.getElementById('bulkStatusCard');
  if (bulkStatusCard) bulkStatusCard.style.display = 'none';

  const cloudPushSection = document.getElementById('cloudPushSection');
  if (cloudPushSection) cloudPushSection.style.display = 'none';

  showAlert('info', 'Form reset');
}

// ===== ALERTS =====
function showAlert(type, message, duration = 5000) {
  const alertMap = {
    'success': 'successAlert',
    'error': 'errorAlert',
    'warning': 'warningAlert',
    'info': 'warningAlert'
  };

  const alertId = alertMap[type];
  if (!alertId) return;

  const alertEl = document.getElementById(alertId);
  if (!alertEl) return;

  const messageEl = alertEl.querySelector('.alert-message');
  if (messageEl) messageEl.textContent = message;
  
  alertEl.classList.add('show');

  setTimeout(() => {
    alertEl.classList.remove('show');
  }, duration);
}

// ===== TEMPLATE =====
function downloadTemplate() {
  const template = {
    templateVersion: '1.0',
    instructions: 'Fill in student results data. All fields except remarks are required.',
    sampleData: [
      {
        student_id: 'STU001',
        student_name: 'John Adeyemi',
        session: '2024/2025',
        term: 'First Term',
        class: 'JSS1A',
        subject: 'Mathematics',
        ca1_score: '12',
        ca2_score: '14',
        midterm_score: '35',
        exam_score: '65',
        grade: 'A',
        remarks: 'Excellent performance'
      },
      {
        student_id: 'STU002',
        student_name: 'Jane Smith',
        session: '2024/2025',
        term: 'First Term',
        class: 'JSS1A',
        subject: 'Mathematics',
        ca1_score: '10',
        ca2_score: '11',
        midterm_score: '28',
        exam_score: '58',
        grade: 'B',
        remarks: 'Very good performance'
      }
    ]
  };

  const dataStr = JSON.stringify(template, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'examguard-results-template.json';
  link.click();
  URL.revokeObjectURL(url);

  showAlert('success', 'Template downloaded successfully');
}

function showTemplateModal() {
  const template = {
    student_id: 'STU001',
    student_name: 'Student Name',
    session: '2024/2025',
    term: 'First Term',
    class: 'JSS1A',
    subject: 'Mathematics',
    ca1_score: '12',
    ca2_score: '14',
    midterm_score: '35',
    exam_score: '65',
    grade: 'A',
    remarks: 'Excellent'
  };

  const templateCode = document.getElementById('templateCode');
  if (templateCode) templateCode.textContent = JSON.stringify(template, null, 2);

  const templateModal = document.getElementById('templateModal');
  if (templateModal) templateModal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

function copyTemplate() {
  const templateCode = document.getElementById('templateCode');
  if (!templateCode) return;

  const code = templateCode.textContent;
  navigator.clipboard.writeText(code).then(() => {
    showAlert('success', 'Template copied to clipboard');
    closeModal('templateModal');
  }).catch(err => {
    console.error('Copy failed:', err);
    showAlert('error', 'Failed to copy template');
  });
}

// ===== NAVIGATION =====
function switchTab(tabId) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const targetTab = document.getElementById(tabId);
  if (targetTab) targetTab.classList.add('active');

  // Activate corresponding button
  if (event?.target) event.target.classList.add('active');
}

function navigateTab(tabName) {
  const pages = {
    'dashboard': 'dashboard.html',
    'upload': 'upload-data.html',
    'history': 'upload-history.html',
    'results': 'student-results.html',
    'settings': 'settings.html',
    'support': 'support.html'
  };

  if (pages[tabName]) {
    window.location.href = pages[tabName];
  }
}

// ===== MOBILE SIDEBAR =====
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('active');
}

// Close sidebar when clicking on nav items
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) sidebar.classList.remove('active');
  });
});

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  setupFileUpload();

  // Load API key from localStorage on page load
  const storedApiKey = localStorage.getItem('apiKey');
  if (storedApiKey) {
    CONFIG.API_KEY = storedApiKey;
    console.log('✓ API key loaded from localStorage');
  }

  // Set today's date in header
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Update stats on page load
  updateStats();

  console.log('✓ Result Verify loaded successfully');
});

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault();
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
      uploadForm.dispatchEvent(new Event('submit'));
    }
  }
});

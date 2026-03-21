
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
      isValidating: false
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
            // Note: Would need a library like xlsx for proper parsing
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

    // ===== FETCH FROM BACKEND =====
// ===== FETCH FROM BACKEND =====
async function fetchFromBackend() {
  const backendUrl = document.getElementById('backendUrlInput').value.trim();
  const apiKey = document.getElementById('apiKeyInput').value.trim();
  const session = document.getElementById('sessionInput').value;
  const term = document.getElementById('termInput').value;
  const className = document.getElementById('classInput').value;

  if (!backendUrl) {
    showAlert('error', 'Please enter backend URL');
    return;
  }

  // Validate and normalize the URL
  let validUrl;
  try {
    // If URL doesn't start with http/https, add https://
    const urlToTest = backendUrl.startsWith('http') ? backendUrl : `https://${backendUrl}`;
    validUrl = new URL(urlToTest);
  } catch (err) {
    showAlert('error', 'Invalid backend URL format. Use: https://example.com/api');
    return;
  }

  const fetchBtn = event.target;
  const originalText = fetchBtn.innerHTML;
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<span class="spinner"></span><span>Syncing...</span>';

  try {
    // Ensure URL ends with /api/results (adjust if needed)
    let endpoint = validUrl.pathname.endsWith('/') ? validUrl.pathname : validUrl.pathname + '/';
    if (!endpoint.includes('/api/results')) {
      endpoint += 'api/results';
    }
    
    // Use the /dashboard/all endpoint for fetching (GET method)
    const fetchUrl = new URL(validUrl.origin + endpoint + 'dashboard/all');
    
    // Add query parameters
    if (session) fetchUrl.searchParams.set('session', session);
    if (term) fetchUrl.searchParams.set('term', term);
    if (className) fetchUrl.searchParams.set('class', className);

    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    // GET request to /dashboard/all endpoint
    const response = await fetch(fetchUrl.toString(), { 
      method: 'GET',  // ← Explicitly specify GET
      headers, 
      mode: 'cors' 
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    AppState.data = Array.isArray(data) ? data : [data];
    updatePreview();
    showAlert('success', `Synced ${AppState.data.length} records from backend`);
  } catch (err) {
    showAlert('error', `Sync failed: ${err.message}`);
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = originalText;
  }
}

    // ===== UPLOAD =====
    document.addEventListener('DOMContentLoaded', () => {
      setupFileUpload();
      document.getElementById('uploadForm').addEventListener('submit', uploadToUniversalServer);
    });

    async function uploadToUniversalServer(e) {
      e.preventDefault();

      const session = document.getElementById('sessionInput').value;
      const term = document.getElementById('termInput').value;
            const className = document.getElementById('classInput').value;
      const subject = document.getElementById('subjectInput').value;
      const scoreType = document.getElementById('scoreTypeInput').value;

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

      document.getElementById('progressSection').classList.add('show');
      document.getElementById('submitBtn').disabled = true;
      document.getElementById('uploadForm').style.opacity = '0.6';
      document.getElementById('uploadForm').style.pointerEvents = 'none';

      try {
        await uploadBatch(session, term, className, subject, scoreType);
        updateStats();
        showAlert('success', `Successfully uploaded ${AppState.uploadProgress.success}/${AppState.uploadProgress.total} records`);
      } catch (err) {
        showAlert('error', `Upload failed: ${err.message}`);
      } finally {
        AppState.isUploading = false;
        document.getElementById('submitBtn').disabled = false;
        document.getElementById('uploadForm').style.opacity = '1';
        document.getElementById('uploadForm').style.pointerEvents = 'auto';
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

      document.getElementById('progressPercent').textContent = percent;
      document.getElementById('progressBar').style.width = percent + '%';
      document.getElementById('processingCount').textContent = total - processed;
      document.getElementById('successCount').textContent = success;
      document.getElementById('failedCount').textContent = failed;
      document.getElementById('totalUploadCount').textContent = total;
    }

    function updateStats() {
      document.getElementById('uploadedCount').textContent = AppState.uploadProgress.success;
      document.getElementById('pendingCount').textContent = AppState.data.length - AppState.uploadProgress.success;
      document.getElementById('errorCount').textContent = AppState.uploadProgress.failed;
    }

    // ===== BULK OPERATIONS =====
    async function executeBulkOperation() {
      const operationType = document.getElementById('bulkOperationType').value;
      const recordsInput = document.getElementById('recordsInput').value;

      if (!operationType) {
        showAlert('error', 'Please select an operation type');
        return;
      }

      document.getElementById('bulkStatusCard').style.display = 'block';
      document.getElementById('operationStatusText').textContent = `Executing ${operationType}...`;

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

      document.getElementById('operationStatusText').textContent = `Merged ${result.mergedCount} duplicate groups`;
      document.getElementById('bulkSuccess').textContent = result.mergedCount;
    }

    async function executePublishDrafts() {
      // Fetch all draft results
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

      document.getElementById('operationStatusText').textContent = `Published ${published}/${drafts.length} drafts`;
      document.getElementById('bulkSuccess').textContent = published;
    }

    async function executeSyncUniversal() {
      // Sync all current data with universal server
      if (AppState.data.length === 0) {
        throw new Error('No data available to sync');
      }

      const session = document.getElementById('sessionInput').value;
      const term = document.getElementById('termInput').value;
      const className = document.getElementById('classInput').value;
      const subject = document.getElementById('subjectInput').value;
      const scoreType = document.getElementById('scoreTypeInput').value;

      await uploadBatch(session, term, className, subject, scoreType);
      document.getElementById('operationStatusText').textContent = `Synced ${AppState.uploadProgress.success} records`;
      document.getElementById('bulkSuccess').textContent = AppState.uploadProgress.success;
      document.getElementById('bulkFailed').textContent = AppState.uploadProgress.failed;
    }

    function executeExportResults() {
      if (AppState.data.length === 0) {
        showAlert('error', 'No data to export');
        return;
      }

      const session = document.getElementById('sessionInput').value;
      const dataStr = JSON.stringify(AppState.data, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `results-${session}-${new Date().getTime()}.json`;
      link.click();
      URL.revokeObjectURL(url);

      document.getElementById('operationStatusText').textContent = `Exported ${AppState.data.length} records`;
      document.getElementById('bulkSuccess').textContent = AppState.data.length;
    }

    function resetForm() {
      document.getElementById('uploadForm').reset();
      document.getElementById('bulkOperationType').value = '';
      document.getElementById('recordsInput').value = '';
      AppState.files = [];
      AppState.data = [];
      document.getElementById('fileList').innerHTML = '';
      document.getElementById('previewContent').style.display = 'block';
      document.getElementById('previewTable').style.display = 'none';
      document.getElementById('progressSection').classList.remove('show');
      document.getElementById('bulkStatusCard').style.display = 'none';
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
      const messageEl = alertEl.querySelector('.alert-message');
      messageEl.textContent = message;
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
        ca1_score: '12',
        ca2_score: '14',
        midterm_score: '35',
        exam_score: '65',
        grade: 'A',
        remarks: 'Excellent'
      };

      document.getElementById('templateCode').textContent = JSON.stringify(template, null, 2);
      document.getElementById('templateModal').classList.add('active');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('active');
    }

    function copyTemplate() {
      const code = document.getElementById('templateCode').textContent;
      navigator.clipboard.writeText(code).then(() => {
        showAlert('success', 'Template copied to clipboard');
        closeModal('templateModal');
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
      document.getElementById(tabId).classList.add('active');

      // Activate corresponding button
      event.target.classList.add('active');
    }

    function navigateTab(tabName) {
      // This would navigate to different pages
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
      document.querySelector('.sidebar').classList.toggle('active');
    }

    // Close sidebar when clicking on nav items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelector('.sidebar').classList.remove('active');
      });
    });

    // ===== INITIALIZATION =====
    document.addEventListener('DOMContentLoaded', () => {
      setupFileUpload();

      // Set today's date in header
      const today = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Update stats on page load
      updateStats();
    });

    // ===== KEYBOARD SHORTCUTS =====
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        document.getElementById('uploadForm').dispatchEvent(new Event('submit'));
      }
    });
  

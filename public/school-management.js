// ===== CONFIGURATION =====
const CONFIG = {
  API_ENDPOINT: 'https://examguard-8rxe.onrender.com/api/schools',
  AUTH_TOKEN: localStorage.getItem('authToken') || ''
};

// ===== STATE MANAGEMENT =====
const AppState = {
  schools: [],
  currentEditSchool: null,
  importData: [],
  isLoading: false
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔄 Initializing School Management...');
  
  if (!CONFIG.AUTH_TOKEN) {
    console.warn('⚠️ No auth token found. Using public endpoints only.');
  }

  setupEventListeners();
  loadSchools();
  updateStats();
  setupImportHandling();
  console.log('✓ School Management initialized successfully');
});

function setupEventListeners() {
  // Search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', debounce((e) => {
      filterSchools(e.target.value);
    }, 300));
  }
}

// ===== UTILITIES =====
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showAlert('success', '✓ Copied to clipboard: ' + text);
  }).catch(err => {
    console.error('Copy failed:', err);
    showAlert('error', 'Failed to copy to clipboard');
  });
}

// ===== SCHOOL ID GENERATION (Preview) =====
function generateSchoolId() {
  const abbrevInput = document.getElementById('schoolAbbrevInput');
  const previewInput = document.getElementById('schoolIdPreview');

  if (!abbrevInput || !previewInput) return;

  const abbrev = abbrevInput.value.trim().toUpperCase();

  if (!abbrev) {
    previewInput.value = '';
    return;
  }

  // Generate random hex
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const previewId = `SCH-${abbrev}-${random}`;

  previewInput.value = previewId;
}

function regenerateSchoolId() {
  const abbrevInput = document.getElementById('schoolAbbrevInput');
  const previewInput = document.getElementById('schoolIdPreview');

  if (!abbrevInput || !previewInput) {
    showAlert('error', 'Form elements not found');
    return;
  }

  const abbrev = abbrevInput.value.trim().toUpperCase();

  if (!abbrev) {
    showAlert('error', 'Please enter school abbreviation first');
    return;
  }

  // Generate new random ID
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const newId = `SCH-${abbrev}-${random}`;

  previewInput.value = newId;
  showAlert('success', 'School ID regenerated: ' + newId);
}

// ===== CREATE SCHOOL =====
async function createSchool(e) {
  e.preventDefault();

  const nameInput = document.getElementById('schoolNameInput');
  const abbrevInput = document.getElementById('schoolAbbrevInput');
  const emailInput = document.getElementById('schoolEmailInput');
  const phoneInput = document.getElementById('schoolPhoneInput');
  const locationInput = document.getElementById('schoolLocationInput');
  const principalInput = document.getElementById('principalNameInput');
  const typeInput = document.getElementById('schoolTypeInput');
  const createBtn = document.getElementById('createBtn');

  const schoolName = nameInput?.value.trim();
  const abbreviation = abbrevInput?.value.trim().toUpperCase();
  const email = emailInput?.value.trim();
  const phone = phoneInput?.value.trim();
  const location = locationInput?.value.trim();
  const principal = principalInput?.value.trim();
  const schoolType = typeInput?.value;

  // Validate required fields
  if (!schoolName || !abbreviation || !email || !phone || !location || !schoolType) {
    showAlert('error', 'Please fill in all required fields');
    return;
  }

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAlert('error', 'Please enter a valid email address');
    return;
  }

  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = '<span class="spinner"></span><span>Creating...</span>';
  }

  try {
    const response = await fetch(CONFIG.API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(CONFIG.AUTH_TOKEN && { 'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}` })
      },
      body: JSON.stringify({
        schoolName,
        abbreviation,
        email,
        phone,
        location,
        principal: principal || undefined,
        schoolType,
        country: 'Nigeria' // Default
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message || 'Failed to create school');
    }

    showAlert('success', `✓ School created successfully!\nID: ${result.data.schoolId}`);
    
    // Reset form
    const form = document.getElementById('createSchoolForm');
    if (form) {
      form.reset();
      setTimeout(() => generateSchoolId(), 100);
    }
    
    // Reload schools
    await loadSchools();
    updateStats();

    // Switch to list tab
    setTimeout(() => {
      switchTab('list');
    }, 1500);

  } catch (err) {
    console.error('Error creating school:', err);
    showAlert('error', `Failed to create school: ${err.message}`);
  } finally {
    if (createBtn) {
      createBtn.disabled = false;
      createBtn.innerHTML = '<i class="fas fa-save"></i><span>Create School</span>';
    }
  }
}

// ===== LOAD SCHOOLS =====
async function loadSchools() {
  if (AppState.isLoading) return;
  
  AppState.isLoading = true;

  try {
    // Try API first
    let response;
    
    if (CONFIG.AUTH_TOKEN) {
      response = await fetch(`${CONFIG.API_ENDPOINT}/admin/all`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
        }
      });
    } else {
      // Fallback to public endpoint
      response = await fetch(CONFIG.API_ENDPOINT);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();

    if (result.success && result.data) {
      AppState.schools = result.data;
      console.log(`✓ Loaded ${AppState.schools.length} schools from API`);
    } else {
      AppState.schools = [];
    }

    displaySchools();
  } catch (err) {
    console.error('Error loading schools from API:', err);
    showAlert('error', `Failed to load schools: ${err.message}`);
    AppState.schools = [];
    displaySchools();
  } finally {
    AppState.isLoading = false;
  }
}

// ===== SEARCH SCHOOLS =====
function filterSchools(query) {
  if (!query || query.trim().length === 0) {
    displaySchools(AppState.schools);
    return;
  }

  const lowerQuery = query.toLowerCase();
  const filtered = AppState.schools.filter(school =>
    (school.schoolName && school.schoolName.toLowerCase().includes(lowerQuery)) ||
    (school.schoolId && school.schoolId.toLowerCase().includes(lowerQuery)) ||
    (school.email && school.email.toLowerCase().includes(lowerQuery)) ||
    (school.city && school.city.toLowerCase().includes(lowerQuery)) ||
    (school.state && school.state.toLowerCase().includes(lowerQuery))
  );

  displaySchools(filtered);
}

// ===== DISPLAY SCHOOLS =====
function displaySchools(schools = AppState.schools) {
  const schoolsList = document.getElementById('schoolsList');
  const emptyState = document.getElementById('emptyState');

  if (!schoolsList) return;

  if (!schools || schools.length === 0) {
    schoolsList.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  schoolsList.innerHTML = schools.map(school => `
    <div class="school-card">
      <div class="school-info">
        <h3 class="school-name">${escapeHtml(school.schoolName || 'N/A')}</h3>
        <p class="school-id">
          <i class="fas fa-key"></i> ID: <strong>${escapeHtml(school.schoolId || 'N/A')}</strong>
          ${school.schoolId ? `
            <button class="btn btn-small" style="margin-left: 8px; padding: 4px 8px;" onclick="copyToClipboard('${school.schoolId}')">
              <i class="fas fa-copy"></i>
            </button>
          ` : ''}
        </p>
        <div class="school-meta">
          <div style="margin-bottom: 4px;">
            <strong style="text-transform: capitalize;">${escapeHtml(school.schoolType || 'N/A')}</strong> 
            • <i class="fas fa-map-marker-alt"></i> ${escapeHtml(school.city || school.state || school.country || 'N/A')}
          </div>
          <div>
            <i class="fas fa-envelope"></i> ${escapeHtml(school.email || 'N/A')} 
            ${school.phone ? `• <i class="fas fa-phone"></i> ${escapeHtml(school.phone)}` : ''}
          </div>
          ${school.principal ? `<div><i class="fas fa-user-tie"></i> ${escapeHtml(school.principal)}</div>` : ''}
          ${school.adminName ? `<div><i class="fas fa-user"></i> Admin: ${escapeHtml(school.adminName)}</div>` : ''}
          <div style="margin-top: 8px;">
            <i class="fas fa-calendar"></i> Created: ${new Date(school.createdAt).toLocaleDateString()}
            <span class="status-badge ${school.status === 'active' ? 'status-active' : 'status-inactive'}" style="margin-left: 12px;">
              <i class="fas fa-${school.status === 'active' ? 'check-circle' : 'times-circle'}"></i>
              ${school.status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>
      <div class="school-actions">
        <button class="btn btn-icon edit" onclick="editSchool('${school._id || school.id}')" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-icon delete" onclick="deleteSchool('${school._id || school.id}', '${escapeHtml(school.schoolName)}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// ===== EDIT SCHOOL =====
async function editSchool(schoolId) {
  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/${schoolId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to fetch school');
    }

    const result = await response.json();
    const school = result.data;

    AppState.currentEditSchool = school;

    // Populate form
    const editNameInput = document.getElementById('editSchoolName');
    const editEmailInput = document.getElementById('editSchoolEmail');
    const editPhoneInput = document.getElementById('editSchoolPhone');
    const editLocationInput = document.getElementById('editSchoolLocation');
    const editStatusInput = document.getElementById('editSchoolStatus');

    if (editNameInput) editNameInput.value = school.schoolName || '';
    if (editEmailInput) editEmailInput.value = school.email || '';
    if (editPhoneInput) editPhoneInput.value = school.phone || '';
    if (editLocationInput) editLocationInput.value = school.city || '';
    if (editStatusInput) editStatusInput.value = school.status || 'active';

    const editModal = document.getElementById('editModal');
    if (editModal) editModal.classList.add('active');
  } catch (err) {
    console.error('Error fetching school:', err);
    showAlert('error', `Failed to load school: ${err.message}`);
  }
}

// ===== UPDATE SCHOOL =====
async function updateSchool(e) {
  e.preventDefault();

  if (!AppState.currentEditSchool) {
    showAlert('error', 'No school selected');
    return;
  }

  const editNameInput = document.getElementById('editSchoolName');
  const editEmailInput = document.getElementById('editSchoolEmail');
  const editPhoneInput = document.getElementById('editSchoolPhone');
  const editLocationInput = document.getElementById('editSchoolLocation');
  const editStatusInput = document.getElementById('editSchoolStatus');

  const schoolName = editNameInput?.value.trim();
  const email = editEmailInput?.value.trim();
  const phone = editPhoneInput?.value.trim();
  const location = editLocationInput?.value.trim();
  const status = editStatusInput?.value;

  if (!schoolName || !email || !phone || !location) {
    showAlert('error', 'Please fill in all required fields');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showAlert('error', 'Please enter a valid email address');
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/${AppState.currentEditSchool._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
      },
      body: JSON.stringify({
        schoolName,
        email,
        phone,
        city: location,
        status
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message);
    }

    showAlert('success', '✓ School updated successfully');
    closeModal('editModal');
    AppState.currentEditSchool = null;

    await loadSchools();
    updateStats();
  } catch (err) {
    console.error('Error updating school:', err);
    showAlert('error', `Failed to update school: ${err.message}`);
  }
}

// ===== DELETE SCHOOL =====
async function deleteSchool(schoolId, schoolName = 'School') {
  if (!confirm(`Are you sure you want to delete "${schoolName}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/${schoolId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
      }
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message);
    }

    showAlert('success', '✓ School deleted successfully');
    await loadSchools();
    updateStats();
  } catch (err) {
    console.error('Error deleting school:', err);
    showAlert('error', `Failed to delete school: ${err.message}`);
  }
}

// ===== IMPORT HANDLING =====
function setupImportHandling() {
  const importArea = document.getElementById('importArea');
  const importFileInput = document.getElementById('importFileInput');

  if (!importArea || !importFileInput) return;

  importArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    importArea.style.borderColor = 'var(--success)';
    importArea.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.05))';
  });

  importArea.addEventListener('dragleave', () => {
    importArea.style.borderColor = 'var(--accent-light)';
    importArea.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(30, 64, 175, 0.02))';
  });

  importArea.addEventListener('drop', (e) => {
    e.preventDefault();
    importArea.style.borderColor = 'var(--accent-light)';
    importArea.style.background = 'linear-gradient(135deg, rgba(59, 130, 246, 0.03), rgba(30, 64, 175, 0.02))';
    handleImportFile(e.dataTransfer.files[0]);
  });

  importFileInput.addEventListener('change', (e) => {
    handleImportFile(e.target.files[0]);
  });
}

function handleImportFile(file) {
  if (!file) return;

  const ext = file.name.split('.').pop().toLowerCase();

  if (!['csv', 'json'].includes(ext)) {
    showAlert('error', 'Please upload a CSV or JSON file');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let data = [];

      if (ext === 'csv') {
        data = parseCSV(e.target.result);
      } else if (ext === 'json') {
        data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) data = [data];
      }

      if (data.length === 0) {
        showAlert('error', 'No data found in file');
        return;
      }

      AppState.importData = data;
      previewImportData(data);
      showAlert('info', `File loaded: ${data.length} schools found`);
    } catch (err) {
      console.error('Parse error:', err);
      showAlert('error', `Failed to parse file: ${err.message}`);
    }
  };

  reader.readAsText(file);
}

function parseCSV(content) {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const data = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue;

    const values = lines[i].split(',').map(v => v.trim());
    const obj = {};
    headers.forEach((header, idx) => {
      obj[header] = values[idx] || '';
    });
    data.push(obj);
  }

  return data;
}

function previewImportData(data) {
  const preview = document.getElementById('importPreview');
  if (!preview) return;

  preview.innerHTML = `
    <div style="background: var(--bg-lighter); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
      <h4 style="margin: 0 0 12px 0; color: var(--primary); display: flex; align-items: center; gap: 8px;">
        <i class="fas fa-file-check"></i>
        Preview: <strong>${data.length}</strong> schools found
      </h4>
      <div class="table-responsive">
        <table class="table" style="font-size: 0.85rem;">
          <thead>
            <tr>
              <th>#</th>
              <th>School Name</th>
              <th>Email</th>
              <th>Country</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${data.slice(0, 5).map((school, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(school.schoolName || school.name || '-')}</td>
                <td>${escapeHtml(school.email || '-')}</td>
                <td>${escapeHtml(school.country || '-')}</td>
                <td><span style="text-transform: capitalize;">${escapeHtml(school.schoolType || school.type || '-')}</span></td>
              </tr>
            `).join('')}
            ${data.length > 5 ? `<tr><td colspan="5" style="text-align: center; color: var(--text-light); font-weight: 700;">... and ${data.length - 5} more schools</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const importBtn = document.getElementById('importBtn');
  const resetBtn = document.getElementById('resetImportBtn');

  if (importBtn) importBtn.style.display = 'inline-flex';
  if (resetBtn) resetBtn.style.display = 'inline-flex';
}

async function importSchools() {
  if (AppState.importData.length === 0) {
    showAlert('error', 'No data to import');
    return;
  }

  const importBtn = document.getElementById('importBtn');
  if (importBtn) {
    importBtn.disabled = true;
    importBtn.innerHTML = '<span class="spinner"></span><span>Importing...</span>';
  }

  try {
    const response = await fetch(`${CONFIG.API_ENDPOINT}/bulk-import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.AUTH_TOKEN}`
      },
      body: JSON.stringify({
        schools: AppState.importData
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || result.message);
    }

    const { data } = result;
    showAlert('success', `✓ Imported ${data.successful} schools successfully`);

    if (data.failed > 0) {
      console.warn('Import errors:', data.errors);
      showAlert('warning', `${data.successful} imported, ${data.failed} failed`);
    }

    await loadSchools();
    updateStats();
    resetImport();
  } catch (err) {
    console.error('Error importing schools:', err);
    showAlert('error', `Import failed: ${err.message}`);
  } finally {
    if (importBtn) {
      importBtn.disabled = false;
      importBtn.innerHTML = '<i class="fas fa-upload"></i><span>Import Schools</span>';
    }
  }
}

function resetImport() {
  AppState.importData = [];
  const fileInput = document.getElementById('importFileInput');
  if (fileInput) fileInput.value = '';

  const preview = document.getElementById('importPreview');
  if (preview) preview.innerHTML = '';

  const importBtn = document.getElementById('importBtn');
  const resetBtn = document.getElementById('resetImportBtn');

  if (importBtn) importBtn.style.display = 'none';
  if (resetBtn) resetBtn.style.display = 'none';
}

// ===== STATISTICS =====
function updateStats() {
  const total = AppState.schools.length;
  const active = AppState.schools.filter(s => s.status === 'active').length;
  const lastCreated = AppState.schools.length > 0
    ? new Date(AppState.schools[0].createdAt).toLocaleDateString()
    : '-';

  const totalEl = document.getElementById('totalSchools');
  const activeEl = document.getElementById('activeSchools');
  const lastEl = document.getElementById('lastUpdated');

  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (lastEl) lastEl.textContent = lastCreated;
}

// ===== TAB SWITCHING =====
function switchTab(tabName) {
  // Hide all tabs
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });

  // Deactivate all buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab
  const tab = document.getElementById(tabName + 'Tab');
  if (tab) {
    tab.classList.add('active');
  }

  // Activate corresponding button
  document.querySelectorAll('.tab-btn').forEach(btn => {
    if (btn.textContent.toLowerCase().includes(tabName.toLowerCase())) {
      btn.classList.add('active');
    }
  });
}

// ===== MODALS =====
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
}

// Close modal when clicking outside
document.addEventListener('click', (e) => {
  const modals = document.querySelectorAll('.modal');
  modals.forEach(modal => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});

// ===== ALERTS =====
function showAlert(type, message, duration = 4000) {
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

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    sidebar.classList.toggle('active');
  }
}

// Close sidebar when clicking on nav items
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const sidebar = document.querySelector('.sidebar');
      if (sidebar) sidebar.classList.remove('active');
    });
  });
});

// ===== EXPORT FUNCTIONALITY =====
function exportSchools(format = 'json') {
  if (AppState.schools.length === 0) {
    showAlert('error', 'No schools to export');
    return;
  }

  let content, filename, type;

  if (format === 'json') {
    content = JSON.stringify(AppState.schools, null, 2);
    filename = `schools-export-${new Date().getTime()}.json`;
    type = 'application/json';
  } else if (format === 'csv') {
    const headers = ['schoolId', 'schoolName', 'abbreviation', 'email', 'phone', 'city', 'country', 'schoolType', 'status', 'createdAt'];
    const rows = AppState.schools.map(school =>
      headers.map(h => {
        const value = school[h] || '';
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',')
    );
    content = [headers.join(','), ...rows].join('\n');
    filename = `schools-export-${new Date().getTime()}.csv`;
    type = 'text/csv';
  }

  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);

  showAlert('success', `✓ Exported ${AppState.schools.length} schools as ${format.toUpperCase()}`);
}

console.log('✓ School Management JavaScript loaded');

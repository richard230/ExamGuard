// ===== CONFIGURATION =====
const CONFIG = {
  STORAGE_KEY: 'examguard_schools',
  ID_PREFIX: 'SCH',
  API_ENDPOINT: 'https://examguard-8rxe.onrender.com/api/schools'
};

// ===== STATE MANAGEMENT =====
const AppState = {
  schools: [],
  currentEditSchool: null,
  importData: []
};

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadSchools();
  updateStats();
  setupImportHandling();
  generateSchoolId();
  console.log('✓ School Management loaded successfully');
});

function setupEventListeners() {
  // Form input listeners for auto-ID generation
  const schoolNameInput = document.getElementById('schoolNameInput');
  const schoolAbbrevInput = document.getElementById('schoolAbbrevInput');
  
  if (schoolNameInput) schoolNameInput.addEventListener('change', generateSchoolId);
  if (schoolAbbrevInput) schoolAbbrevInput.addEventListener('change', generateSchoolId);

  // Search functionality
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterSchools(e.target.value);
    });
  }
}

// ===== SCHOOL ID GENERATION =====
function generateSchoolId() {
  const nameInput = document.getElementById('schoolNameInput');
  const abbrevInput = document.getElementById('schoolAbbrevInput');
  const previewInput = document.getElementById('schoolIdPreview');

  if (!nameInput || !abbrevInput || !previewInput) return;

  const name = nameInput.value.trim();
  const abbrev = abbrevInput.value.trim().toUpperCase();

  if (!name || !abbrev) {
    previewInput.value = '';
    return;
  }

  // Format: SCH-ABBREV-XXXXXXX (random alphanumeric)
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  const schoolId = `${CONFIG.ID_PREFIX}-${abbrev}-${random}`;

  previewInput.value = schoolId;
}

function regenerateSchoolId() {
  const nameInput = document.getElementById('schoolNameInput');
  const abbrevInput = document.getElementById('schoolAbbrevInput');

  if (!nameInput || !abbrevInput) return;

  const name = nameInput.value.trim();
  const abbrev = abbrevInput.value.trim().toUpperCase();

  if (!name || !abbrev) {
    showAlert('error', 'Please enter school name and abbreviation first');
    return;
  }

  generateSchoolId();
  showAlert('success', 'School ID regenerated');
}

// ===== CREATE SCHOOL =====
async function createSchool(e) {
  e.preventDefault();

  const nameInput = document.getElementById('schoolNameInput');
  const idInput = document.getElementById('schoolIdPreview');
  const emailInput = document.getElementById('schoolEmailInput');
  const phoneInput = document.getElementById('schoolPhoneInput');
  const locationInput = document.getElementById('schoolLocationInput');
  const principalInput = document.getElementById('principalNameInput');
  const typeInput = document.getElementById('schoolTypeInput');
  const descInput = document.getElementById('schoolDescInput');
  const createBtn = document.getElementById('createBtn');

  if (!nameInput || !idInput || !emailInput || !locationInput || !typeInput) {
    showAlert('error', 'Required form elements not found');
    return;
  }

  const schoolName = nameInput.value.trim();
  const schoolId = idInput.value.trim();
  const email = emailInput.value.trim();
  const phone = phoneInput?.value.trim() || '';
  const location = locationInput.value.trim();
  const principal = principalInput?.value.trim() || '';
  const type = typeInput.value;
  const description = descInput?.value.trim() || '';

  if (!schoolName || !schoolId || !email || !location || !type) {
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
    // Check for duplicate ID
    if (AppState.schools.some(s => s.id === schoolId)) {
      showAlert('error', 'School ID already exists. Please regenerate a new one.');
      return;
    }

    const newSchool = {
      id: schoolId,
      name: schoolName,
      abbreviation: document.getElementById('schoolAbbrevInput')?.value.trim().toUpperCase() || '',
      email,
      phone,
      location,
      principal,
      type,
      description,
      status: 'active',
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString()
    };

    AppState.schools.push(newSchool);
    saveSchools();

    showAlert('success', `✓ School created successfully! ID: ${schoolId}`);
    
    // Reset form
    const form = document.getElementById('createSchoolForm');
    if (form) form.reset();
    generateSchoolId();
    
    updateStats();

    // Switch to list tab after delay
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
function loadSchools() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    if (stored) {
      AppState.schools = JSON.parse(stored);
      console.log(`✓ Loaded ${AppState.schools.length} schools`);
    } else {
      AppState.schools = [];
    }
    displaySchools();
  } catch (err) {
    console.error('Error loading schools:', err);
    AppState.schools = [];
    showAlert('error', 'Failed to load schools from storage');
  }
}

// ===== SAVE SCHOOLS =====
function saveSchools() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(AppState.schools));
    console.log('✓ Schools saved to storage');
  } catch (err) {
    console.error('Error saving schools:', err);
    showAlert('error', 'Failed to save schools to storage');
  }
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
        <h3 class="school-name">${escapeHtml(school.name)}</h3>
        <p class="school-id">
          <i class="fas fa-key"></i> ID: <strong>${escapeHtml(school.id)}</strong>
          <button class="btn btn-small" style="margin-left: 8px; padding: 4px 8px;" onclick="copyToClipboard('${school.id}')">
            <i class="fas fa-copy"></i>
          </button>
        </p>
        <div class="school-meta">
          <div style="margin-bottom: 4px;">
            <strong style="text-transform: capitalize;">${escapeHtml(school.type)}</strong> • <i class="fas fa-map-marker-alt"></i> ${escapeHtml(school.location)}
          </div>
          <div>
            <i class="fas fa-envelope"></i> ${escapeHtml(school.email)} 
            ${school.phone ? `• <i class="fas fa-phone"></i> ${escapeHtml(school.phone)}` : ''}
          </div>
          ${school.principal ? `<div><i class="fas fa-user-tie"></i> ${escapeHtml(school.principal)}</div>` : ''}
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
        <button class="btn btn-icon edit" onclick="editSchool('${school.id}')" title="Edit">
          <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-icon delete" onclick="deleteSchool('${school.id}')" title="Delete">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

// ===== FILTER SCHOOLS =====
function filterSchools(query) {
  if (!query || query.trim() === '') {
    displaySchools(AppState.schools);
    return;
  }

  const filtered = AppState.schools.filter(school =>
    school.name.toLowerCase().includes(query.toLowerCase()) ||
    school.id.toLowerCase().includes(query.toLowerCase()) ||
    school.email.toLowerCase().includes(query.toLowerCase()) ||
    school.location.toLowerCase().includes(query.toLowerCase())
  );

  displaySchools(filtered);
}

// ===== EDIT SCHOOL =====
function editSchool(schoolId) {
  const school = AppState.schools.find(s => s.id === schoolId);
  if (!school) {
    showAlert('error', 'School not found');
    return;
  }

  AppState.currentEditSchool = school;

  const editNameInput = document.getElementById('editSchoolName');
  const editIdInput = document.getElementById('editSchoolId');
  const editEmailInput = document.getElementById('editSchoolEmail');
  const editPhoneInput = document.getElementById('editSchoolPhone');
  const editLocationInput = document.getElementById('editSchoolLocation');
  const editStatusInput = document.getElementById('editSchoolStatus');

  if (editNameInput) editNameInput.value = school.name;
  if (editIdInput) editIdInput.value = school.id;
  if (editEmailInput) editEmailInput.value = school.email;
  if (editPhoneInput) editPhoneInput.value = school.phone || '';
  if (editLocationInput) editLocationInput.value = school.location;
  if (editStatusInput) editStatusInput.value = school.status;

  const editModal = document.getElementById('editModal');
  if (editModal) editModal.classList.add('active');
}

// ===== UPDATE SCHOOL =====
function updateSchool(e) {
  e.preventDefault();

  if (!AppState.currentEditSchool) {
    showAlert('error', 'No school selected for editing');
    return;
  }

  const editNameInput = document.getElementById('editSchoolName');
  const editEmailInput = document.getElementById('editSchoolEmail');
  const editPhoneInput = document.getElementById('editSchoolPhone');
  const editLocationInput = document.getElementById('editSchoolLocation');
  const editStatusInput = document.getElementById('editSchoolStatus');

  if (!editNameInput || !editEmailInput || !editLocationInput) {
    showAlert('error', 'Required form elements not found');
    return;
  }

  const updatedData = {
    name: editNameInput.value.trim(),
    email: editEmailInput.value.trim(),
    phone: editPhoneInput?.value.trim() || '',
    location: editLocationInput.value.trim(),
    status: editStatusInput?.value || 'active',
    lastModified: new Date().toISOString()
  };

  // Validate email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updatedData.email)) {
    showAlert('error', 'Please enter a valid email address');
    return;
  }

  const index = AppState.schools.findIndex(s => s.id === AppState.currentEditSchool.id);
  if (index !== -1) {
    AppState.schools[index] = { ...AppState.schools[index], ...updatedData };
    saveSchools();
    displaySchools();
    updateStats();
    showAlert('success', '✓ School updated successfully');
    closeModal('editModal');
    AppState.currentEditSchool = null;
  } else {
    showAlert('error', 'School not found');
  }
}

// ===== DELETE SCHOOL =====
function deleteSchool(schoolId) {
  const school = AppState.schools.find(s => s.id === schoolId);
  if (!school) {
    showAlert('error', 'School not found');
    return;
  }

  if (!confirm(`Are you sure you want to delete "${school.name}"? This action cannot be undone.`)) {
    return;
  }

  const index = AppState.schools.findIndex(s => s.id === schoolId);
  if (index !== -1) {
    const schoolName = AppState.schools[index].name;
    AppState.schools.splice(index, 1);
    saveSchools();
    displaySchools();
    updateStats();
    showAlert('success', `✓ School "${schoolName}" deleted`);
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
              <th>Location</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${data.slice(0, 5).map((school, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td>${escapeHtml(school.school_name || school.name || '-')}</td>
                <td>${escapeHtml(school.email || '-')}</td>
                <td>${escapeHtml(school.location || '-')}</td>
                <td><span style="text-transform: capitalize;">${escapeHtml(school.type || '-')}</span></td>
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

function importSchools() {
  if (AppState.importData.length === 0) {
    showAlert('error', 'No data to import');
    return;
  }

  let imported = 0;
  const errors = [];

  AppState.importData.forEach((item, idx) => {
    try {
      const schoolName = item.school_name || item.name;
      const abbrev = (item.abbreviation || item.abbrev || (schoolName || 'SCH').substring(0, 3)).toUpperCase();

      if (!schoolName || !item.email || !item.location) {
        errors.push(`Row ${idx + 2}: Missing required fields (name, email, location)`);
        return;
      }

      // Validate email
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.email)) {
        errors.push(`Row ${idx + 2}: Invalid email address`);
        return;
      }

      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      const schoolId = `${CONFIG.ID_PREFIX}-${abbrev}-${random}`;

      // Check for duplicate ID
      if (AppState.schools.some(s => s.id === schoolId)) {
        // Regenerate if duplicate
        const random2 = Math.random().toString(36).substring(2, 8).toUpperCase();
        schoolId = `${CONFIG.ID_PREFIX}-${abbrev}-${random2}`;
      }

      const newSchool = {
        id: schoolId,
        name: schoolName.trim(),
        abbreviation: abbrev,
        email: item.email.trim(),
        phone: (item.phone || '').trim(),
        location: item.location.trim(),
        principal: (item.principal || '').trim(),
        type: (item.type || 'secondary').toLowerCase(),
        description: (item.description || '').trim(),
        status: 'active',
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString()
      };

      AppState.schools.push(newSchool);
      imported++;
    } catch (err) {
      errors.push(`Row ${idx + 2}: ${err.message}`);
    }
  });

  if (imported > 0) {
    saveSchools();
    displaySchools();
    updateStats();
    showAlert('success', `✓ Successfully imported ${imported} schools`);

    if (errors.length > 0) {
      console.warn('Import errors:', errors);
      showAlert('warning', `${imported} schools imported, but ${errors.length} rows had errors. Check console for details.`);
    }
  } else {
    showAlert('error', 'Failed to import any schools. Please check the file format.');
  }

  resetImport();
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
    ? new Date(AppState.schools[AppState.schools.length - 1].createdAt).toLocaleDateString()
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

  // Activate corresponding button - find button with matching text
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

// ===== UTILITIES =====
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showAlert('success', '✓ Copied to clipboard: ' + text);
  }).catch(err => {
    console.error('Copy failed:', err);
    showAlert('error', 'Failed to copy to clipboard');
  });
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
    const headers = ['id', 'name', 'abbreviation', 'email', 'phone', 'location', 'principal', 'type', 'status', 'createdAt'];
    const rows = AppState.schools.map(school =>
      headers.map(h => `"${(school[h] || '').toString().replace(/"/g, '""')}"`).join(',')
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

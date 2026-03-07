const API_BASE_URL = "https://goldlincschools.onrender.com";
const token = localStorage.getItem('teacherToken') || localStorage.getItem('token') || "";

// --- Spinner overlay control ---
function showDashboardSpinner() {
  const loader = document.getElementById('loaderOverlay');
  if (loader) {
    loader.classList.remove('hidden');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
  }
}

function hideDashboardSpinner() {
  const loader = document.getElementById('loaderOverlay');
  if (loader) {
    loader.classList.add('hidden');
    setTimeout(() => { loader.style.display = 'none'; }, 300);
  }
}

// --- Sidebar Toggle ---
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('visible');
    overlay.classList.toggle('visible');
    document.body.style.overflow = sidebar.classList.contains('visible') ? 'hidden' : '';
  }
}

// --- Navigation ---
function navClick(event) {
  event.preventDefault();
  const section = event.currentTarget.getAttribute('data-section');
  
  // Update active nav link
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  event.currentTarget.classList.add('active');
  
  // Show section
  showSection(section);
  
  // Close sidebar on mobile
  if (window.innerWidth <= 768) {
    toggleSidebar();
  }
}

function showSection(sectionName) {
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    section.style.display = 'none';
  });
  
  // Show selected section
  const section = document.getElementById(`section-${sectionName}`);
  if (section) {
    section.style.display = 'block';
    updatePageInfo(sectionName);
    
    // Trigger section-specific rendering
    switch(sectionName) {
      case 'dashboard':
      case 'classes':
        renderClassesList();
        renderStudentsBlock();
        renderSubjectsBlock();
        showAddSubjectBlock();
        updateDashboardStats();
        break;
      case 'attendance':
        renderAttendance();
        break;
      case 'gradebook':
        renderGradebook();
        break;
      case 'assignments':
        renderAssignments();
        break;
      case 'cbtQuestions':
        renderCBTQuestionSection();
        break;
      case 'myCBTQuestions':
        showMyCBTQuestionsSection();
        break;
      case 'cbtResults':
        renderCBTResultsSection();
        break;
      case 'draftResults':
        renderDraftResults();
        break;
      case 'notifications':
        renderNotifications();
        break;
      case 'profile':
        populateProfileForm();
        break;
    }
  }
}

function updatePageInfo(sectionName) {
  const pageTitle = document.getElementById('pageTitle');
  const pageSubtitle = document.getElementById('pageSubtitle');
  
  const titles = {
    dashboard: { title: 'Welcome back', subtitle: 'Overview of your classes and activities' },
    classes: { title: 'My Classes', subtitle: 'Manage your assigned classes' },
    attendance: { title: 'Attendance', subtitle: 'Mark and manage student attendance' },
    gradebook: { title: 'Gradebook', subtitle: 'View and update student grades' },
    assignments: { title: 'Assignments', subtitle: 'Create and manage assignments' },
    cbtQuestions: { title: 'Create CBT', subtitle: 'Upload new computer-based tests' },
    myCBTQuestions: { title: 'My CBTs', subtitle: 'Manage your uploaded exams' },
    cbtResults: { title: 'CBT Results', subtitle: 'View student exam results' },
    draftResults: { title: 'Draft Results', subtitle: 'Manage draft result sheets' },
    notifications: { title: 'Notifications', subtitle: 'Your system notifications' },
    profile: { title: 'Settings', subtitle: 'Manage your profile & preferences' }
  };
  
  const info = titles[sectionName] || { title: 'Section', subtitle: '' };
  if (pageTitle) pageTitle.textContent = info.title;
  if (pageSubtitle) pageSubtitle.textContent = info.subtitle;
}

// --- DATA HOLDERS ---
let teacher = null;
let studentsByClass = {};
let subjectsByClass = {};
let notifications = [];
let draftResults = [];
let attendanceRecords = [];
let gradebookData = {};
let assignments = [];
let cbts = [];
let myUploadedCBTs = [];
let selectedCBTIds = [];
let teacherResults = [];

// ADD AT THE TOP (after data holders)
let cbtDraftKey = 'cbtDraft_current';
let cbtDraftRestoreWarned = false;

// --- UTILS FOR CBT DRAFT ---
function saveCBTDraftToLocalStorage() {
  const classId = document.getElementById('cbt-class-select')?.value || '';
  const subjectId = document.getElementById('cbt-subject-select')?.value || '';
  const title = document.getElementById('cbt-title')?.value || '';
  const duration = document.getElementById('cbt-duration')?.value || '';
  const draft = {
    classId, subjectId, title, duration,
    questions: JSON.parse(JSON.stringify(cbtQuestions))
  };
  localStorage.setItem(cbtDraftKey, JSON.stringify(draft));
}

function loadCBTDraftFromLocalStorage() {
  const raw = localStorage.getItem(cbtDraftKey);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function clearCBTDraftFromLocalStorage() {
  localStorage.removeItem(cbtDraftKey);
}

// --- INITIAL FETCH & SETUP ---
window.addEventListener('DOMContentLoaded', () => {
  showDashboardSpinner();
  fetchAndSetup();
});

async function fetchDraftResults() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results?status=Draft`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

function renderDraftResults() {
  const tbody = document.querySelector('#draft-results-table tbody');
  if (!draftResults.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted);">No draft results found.</td></tr>';
    return;
  }
  tbody.innerHTML = draftResults.map(r => `
    <tr>
      <td>${r.student?.name || '-'}</td>
      <td>${r.class?.name || '-'}</td>
      <td>${r.term || '-'}</td>
      <td><span style="padding: 4px 8px; background: #fef3c7; color: #92400e; border-radius: 4px; font-size: 0.85rem;">${r.status || '-'}</span></td>
      <td>${r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}</td>
      <td>
        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openResultModal('${r.student?._id}','${r.class?._id}')"><i class="fas fa-edit"></i></button>
        <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" onclick="alert('Contact admin to publish results.')"><i class="fas fa-paper-plane"></i></button>
      </td>
    </tr>
  `).join('');
}

async function fetchTeacherCBTs() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : data.cbts || [];
  } catch { return []; }
}

async function fetchAndSetup() {
  try {
    teacher = await fetchTeacherProfile();
    if (!teacher) throw new Error("Failed to load teacher profile.");

    document.getElementById('sidebarName').textContent = teacher.name;
    document.getElementById('sidebarRole').textContent = teacher.designation || 'Teacher';
    document.getElementById('pageTitle').textContent = `Welcome, ${teacher.name}`;
    
    const avatarText = (teacher.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
    document.querySelectorAll('.avatar-circle, .profile-avatar').forEach(el => {
      el.textContent = avatarText;
    });

    teacher.classes = await fetchTeacherClasses();
    notifications = await fetchTeacherNotifications();

    studentsByClass = {};
    subjectsByClass = {};
    for (const cls of teacher.classes) {
      studentsByClass[cls.id] = await fetchStudentsByClass(cls.id);
      subjectsByClass[cls.id] = await fetchSubjectsByClass(cls.id);
    }

    assignments = await fetchAssignments() || [];
    draftResults = await fetchDraftResults() || [];
    cbts = await fetchTeacherCBTs() || [];

    // Show dashboard by default
    showSection('dashboard');
    updateDashboardStats();
  } catch (err) {
    console.error(err);
    alert(err.message || "Dashboard failed to load.");
  } finally {
    hideDashboardSpinner();
  }
}

function updateDashboardStats() {
  const totalClasses = teacher?.classes?.length || 0;
  const totalStudents = Object.values(studentsByClass).reduce((sum, arr) => sum + arr.length, 0);
  const pendingAssignments = assignments.filter(a => !a.submitted).length;
  
  document.getElementById('totalClassesStat').textContent = totalClasses;
  document.getElementById('totalStudentsStat').textContent = totalStudents;
  document.getElementById('pendingItemsStat').textContent = pendingAssignments;
  document.getElementById('completedCBTsStat').textContent = myUploadedCBTs.length;
}

function populateAssignmentCBTs() {
  const cbtSel = document.getElementById('assignment-cbt');
  cbtSel.innerHTML = '<option value="">None (regular assignment)</option>';
  cbts.forEach(cbt => {
    let opt = document.createElement('option');
    opt.value = cbt._id;
    opt.innerText = `${cbt.title} (${cbt.className || ''} - ${cbt.subjectName || ''})`;
    cbtSel.appendChild(opt);
  });
}

// --- BACKEND API CALLS ---
function authHeaders() {
  return token ? { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token } : { 'Content-Type': 'application/json' };
}

async function fetchTeacherProfile() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/me`, { headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchTeacherClasses() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/classes`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchTeacherNotifications() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/notifications`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.notifications) ? data.notifications : [];
  } catch { return []; }
}

async function fetchStudentsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/students?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchSubjectsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/subjects?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function fetchAssignments() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/assignments`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.assignments) ? data.assignments : [];
  } catch { return []; }
}

async function fetchTeacherResults(status = "") {
  try {
    let url = `${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results`;
    if (status) url += `?status=${encodeURIComponent(status)}`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.results) ? data.results : [];
  } catch { return []; }
}

// --- CBT Results Section Logic ---
async function fetchCBTResultsForClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt-results?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results || []);
  } catch {
    return [];
  }
}

async function renderCBTResultsSection() {
  const container = document.getElementById('cbtResultsContainer');
  container.innerHTML = '<div style="padding:2em;text-align:center;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading CBT results...</div>';
  if (!teacher || !teacher.classes || teacher.classes.length === 0) {
    container.innerHTML = '<div style="padding:2em;text-align:center;color:var(--text-muted);">No classes assigned.</div>';
    return;
  }
  let html = '';
  for (const cls of teacher.classes) {
    const results = await fetchCBTResultsForClass(cls.id);
    html += `
      <div style="margin-bottom:2.5em;">
        <h3 style="color:var(--primary);font-size:1.2em;margin-bottom:0.5em;">Class: <span style="color:var(--accent-secondary);">${cls.name}</span></h3>
        ${results.length === 0
          ? `<div style="color:var(--text-muted);padding:1em 0;">No CBT results for this class.</div>`
          : `<div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Exam Title</th>
                    <th>Student</th>
                    <th>Score</th>
                    <th>Started</th>
                    <th>Finished</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${results.map(r => `
                    <tr>
                      <td>${r.examTitle || '-'}</td>
                      <td>${r.studentName || '-'}</td>
                      <td style="font-weight:bold;color:var(--accent);">${r.score} / ${r.total}</td>
                      <td>${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
                      <td>${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</td>
                      <td><button class="btn btn-primary" style="padding:6px 12px;font-size:0.85rem;" onclick="viewCBTResult('${r._id}')"><i class="fas fa-eye"></i></button></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>`
        }
      </div>
    `;
  }
  container.innerHTML = html;
}

window.viewCBTResult = async function(resultId) {
  const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt-results/${resultId}`, { headers: authHeaders() });
  const r = await res.json();
  let modal = document.getElementById('cbtResultModalBg');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cbtResultModalBg';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>CBT Result Detail</h3>
          <button class="modal-close" onclick="document.getElementById('cbtResultModalBg').classList.remove('visible')">&times;</button>
        </div>
        <div id="cbtResultDetail" style="padding: 24px;"></div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  modal.classList.add('visible');
  document.getElementById('cbtResultDetail').innerHTML = `
    <div style="margin-bottom: 12px;"><strong>Student:</strong> ${r.studentName}</div>
    <div style="margin-bottom: 12px;"><strong>Class:</strong> ${r.className}</div>
    <div style="margin-bottom: 12px;"><strong>Exam Title:</strong> ${r.examTitle}</div>
    <div style="margin-bottom: 12px;"><strong>Score:</strong> <span style="color: var(--accent); font-weight: 600;">${r.score} / ${r.total}</span></div>
    <div style="margin-bottom: 12px;"><strong>Started:</strong> ${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</div>
    <div style="margin-bottom: 12px;"><strong>Finished:</strong> ${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</div>
    <div style="margin-top: 20px;"><strong>Answers:</strong><pre style="background:var(--primary-light);border-radius:8px;padding:1em;margin-top:0.6em;overflow-x: auto;">${JSON.stringify(r.answers, null, 2)}</pre></div>
  `;
};

document.addEventListener('click', function(e) {
  const modal = document.getElementById('cbtResultModalBg');
  if (modal && modal.classList.contains('visible') && e.target === modal) modal.classList.remove('visible');
});

async function fetchMyCBTQuestions() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.cbts || []);
  } catch {
    return [];
  }
}

function renderMyCBTQuestions() {
  const listDiv = document.getElementById('myCBTQuestionsList');
  const pushBtn = document.getElementById('pushToUniversalBtn');
  if (!myUploadedCBTs.length) {
    listDiv.innerHTML = '<div style="color:var(--text-muted); padding:2em 0; text-align: center;">No CBTs uploaded yet.</div>';
    pushBtn.disabled = true;
    return;
  }
  let html = '';
  myUploadedCBTs.forEach((cbt, i) => {
    const questionCount = cbt.questions ? cbt.questions.length : 0;
    html += `
      <div style="border:1px solid var(--border-color); border-radius:8px; margin-bottom:12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); overflow: hidden;">
        <div style="cursor:pointer; padding:14px 16px; font-weight:600; font-size:1rem; display:flex; align-items:center; gap: 12px; background: var(--bg-light); border-bottom: 1px solid var(--border-color);" onclick="toggleCBTQuestions(${i})">
          <input type="checkbox" class="cbt-select-checkbox" data-cbtid="${cbt._id}" ${selectedCBTIds.includes(cbt._id) ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px;" onclick="event.stopPropagation();">
          <span style="flex: 1;">${cbt.title || '(Untitled CBT)'}</span>
          <span style="color:#666; font-size:0.9em;">${cbt.duration||''} min · ${questionCount} Q</span>
          <span id="cbt-q-arrow-${i}">▶</span>
          <button class="cbt-delete-btn" title="Delete" data-cbtid="${cbt._id}" style="margin-left:12px; color:#c00; background:none; border:none; cursor:pointer; font-size: 1.1em;"><i class="fas fa-trash"></i></button>
        </div>
        <div class="cbt-questions" id="cbt-questions-${i}" style="display:none; padding:10px 20px 15px 35px;">
          ${cbt.questions && cbt.questions.length
            ? cbt.questions.map((q, qidx) => `
  <div style="margin-bottom:1.2em; padding-bottom:10px; border-bottom:1px solid var(--border-color);">
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 8px;">
      <div style="font-weight:600;">
        Q${qidx+1}: <span style="font-weight:normal;">${q.text}</span>
      </div>
      <div>
        <button class="cbt-edit-q-btn" title="Edit" data-cbtidx="${i}" data-qidx="${qidx}" style="background:none;border:none;color:var(--accent-secondary);font-size:1.1em;margin-right:10px;cursor:pointer;"><i class="fas fa-edit"></i></button>
        <button class="cbt-delete-q-btn" title="Delete" data-cbtidx="${i}" data-qidx="${qidx}" style="background:none;border:none;color:#c00;font-size:1.1em;cursor:pointer;"><i class="fas fa-trash"></i></button>
      </div>
    </div>
    <ol style="margin:4px 0 0 20px; padding:0;">
      ${q.options.map((opt, oi) =>
        `<li style="margin:0.2em 0;${q.answer===oi?'font-weight:bold;color:var(--accent);':''}">
          ${opt.value}${q.answer===oi ? ' <i class="fas fa-check" style="color:var(--accent);"></i>' : ''}
        </li>`
      ).join('')}
    </ol>
    <div style="font-size:0.9em;color:var(--text-muted); margin-top: 6px;">Score: ${q.score||1}</div>
  </div>
`).join('')
            : '<div style="color:#999;">No questions in this CBT.</div>'
          }
        </div>
      </div>
    `;
  });
  listDiv.innerHTML = html;

  window.toggleCBTQuestions = function(idx) {
    const qDiv = document.getElementById('cbt-questions-' + idx);
    const arrow = document.getElementById('cbt-q-arrow-' + idx);
    if (!qDiv) return;
    const expanded = qDiv.style.display === '' || qDiv.style.display === 'block';
    qDiv.style.display = expanded ? 'none' : 'block';
    arrow.innerHTML = expanded ? '▶' : '▼';
  };

  listDiv.querySelectorAll('.cbt-select-checkbox').forEach(cb => {
    cb.onchange = function(e) {
      const id = this.getAttribute('data-cbtid');
      if (this.checked) {
        if (!selectedCBTIds.includes(id)) selectedCBTIds.push(id);
      } else {
        selectedCBTIds = selectedCBTIds.filter(cid => cid !== id);
      }
      pushBtn.disabled = selectedCBTIds.length === 0;
      e.stopPropagation && e.stopPropagation();
    };
  });

  listDiv.querySelectorAll('.cbt-delete-btn').forEach(btn => {
    btn.onclick = async function(e) {
      e.stopPropagation();
      const id = btn.getAttribute('data-cbtid');
      if (confirm('Delete this CBT?')) {
        const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${id}`, { method: "DELETE", headers: authHeaders() });
        if (res.ok) {
          myUploadedCBTs = await fetchMyCBTQuestions();
          selectedCBTIds = selectedCBTIds.filter(cid => cid !== id);
          renderMyCBTQuestions();
        }
      }
    }
  });

  listDiv.querySelectorAll('.cbt-delete-q-btn').forEach(btn => {
    btn.onclick = async function(e) {
      e.stopPropagation();
      const cbtIdx = parseInt(btn.getAttribute('data-cbtidx'));
      const qIdx = parseInt(btn.getAttribute('data-qidx'));
      const cbt = myUploadedCBTs[cbtIdx];
      if (confirm('Delete this question?')) {
        cbt.questions.splice(qIdx, 1);
        await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${cbt._id}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ questions: cbt.questions })
        });
        myUploadedCBTs = await fetchMyCBTQuestions();
        renderMyCBTQuestions();
      }
    }
  });

  listDiv.querySelectorAll('.cbt-edit-q-btn').forEach(btn => {
    btn.onclick = function(e) {
      e.stopPropagation();
      const cbtIdx = parseInt(btn.getAttribute('data-cbtidx'));
      const qIdx = parseInt(btn.getAttribute('data-qidx'));
      openEditCBTQuestionModal(cbtIdx, qIdx);
    }
  });

  pushBtn.disabled = selectedCBTIds.length === 0;
}

function ensureEditModal() {
  if (!document.getElementById('cbt-edit-modal-bg')) {
    const m = document.createElement('div');
    m.id = 'cbt-edit-modal-bg';
    m.className = 'modal-overlay';
    m.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Edit Question</h3>
          <button class="modal-close" onclick="document.getElementById('cbt-edit-modal-bg').classList.remove('visible')">&times;</button>
        </div>
        <div style="padding: 24px;">
          <div id="cbt-edit-modal-fields"></div>
          <div style="text-align:right; margin-top: 24px; display: flex; gap: 12px; justify-content: flex-end;">
            <button id="cbt-edit-modal-cancel" class="btn btn-secondary">Cancel</button>
            <button id="cbt-edit-modal-save" class="btn btn-primary">Save Changes</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(m);
  }
}

function openEditCBTQuestionModal(cbtIdx, qIdx) {
  ensureEditModal();
  const modalBg = document.getElementById('cbt-edit-modal-bg');
  const fieldsDiv = document.getElementById('cbt-edit-modal-fields');
  const cbt = myUploadedCBTs[cbtIdx];
  const q = cbt.questions[qIdx];
  
  fieldsDiv.innerHTML = `
    <div class="form-group">
      <label>Question Text</label>
      <textarea id="cbt-edit-q-text" style="min-height: 100px;">${q.text.replace(/<\/?[^>]+(>|$)/g, "")}</textarea>
    </div>
    <div class="form-group">
      <label>Options (one per line)</label>
      <textarea id="cbt-edit-q-opts" style="min-height: 120px;">${q.options.map(o=>o.value.replace(/<\/?[^>]+(>|$)/g, "")).join('\n')}</textarea>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
      <div class="form-group">
        <label>Correct Option (1-${q.options.length})</label>
        <input type="number" id="cbt-edit-q-answer" min="1" max="${q.options.length}" value="${(q.answer||0)+1}" />
      </div>
      <div class="form-group">
        <label>Points/Score</label>
        <input type="number" min="1" id="cbt-edit-q-score" value="${q.score||1}" />
      </div>
    </div>
  `;
  
  modalBg.classList.add('visible');
  
  document.getElementById('cbt-edit-modal-cancel').onclick = () => { modalBg.classList.remove('visible'); };
  document.getElementById('cbt-edit-modal-save').onclick = async function() {
    const newText = document.getElementById('cbt-edit-q-text').value;
    const newOpts = document.getElementById('cbt-edit-q-opts').value.split('\n').filter(Boolean).map(val=>({value:val}));
    let newAns = parseInt(document.getElementById('cbt-edit-q-answer').value) - 1;
    if (newAns < 0) newAns = 0;
    if (newAns >= newOpts.length) newAns = newOpts.length - 1;
    const newScore = parseInt(document.getElementById('cbt-edit-q-score').value) || 1;
    
    cbt.questions[qIdx] = { text: newText, options: newOpts, answer: newAns, score: newScore };
    
    await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${cbt._id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ questions: cbt.questions })
    });
    
    modalBg.classList.remove('visible');
    myUploadedCBTs = await fetchMyCBTQuestions();
    renderMyCBTQuestions();
  };
}

async function showMyCBTQuestionsSection() {
  myUploadedCBTs = await fetchMyCBTQuestions();
  selectedCBTIds = [];
  renderMyCBTQuestions();
}

document.getElementById('pushToUniversalBtn').onclick = async function() {
  if (!selectedCBTIds.length) return;
  const selectedCBTs = myUploadedCBTs.filter(q => selectedCBTIds.includes(q._id));
  if (!selectedCBTs.length) return;

  if (!confirm(`Push ${selectedCBTs.length} selected CBT(s) to question bank?`)) return;

  this.disabled = true;
  const origHTML = this.innerHTML;
  this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Pushing...';

  let successCount = 0;
  for (const cbt of selectedCBTs) {
    try {
      const payload = {
        title: cbt.title,
        class: cbt.class,
        subject: cbt.subject,
        duration: cbt.duration,
        questions: (cbt.questions || []).map(q => ({
          text: q.text,
          options: q.options,
          answer: q.answer,
          score: q.score
        }))
      };
      const res = await fetch('https://goldlincschools.onrender.com/api/exam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) successCount++;
    } catch {}
  }
  
  this.disabled = false;
  this.innerHTML = origHTML;
  alert(`${successCount} CBT(s) pushed successfully!`);
};

// --- Attendance ---
function renderAttendance() {
  const attendanceClassSel = document.getElementById('attendance-class');
  attendanceClassSel.innerHTML = '';
  if (!teacher.classes) return;
  teacher.classes.forEach(cls => {
    let opt = document.createElement('option');
    opt.value = cls.id;
    opt.innerText = cls.name;
    attendanceClassSel.appendChild(opt);
  });
  attendanceClassSel.onchange = renderAttendanceStudents;
  renderAttendanceStudents();
}

function renderAttendanceStudents() {
  const classId = document.getElementById('attendance-class').value;
  const students = studentsByClass[classId] || [];
  let html = `<table style="margin-top: 20px;">
      <thead><tr><th>Student</th><th style="text-align: center;">Present</th></tr></thead>
      <tbody>`;
  students.forEach(stu => {
    const record = (attendanceRecords.find(a => a.classId === classId && a.studentId === stu.id) || { present: false });
    html += `<tr>
      <td>${stu.name}</td>
      <td style="text-align: center;"><input type="checkbox" name="present_${stu.id}" ${record.present ? 'checked' : ''} style="cursor: pointer; width: 18px; height: 18px;"></td>
    </tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('attendance-students').innerHTML = html;
}

document.getElementById('attendance-form').onsubmit = async function (e) {
  e.preventDefault();
  const classId = document.getElementById('attendance-class').value;
  const students = studentsByClass[classId] || [];
  students.forEach(stu => {
    const cb = document.querySelector(`[name="present_${stu.id}"]`);
    let record = attendanceRecords.find(a => a.classId === classId && a.studentId === stu.id);
    if (!record) {
      record = { classId, studentId: stu.id, present: cb.checked };
      attendanceRecords.push(record);
    } else {
      record.present = cb.checked;
    }
  });
  alert('Attendance saved!');
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/attendance`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ classId, attendance: attendanceRecords.filter(a => a.classId === classId) })
    });
    if (!res.ok) throw new Error();
    alert('Attendance posted to server!');
  } catch {
    alert('Failed to save attendance to server.');
  }
};

// --- Gradebook ---
function renderGradebook() {
  const gradebookClassSel = document.getElementById('gradebook-class');
  gradebookClassSel.innerHTML = '';
  if (!teacher.classes) return;
  teacher.classes.forEach(cls => {
    let opt = document.createElement('option');
    opt.value = cls.id;
    opt.innerText = cls.name;
    gradebookClassSel.appendChild(opt);
  });
  gradebookClassSel.onchange = renderGradebookTable;
  renderGradebookTable();
}

function renderGradebookTable() {
  const classId = document.getElementById('gradebook-class').value;
  const students = studentsByClass[classId] || [];
  const subjects = subjectsByClass[classId] || [];
  let html = `<table style="margin-top: 20px;">
      <thead><tr><th>Student</th>`;
  subjects.forEach(subj => html += `<th>${subj.name}</th>`);
  html += `</tr></thead><tbody>`;
  students.forEach(stu => {
    html += `<tr><td>${stu.name}</td>`;
    subjects.forEach(subj => {
      const gb = (gradebookData[classId] && gradebookData[classId][stu.id] && gradebookData[classId][stu.id][subj.id]) || '-';
      html += `<td>${gb}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('gradebook-table').innerHTML = html;
}

// --- Assignments ---
function renderAssignments() {
  const assignmentClassSel = document.getElementById('assignment-class');
  assignmentClassSel.innerHTML = '';
  if (!teacher.classes) return;
  teacher.classes.forEach(cls => {
    let opt = document.createElement('option');
    opt.value = cls.id;
    opt.innerText = cls.name;
    assignmentClassSel.appendChild(opt);
  });
  renderAssignmentList();
}

function populateAssignmentSubjects() {
  const classId = document.getElementById('assignment-class').value;
  const subjectSelect = document.getElementById('assignment-subject');
  subjectSelect.innerHTML = '';
  const subjects = subjectsByClass[classId] || [];
  subjects.forEach(subj => {
    let opt = document.createElement('option');
    opt.value = subj.id;
    opt.innerText = subj.name;
    subjectSelect.appendChild(opt);
  });
}

async function openAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.add('visible');
  populateAssignmentSubjects();
  document.getElementById('assignment-class').onchange = populateAssignmentSubjects;
  cbts = await fetchTeacherCBTs();
  populateAssignmentCBTs();
}

function renderAssignmentList() {
  const div = document.getElementById('assignment-list');
  if (!assignments.length) {
    div.innerHTML = '<div style="padding: 2em; text-align: center; color: var(--text-muted);">No assignments yet.</div>';
    return;
  }
  let html = '<div class="table-wrapper"><table><thead><tr><th>Title</th><th>Class</th><th>Due</th><th>CBT</th><th>Description</th></tr></thead><tbody>';
  assignments.forEach(a => {
    const classId = a.class && a.class._id ? a.class._id : a.class;
    const cls = teacher.classes.find(c => c.id == classId);
    let cbtTitle = '';
    if (a.cbt) {
      const found = cbts.find(cbt => cbt._id === a.cbt);
      cbtTitle = found ? found.title : a.cbt;
    }
    html += `<tr>
      <td>${a.title}</td>
      <td>${(a.class && a.class.name) || (cls && cls.name) || classId || 'Unknown'}</td>
      <td>${a.dueDate ? a.dueDate.slice(0,10) : (a.due || '')}</td>
      <td>${cbtTitle || '-'}</td>
      <td>${a.description || a.desc}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  div.innerHTML = html;
}

function closeAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.remove('visible');
}

document.getElementById('assignmentForm').onsubmit = async function (e) {
  e.preventDefault();
  const classId = document.getElementById('assignment-class').value;
  const fd = new FormData(this);
  const assignment = {
    class: classId,
    subject: document.getElementById('assignment-subject').value,
    title: fd.get('title'),
    description: fd.get('desc'),
    dueDate: fd.get('due')
  };
  const cbtId = document.getElementById('assignment-cbt').value;
  if (cbtId) assignment.cbt = cbtId;

  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/assignments`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(assignment)
    });
    if (!res.ok) throw new Error();
    assignments = await fetchAssignments();
    alert('Assignment created!');
    closeAssignmentModal();
    renderAssignmentList();
  } catch {
    alert('Failed to create assignment.');
  }
};

window.openAssignmentModal = openAssignmentModal;
window.closeAssignmentModal = closeAssignmentModal;

// --- Result Modal ---
let currentResultStudentId = null;
let currentResultClassId = null;

function openResultModal(studentId, classId) {
  currentResultStudentId = studentId;
  currentResultClassId = classId;
  let result = draftResults.find(r => r.studentId === studentId && r.classId === classId) || {};
  const subjects = subjectsByClass[classId] || [];
  let html = '<h4 style="margin-bottom: 20px; color: var(--primary);">Subject Scores</h4>';
  subjects.forEach(subj => {
    const data = (result.data && result.data[subj.id]) || {};
    html += `
      <div class="form-row">
        <div class="form-group">
          <label>${subj.name} - CA (20)</label>
          <input type="number" min="0" max="20" name="ca_${subj.id}" value="${data.ca || ''}" required />
        </div>
        <div class="form-group">
          <label>${subj.name} - Mid Term (20)</label>
          <input type="number" min="0" max="20" name="mid_${subj.id}" value="${data.mid || ''}" required />
        </div>
        <div class="form-group">
          <label>${subj.name} - Exam (60)</label>
          <input type="number" min="0" max="60" name="exam_${subj.id}" value="${data.exam || ''}" required />
        </div>
      </div>
      <div class="form-group">
        <label>${subj.name} - Comment</label>
        <input type="text" name="comment_${subj.id}" placeholder="Teacher comment" value="${data.comment || ''}" />
      </div>
    `;
  });
  html += `<h4 style="margin-top: 24px; margin-bottom: 20px; color: var(--primary);">Affective Skills (1-5)</h4>`;
  const affectiveSkills = ['Punctuality', 'Attentiveness', 'Neatness', 'Honesty', 'Politeness', 'Perseverance', 'Relationship with Others', 'Organization Ability'];
  affectiveSkills.forEach(skill => {
    html += `<div class="form-group">
      <label>${skill}</label>
      <input type="number" min="1" max="5" name="affective_${skill.toLowerCase().replace(/ /g, '_')}" value="${(result.affectiveRatings && result.affectiveRatings[skill]) || ''}" />
    </div>`;
  });
  html += `<h4 style="margin-top: 24px; margin-bottom: 20px; color: var(--primary);">Psychomotor Skills (1-5)</h4>`;
  const psychomotorSkills = ['Hand Writing', 'Drawing and Painting', 'Speech / Verbal Fluency', 'Quantitative Reasoning', 'Processing Speed', 'Retentiveness', 'Visual Memory', 'Public Speaking', 'Sports and Games'];
  psychomotorSkills.forEach(skill => {
    html += `<div class="form-group">
      <label>${skill}</label>
      <input type="number" min="1" max="5" name="psychomotor_${skill.toLowerCase().replace(/ |\//g, '_')}" value="${(result.psychomotorRatings && result.psychomotorRatings[skill]) || ''}" />
    </div>`;
  });
  html += `<h4 style="margin-top: 24px; margin-bottom: 20px; color: var(--primary);">Attendance</h4>
    <div class="form-row">
      <div class="form-group">
        <label>Total School Days</label>
        <input type="number" min="0" name="attendance_total" value="${result.attendanceTotal || ''}" />
      </div>
      <div class="form-group">
        <label>Days Present</label>
        <input type="number" min="0" name="attendance_present" value="${result.attendancePresent || ''}" />
      </div>
      <div class="form-group">
        <label>Days Absent</label>
        <input type="number" min="0" name="attendance_absent" value="${result.attendanceAbsent || ''}" />
      </div>
      <div class="form-group">
        <label>Attendance %</label>
        <input type="number" min="0" max="100" step="0.01" name="attendance_percent" value="${result.attendancePercent || ''}" />
      </div>
    </div>`;
  document.getElementById('resultFormFields').innerHTML = html;
  document.getElementById('resultModalBg').classList.add('visible');
}

function closeResultModal() {
  document.getElementById('resultModalBg').classList.remove('visible');
  currentResultStudentId = currentResultClassId = null;
}

document.getElementById('resultForm').onsubmit = async function (e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const subjects = subjectsByClass[currentResultClassId] || [];
  
  let subjectsPayload = [];
  subjects.forEach(subj => {
    subjectsPayload.push({
      subject: subj.id,
      ca: Number(fd.get(`ca_${subj.id}`)),
      mid: Number(fd.get(`mid_${subj.id}`)),
      exam: Number(fd.get(`exam_${subj.id}`)),
      comment: fd.get(`comment_${subj.id}`) || ''
    });
  });

  let affectiveRatings = {};
  affectiveSkills = ['Punctuality', 'Attentiveness', 'Neatness', 'Honesty', 'Politeness', 'Perseverance', 'Relationship with Others', 'Organization Ability'];
  affectiveSkills.forEach(skill => affectiveRatings[skill] = Number(fd.get(`affective_${skill.toLowerCase().replace(/ /g, '_')}`)));
  
  let psychomotorRatings = {};
  psychomotorSkills = ['Hand Writing', 'Drawing and Painting', 'Speech / Verbal Fluency', 'Quantitative Reasoning', 'Processing Speed', 'Retentiveness', 'Visual Memory', 'Public Speaking', 'Sports and Games'];
  psychomotorSkills.forEach(skill => psychomotorRatings[skill] = Number(fd.get(`psychomotor_${skill.toLowerCase().replace(/ |\//g, '_')}`)));

  const payload = {
    student: currentResultStudentId,
    class: currentResultClassId,
    term: "FIRST TERM",
    session: "2024–2025",
    subjects: subjectsPayload,
    affectiveRatings,
    psychomotorRatings,
    attendanceTotal: Number(fd.get('attendance_total')),
    attendancePresent: Number(fd.get('attendance_present')),
    attendanceAbsent: Number(fd.get('attendance_absent')),
    attendancePercent: Number(fd.get('attendance_percent')),
    status: "Draft"
  };

  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save results");
    alert('Results saved!');
    closeResultModal();
    draftResults = await fetchDraftResults();
    renderDraftResults();
  } catch (err) {
    alert('Failed to save results: ' + err.message);
  }
};

function closeEditStudentModal() {
  document.getElementById('editStudentModal').classList.remove('visible');
}

// --- Notifications ---
function renderNotifications() {
  const container = document.getElementById('notification-list');
  container.innerHTML = '';
  if (!notifications.length) {
    container.innerHTML = '<div style="padding: 2em; text-align: center; color: var(--text-muted);">No notifications.</div>';
    return;
  }
  notifications.forEach(note => {
    const div = document.createElement('div');
    div.className = 'notification';
    div.innerHTML = `<span style="font-weight: 600; color: var(--text-muted); min-width: 80px;">${note.date}</span> <span>${note.message}</span>`;
    container.appendChild(div);
  });
}

// --- Classes List ---
let selectedClassId = null;

function renderClassesList() {
  const classList = document.getElementById('class-list');
  classList.innerHTML = '';
  if (!teacher.classes || teacher.classes.length === 0) return;

  if (!selectedClassId) {
    selectedClassId = teacher.classes[0].id;
  }

  teacher.classes.forEach(cls => {
    const btn = document.createElement('button');
    btn.className = 'class-btn';
    btn.innerText = cls.name;
    if (selectedClassId === cls.id) btn.classList.add('active');
    btn.onclick = () => {
      selectedClassId = cls.id;
      renderClassesList();
      renderStudentsBlock();
      renderSubjectsBlock();
      showAddSubjectBlock();
    };
    classList.appendChild(btn);
  });
}

function renderStudentsBlock() {
  const block = document.getElementById('students-block');
  block.innerHTML = '';
  if (!selectedClassId) return;
  const students = studentsByClass[selectedClassId] || [];
  if (students.length === 0) {
    block.innerHTML = '<div class="section-card"><em style="color: var(--text-muted);">No students found in this class.</em></div>';
    return;
  }
  let html = `<div class="section-card"><div class="card-header"><h3 style="margin: 0; font-size: 1.1rem;">Students in ${teacher.classes.find(c => c.id === selectedClassId)?.name}</h3></div><div class="table-wrapper"><table>
      <thead><tr>
        <th>Name</th><th>Reg. No.</th><th>Email</th><th>Actions</th>
      </tr></thead>
      <tbody>`;
  students.forEach(stu => {
    html += `<tr>
      <td>${stu.name}</td>
      <td>${stu.regNo}</td>
      <td>${stu.email}</td>
      <td style="text-align: center;">
        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="openResultModal('${stu.id}','${selectedClassId}')"><i class="fas fa-edit"></i></button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div></div>`;
  block.innerHTML = html;
}

function renderSubjectsBlock() {
  const block = document.getElementById('subjects-block');
  block.innerHTML = '';
  if (!selectedClassId) return;
  const subjects = subjectsByClass[selectedClassId] || [];
  if (subjects.length === 0) {
    block.innerHTML = '<div class="section-card"><em style="color: var(--text-muted);">No subjects assigned.</em></div>';
    return;
  }
  let html = `<div class="section-card"><div class="card-header"><h3 style="margin: 0; font-size: 1.1rem;">Subjects for ${teacher.classes.find(c => c.id === selectedClassId)?.name}</h3></div><div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 0 0 8px 0;">`;
  subjects.forEach(subj => {
    html += `<div style="padding: 12px; background: var(--primary-light); border-radius: 8px; border-left: 4px solid var(--primary); font-weight: 500;">${subj.name || subj}</div>`;
  });
  html += '</div></div>';
  block.innerHTML = html;
}

function showAddSubjectBlock() {
  const block = document.getElementById('add-subject-block');
  if (!block) return;
  if (selectedClassId) {
    block.style.display = '';
  } else {
    block.style.display = 'none';
  }
}

const addSubjectForm = document.getElementById('add-subject-form');
if (addSubjectForm) {
  addSubjectForm.onsubmit = async function(e) {
    e.preventDefault();
    const subjectInput = document.getElementById('subject-name-input');
    const subjectName = subjectInput.value.trim();
    if (!subjectName || !selectedClassId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/classes/${selectedClassId}/subjects`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ subjectName })
      });
      if (!res.ok) throw new Error();
      subjectsByClass[selectedClassId] = await fetchSubjectsByClass(selectedClassId);
      renderSubjectsBlock();
      subjectInput.value = '';
      alert('Subject added!');
    } catch {
      alert('Failed to add subject.');
    }
  };
}

// --- Profile Form ---
function populateProfileForm() {
  if (teacher) {
    document.getElementById('profile-name').value = teacher.name || '';
    document.getElementById('profile-email').value = teacher.email || '';
  }
}

document.getElementById('profile-form').onsubmit = async function (e) {
  e.preventDefault();
  const nameParts = document.getElementById('profile-name').value.split(' ');
  const payload = {
    first_name: nameParts[0] || '',
    last_name: nameParts.slice(1).join(' ') || '',
    email: document.getElementById('profile-email').value,
  };
  const password = document.getElementById('profile-password').value;
  if (password) payload.login_password = password;
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/me`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error();
    alert('Profile updated!');
  } catch {
    alert('Failed to update profile.');
  }
};

// --- CBT QUESTIONS ---
let cbtQuestions = [];

function trySetSubjectDropdown(subjectSel, value, cb, tries = 0) {
  if (!value) { if(cb) cb(); return; }
  for (let i = 0; i < subjectSel.options.length; ++i) {
    if (subjectSel.options[i].value === value) {
      subjectSel.value = value;
      if(cb) cb();
      return;
    }
  }
  if (tries < 20) {
    setTimeout(() => trySetSubjectDropdown(subjectSel, value, cb, tries + 1), 80);
  } else {
    if(cb) cb();
  }
}

function renderCBTQuestionSection() {
  const classSel = document.getElementById('cbt-class-select');
  const subjSel = document.getElementById('cbt-subject-select');
  classSel.innerHTML = '';
  subjSel.innerHTML = '';

  if (!teacher.classes) return;
  teacher.classes.forEach(cls => {
    let opt = document.createElement('option');
    opt.value = cls.id;
    opt.innerText = cls.name;
    classSel.appendChild(opt);
  });

  let justRestoredDraft = false;
  if (!cbtDraftRestoreWarned) {
    cbtDraftRestoreWarned = true;
    const draft = loadCBTDraftFromLocalStorage();
    if (draft && (draft.title || (draft.questions && draft.questions.length > 0))) {
      if (confirm("You have an unfinished CBT draft. Restore it?")) {
        justRestoredDraft = true;
        cbtQuestions = Array.isArray(draft.questions) ? draft.questions : [];
        classSel.value = draft.classId || '';
        classSel.dispatchEvent(new Event('change'));

        trySetSubjectDropdown(subjSel, draft.subjectId || '', () => {
          document.getElementById('cbt-title').value = draft.title || '';
          document.getElementById('cbt-duration').value = draft.duration || '';
          renderCBTQuestions();
        });
      } else {
        clearCBTDraftFromLocalStorage();
      }
    }
  }
  if (!justRestoredDraft) {
    cbtQuestions = [];
    classSel.onchange = function() {
      const subjects = subjectsByClass[classSel.value] || [];
      subjSel.innerHTML = '';
      subjects.forEach(subj => {
        let opt = document.createElement('option');
        opt.value = subj.id;
        opt.innerText = subj.name;
        subjSel.appendChild(opt);
      });
      saveCBTDraftToLocalStorage();
    };
    classSel.onchange();
    ['cbt-class-select', 'cbt-subject-select', 'cbt-title', 'cbt-duration'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.oninput = saveCBTDraftToLocalStorage;
    });
    renderCBTQuestions();
  }
}

function getQuillConfig() {
  return {
    theme: 'snow',
    modules: {
      toolbar: [
        [{ 'header': [1, 2, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered'}, { list: 'bullet' }],
        ['image', 'code-block'],
        ['clean']
      ]
    }
  };
}

function renderCBTQuestions() {
  const listDiv = document.getElementById('cbt-questions-list');
  listDiv.innerHTML = '';
  cbtQuestions.forEach((q, idx) => {
    let qDiv = document.createElement('div');
    qDiv.className = 'cbt-question-block';
    qDiv.style.cssText = 'background: var(--bg-light); border: 1px solid var(--border-color); border-radius: 8px; padding: 16px; margin-bottom: 16px;';
    qDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-weight: 600; color: var(--primary);">Question ${idx+1}</span>
        <button type="button" style="background: none; border: none; color: #c00; font-size: 1.2em; cursor: pointer;" title="Remove" onclick="removeCBTQuestion(${idx})"><i class="fas fa-trash"></i></button>
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; margin-bottom: 8px;">Question Text</label>
        <div id="cbt-qtext-quill-${idx}" class="quill-editor"></div>
      </div>
      <div class="form-group" style="margin-bottom: 16px;">
        <label style="font-weight: 600; margin-bottom: 8px;">Points/Score</label>
        <input type="number" min="1" class="cbt-qscore" value="${q.score||1}" placeholder="Score" style="width: 100px; padding: 8px 12px; border: 1px solid var(--border-color); border-radius: 6px;" />
      </div>
      <div class="form-group" style="margin-bottom: 12px;">
        <label style="font-weight: 600; margin-bottom: 8px;">Options</label>
        <div class="cbt-options-list" id="cbt-options-list-${idx}"></div>
        <button type="button" class="btn btn-secondary" style="margin-top: 8px;" onclick="addCBTOption(${idx})"><i class="fas fa-plus"></i> Add Option</button>
      </div>
    `;
    listDiv.appendChild(qDiv);

    let qtextDiv = qDiv.querySelector(`#cbt-qtext-quill-${idx}`);
    let qQuill = new Quill(qtextDiv, getQuillConfig());
    if(q.text) qQuill.root.innerHTML = q.text;
    qQuill.on('text-change', () => { 
      cbtQuestions[idx].text = qQuill.root.innerHTML; 
      saveCBTDraftToLocalStorage();
    });
    qtextDiv.__quill = qQuill;

    qDiv.querySelector('.cbt-qscore').oninput = (e) => {
      cbtQuestions[idx].score = Number(e.target.value)||1;
      saveCBTDraftToLocalStorage();
    };

    renderCBTOptions(idx);
  });
  saveCBTDraftToLocalStorage();
}

function renderCBTOptions(qidx) {
  const optionsDiv = document.getElementById(`cbt-options-list-${qidx}`);
  optionsDiv.innerHTML = '';
  (cbtQuestions[qidx].options||[]).forEach((opt, oi) => {
    let optDiv = document.createElement('div');
    optDiv.className = 'cbt-option-row';
    optDiv.style.cssText = 'display: flex; align-items: center; gap: 8px; background: #fff; padding: 12px; border-radius: 6px; margin-bottom: 8px; border: 1px solid var(--border-color);';
    optDiv.innerHTML = `
      <input type="radio" class="cbt-option-radio" name="cbt-correct-${qidx}" ${cbtQuestions[qidx].answer===oi?'checked':''} onclick="setCBTCorrect(${qidx},${oi})" title="Mark as correct answer" style="cursor: pointer; width: 18px; height: 18px;" />
      <div id="cbt-q${qidx}-opt-quill-${oi}" class="quill-editor" style="width:100%; flex: 1; min-height: 80px;"></div>
      <button type="button" class="cbt-remove-opt-btn" onclick="removeCBTOption(${qidx},${oi})" title="Remove option" style="background: none; border: none; color: #c00; font-size: 1.1em; cursor: pointer; flex-shrink: 0;"><i class="fas fa-trash"></i></button>
    `;
    optionsDiv.appendChild(optDiv);
    
    let optQuillDiv = optDiv.querySelector(`#cbt-q${qidx}-opt-quill-${oi}`);
    let optQuill = new Quill(optQuillDiv, getQuillConfig());
    if(opt.value) optQuill.root.innerHTML = opt.value;
    optQuill.on('text-change', () => { 
      cbtQuestions[qidx].options[oi].value = optQuill.root.innerHTML; 
      saveCBTDraftToLocalStorage();
    });
    optQuillDiv.__quill = optQuill;
  });
  saveCBTDraftToLocalStorage();
}

window.removeCBTQuestion = function(idx) { 
  cbtQuestions.splice(idx,1); 
  renderCBTQuestions(); 
  saveCBTDraftToLocalStorage();
};

window.addCBTOption = function(qidx) { 
  if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
  cbtQuestions[qidx].options.push({ value: '' });
  renderCBTQuestions();
  saveCBTDraftToLocalStorage();
};

window.removeCBTOption = function(qidx, oidx) {
  cbtQuestions[qidx].options.splice(oidx,1);
  if (cbtQuestions[qidx].answer === oidx) cbtQuestions[qidx].answer = 0;
  renderCBTQuestions();
  saveCBTDraftToLocalStorage();
};

window.setCBTCorrect = function(qidx, oidx) {
  cbtQuestions[qidx].answer = oidx;
  saveCBTDraftToLocalStorage();
};

document.getElementById('cbt-add-question-btn').onclick = function() {
  cbtQuestions.push({ text: '', options: [], answer: 0, score: 1 });
  renderCBTQuestions();
  saveCBTDraftToLocalStorage();
};

document.getElementById('cbt-question-form').onsubmit = async function(e) {
  e.preventDefault();
  const btn = document.getElementById('cbt-upload-btn');
  const msgDiv = document.getElementById('cbt-upload-msg');
  btn.disabled = true;
  const originalBtnHTML = btn.innerHTML;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  msgDiv.textContent = '';
  msgDiv.style.color = '#15a55a';

  const classId = document.getElementById('cbt-class-select').value;
  const subjectId = document.getElementById('cbt-subject-select').value;
  const title = document.getElementById('cbt-title').value.trim();
  const duration = Number(document.getElementById('cbt-duration').value);

  if (!classId || !subjectId || !title || !duration) {
    msgDiv.style.color = '#dc2626';
    msgDiv.textContent = 'Please fill all required fields.';
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
    return;
  }
  if (!cbtQuestions.length) {
    msgDiv.style.color = '#dc2626';
    msgDiv.textContent = 'Add at least one question.';
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
    return;
  }
  for (let [i, q] of cbtQuestions.entries()) {
    if (!q.text || !Array.isArray(q.options) || q.options.length < 2) {
      msgDiv.style.color = '#dc2626';
      msgDiv.textContent = `Question ${i+1} must have text and at least 2 options.`;
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
      return;
    }
    for (let o of q.options) {
      if (!o.value) {
        msgDiv.style.color = '#dc2626';
        msgDiv.textContent = `Question ${i+1} has empty option(s).`;
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
        return;
      }
    }
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) {
      msgDiv.style.color = '#dc2626';
      msgDiv.textContent = `Question ${i+1} needs a correct option selected.`;
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
      return;
    }
  }
  
  const payload = {
    title,
    class: classId,
    subject: subjectId,
    duration,
    questions: cbtQuestions.map(q => ({
      text: q.text,
      options: q.options.map(o => ({ value: o.value })), 
      answer: q.answer,
      score: q.score
    }))
  };
  
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    msgDiv.style.color = '#15a55a';
    msgDiv.textContent = 'CBT uploaded successfully!';
    msgDiv.innerHTML += '<i class="fas fa-check-circle" style="margin-left: 8px;"></i>';
    cbtQuestions = [];
    renderCBTQuestions();
    clearCBTDraftFromLocalStorage();
    document.getElementById('cbt-title').value = '';
    document.getElementById('cbt-duration').value = '';
  } catch (err) {
    msgDiv.style.color = '#dc2626';
    msgDiv.textContent = 'Upload failed: ' + (err.message || 'Unknown error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
  }
};

// --- Window exports ---
window.renderClassesList = renderClassesList;
window.renderStudentsBlock = renderStudentsBlock;
window.renderSubjectsBlock = renderSubjectsBlock;
window.openAssignmentModal = openAssignmentModal;
window.closeAssignmentModal = closeAssignmentModal;
window.openResultModal = openResultModal;
window.closeResultModal = closeResultModal;
window.closeEditStudentModal = closeEditStudentModal;
window.toggleSidebar = toggleSidebar;
window.navClick = navClick;
window.showSection = showSection;

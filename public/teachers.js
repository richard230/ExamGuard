

const API_BASE_URL = "https://goldlincschools.onrender.com";
const token = localStorage.getItem('teacherToken') || localStorage.getItem('token') || "";
// --- Spinner overlay control ---
function showDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) {
    spinner.classList.remove('hidden');
    spinner.style.display = 'flex';
    spinner.style.opacity = '1';
  }
}
function hideDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) {
    spinner.classList.add('hidden');
    setTimeout(() => { spinner.style.display = 'none'; }, 400); // Wait for fade
  }
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

// ADD AT THE TOP (after cbtQuestions = [];)
let cbtDraftKey = 'cbtDraft_current';
let cbtDraftRestoreWarned = false;

// --- UTILS FOR CBT DRAFT ---
function saveCBTDraftToLocalStorage() {
  const classId = document.getElementById('cbt-class-select')?.value || '';
  const subjectId = document.getElementById('cbt-subject-select')?.value || '';
  const title = document.getElementById('cbt-title')?.value || '';
  const duration = document.getElementById('cbt-duration')?.value || '';
  // Save cbtQuestions array as well
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

// HOOK INTO CBT QUESTION FORM: (edit renderCBTQuestionSection)

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

  // --- Draft Restore ---

  if (!cbtDraftRestoreWarned) {
    cbtDraftRestoreWarned = true;
    const draft = loadCBTDraftFromLocalStorage();
    if (draft && (draft.title || (draft.questions && draft.questions.length > 0))) {
      if (confirm("It looks like you have an unfinished CBT draft. Restore it?")) {
        // Restore all fields
        setTimeout(() => {
          classSel.value = draft.classId || '';
          classSel.dispatchEvent(new Event('change')); // To populate subjects
          // Wait a moment for subject dropdown to update
          setTimeout(() => {
            subjSel.value = draft.subjectId || '';
            document.getElementById('cbt-title').value = draft.title || '';
            document.getElementById('cbt-duration').value = draft.duration || '';
            cbtQuestions = Array.isArray(draft.questions) ? draft.questions : [];
            renderCBTQuestions();
          }, 200);
        }, 100);
      } else {
        clearCBTDraftFromLocalStorage();
      }
    }
  }

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

  // Hook into value changes to auto-save
  ['cbt-class-select', 'cbt-subject-select', 'cbt-title', 'cbt-duration'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.oninput = saveCBTDraftToLocalStorage;
  });

  cbtQuestions = cbtQuestions || [];
  renderCBTQuestions();
}
// --- INITIAL FETCH & SETUP ---
window.addEventListener('DOMContentLoaded', () => {
  showDashboardSpinner();
  fetchAndSetup();
});
async function fetchDraftResults() {
  try {
    // You may need to adjust the endpoint if your API differs!
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results?status=Draft`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    // Defensive: some APIs use {results: [...]}, others just return an array
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}
function renderDraftResults() {
  const tbody = document.querySelector('#draft-results-table tbody');
  if (!draftResults.length) {
    tbody.innerHTML = '<tr><td colspan="6">No draft results found.</td></tr>';
    return;
  }
  tbody.innerHTML = draftResults.map(r => `
    <tr>
      <td>${r.student?.name || '-'}</td>
      <td>${r.class?.name || '-'}</td>
      <td>${r.term || '-'}</td>
      <td>${r.status || '-'}</td>
      <td>${r.updatedAt ? new Date(r.updatedAt).toLocaleString() : '-'}</td>
      <td>
        <button onclick="openResultModal('${r.student?._id}','${r.class?._id}')">Edit</button>
        <button class="btn danger" onclick="alert('You cannot publish. Contact Admin.')">Publish</button>
      </td>
    </tr>
  `).join('');
}
async function fetchTeacherCBTs() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    // Defensive: data may be array or {cbts:[...]}
    return Array.isArray(data) ? data : data.cbts || [];
  } catch { return []; }
}
async function fetchAndSetup() {
  try {
    teacher = await fetchTeacherProfile();
    if (!teacher) throw new Error("Failed to load teacher profile.");

    document.querySelector('.profile-section strong').textContent = teacher.name;
    document.querySelector('.profile-section small').textContent = teacher.designation || '';
    document.querySelector('header h1').textContent = `Welcome, ${teacher.name}`;
    document.querySelector('.avatar').textContent = (teacher.name || '').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

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

    renderClassesList();
    renderStudentsBlock();
    renderSubjectsBlock();
    showAddSubjectBlock();
  } catch (err) {
    alert(err.message || "Dashboard failed to load.");
  } finally {
    hideDashboardSpinner(); // <-- ALWAYS hide spinner
  }
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
// --- UI LOGIC ---
const sidebarBtns = document.querySelectorAll('.sidebar nav button');
const sections = {
  dashboard: document.getElementById('section-dashboard'),
  classes: document.getElementById('section-dashboard'),
  attendance: document.getElementById('section-attendance'),
  gradebook: document.getElementById('section-gradebook'),
  assignments: document.getElementById('section-assignments'),
  draftResults: document.getElementById('section-draftResults'),
  notifications: document.getElementById('section-notifications'),
  profile: document.getElementById('section-profile'),
  cbtQuestions: document.getElementById('section-cbtQuestions'),
  myCBTQuestions: document.getElementById('section-myCBTQuestions'),
  cbtResults: document.getElementById('section-cbtResults') // <-- Add this line
};

// --- Add to sidebar navigation logic ---
sidebarBtns.forEach(btn => {
  btn.onclick = function () {
    sidebarBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(sections).forEach(s => s.style.display = 'none');
    const sec = btn.getAttribute('data-section');
    sections[sec].style.display = '';
    if (sec === 'draftResults') renderDraftResults();
    if (sec === 'notifications') renderNotifications();
    if (sec === 'attendance') renderAttendance();
    if (sec === 'gradebook') renderGradebook();
    if (sec === 'assignments') renderAssignments();
    if (sec === 'myCBTQuestions') showMyCBTQuestionsSection();
    if (sec === 'cbtQuestions') renderCBTQuestionSection();
    if (sec === 'cbtResults') renderCBTResultsSection(); // <-- Add this line
    if (sec === 'dashboard' || sec === 'classes') {
      renderClassesList();
      renderStudentsBlock();
      renderSubjectsBlock();
      showAddSubjectBlock();
    }
  }
});

// Hamburger menu for sidebar (mobile)
function toggleSidebarMenu() {
  document.querySelector('.sidebar').classList.toggle('open');
}
function updateHamburger() {
  const hamburger = document.querySelector('.sidebar .hamburger');
  if (!hamburger) return;
  if (window.innerWidth <= 600) {
    hamburger.style.display = 'block';
  } else {
    hamburger.style.display = 'none';
    document.querySelector('.sidebar').classList.remove('open');
  }
}
window.addEventListener('resize', updateHamburger);
window.addEventListener('DOMContentLoaded', updateHamburger);

// --- Classes List ---
let selectedClassId = null;
function renderClassesList() {
  const classList = document.getElementById('class-list');
  classList.innerHTML = '';
  if (!teacher.classes || teacher.classes.length === 0) return;

  // Auto-select first class if none is selected
  if (!selectedClassId) {
    selectedClassId = teacher.classes[0].id;
  }

  teacher.classes.forEach(cls => {
    const li = document.createElement('li');
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
    li.appendChild(btn);
    classList.appendChild(li);
  });

  renderStudentsBlock();
  renderSubjectsBlock();
  showAddSubjectBlock();
}

function renderStudentsBlock() {
  const block = document.getElementById('students-block');
  block.innerHTML = '';
  if (!selectedClassId) return;
  const students = studentsByClass[selectedClassId] || [];
  if (students.length === 0) {
    block.innerHTML = '<div class="card students-table"><em>No students found in this class.</em></div>';
    return;
  }
  let html = `<div class="card students-table"><h2>Students in ${teacher.classes.find(c => c.id === selectedClassId).name}</h2>
    <table>
      <thead><tr>
        <th>Name</th><th>Reg. No.</th><th>Email</th><th>Actions</th>
      </tr></thead>
      <tbody>`;
  students.forEach(stu => {
    html += `<tr>
      <td data-label="Name">${stu.name}</td>
      <td data-label="Reg. No.">${stu.regNo}</td>
      <td data-label="Email">${stu.email}</td>
      <td class="actions" data-label="Actions">
        <button class="btn" onclick="openResultModal('${stu.id}','${selectedClassId}')">Enter/Update Result</button>
        <button class="btn" onclick="alert('Profile for ${stu.name}')">View Profile</button>
      </td>
    </tr>`;
  });
  html += `</tbody></table></div>`;
  block.innerHTML = html;
}

function renderSubjectsBlock() {
  const block = document.getElementById('subjects-block');
  block.innerHTML = '';
  if (!selectedClassId) return;
  const subjects = subjectsByClass[selectedClassId] || [];
  if (subjects.length === 0) {
    block.innerHTML = '<div class="card"><em>No subjects found for this class.</em></div>';
    return;
  }
  let html = `<div class="card"><h2>Subjects for ${teacher.classes.find(c => c.id === selectedClassId).name}</h2><ul>`;
  subjects.forEach(subj => {
    // Handles both object and string
    html += `<li>${subj.name || subj}</li>`;
  });
  html += '</ul></div>';
  block.innerHTML = html;
}

// --- Add Subject to Class ---
function showAddSubjectBlock() {
  const block = document.getElementById('add-subject-block');
  if (!block) return;
  if (selectedClassId) {
    block.style.display = '';
  } else {
    block.style.display = 'none';
  }
}

// Attach event listener for adding a subject
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
      // Always refetch to update UI with latest format
      subjectsByClass[selectedClassId] = await fetchSubjectsByClass(selectedClassId);
      renderSubjectsBlock();
      alert('Subject added!');
    } catch {
      alert('Failed to add subject.');
    }
  };
}
// --- Add to sections map ---




// --- CBT Results Section Logic ---
async function fetchCBTResultsForClass(classId) {
  try {
    // Adjust endpoint if needed!
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt-results?classId=${encodeURIComponent(classId)}`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    // Defensive: array or {results: [...]}
    return Array.isArray(data) ? data : (data.results || []);
  } catch {
    return [];
  }
}

async function renderCBTResultsSection() {
  const container = document.getElementById('cbtResultsContainer');
  container.innerHTML = '<div style="padding:2em;text-align:center;color:#888;"><i class="fa fa-spinner fa-spin"></i> Loading CBT results...</div>';
  if (!teacher || !teacher.classes || teacher.classes.length === 0) {
    container.innerHTML = '<div style="padding:2em;text-align:center;color:#888;">No classes assigned.</div>';
    return;
  }
  let html = '';
  // Loop through each class
  for (const cls of teacher.classes) {
    const results = await fetchCBTResultsForClass(cls.id);
    html += `
      <div class="card" style="margin-bottom:2.5em;box-shadow:0 2px 12px #ddeaff44;">
        <h3 style="color:#2647a6;font-size:1.2em;margin-bottom:0.5em;">Class: <span style="color:#1e88e5;">${cls.name}</span></h3>
        ${results.length === 0
          ? `<div style="color:#888;padding:1em 0;">No CBT results for this class.</div>`
          : `<table style="width:100%;border-collapse:collapse;">
              <thead style="background:#f6f8fa;">
                <tr>
                  <th style="padding:8px;">Exam Title</th>
                  <th style="padding:8px;">Student</th>
                  <th style="padding:8px;">Score</th>
                  <th style="padding:8px;">Started</th>
                  <th style="padding:8px;">Finished</th>
                  <th style="padding:8px;">Details</th>
                </tr>
              </thead>
              <tbody>
                ${results.map(r => `
                  <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:8px;">${r.examTitle || '-'}</td>
                    <td style="padding:8px;">${r.studentName || '-'}</td>
                    <td style="padding:8px;font-weight:bold;color:#159d5e;">${r.score} / ${r.total}</td>
                    <td style="padding:8px;">${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
                    <td style="padding:8px;">${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</td>
                    <td style="padding:8px;"><button class="btn" onclick="viewCBTResult('${r._id}')"><i class="fa fa-eye"></i></button></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
        }
      </div>
    `;
  }
  container.innerHTML = html;
}

// --- CBT Result Detail Modal ---
window.viewCBTResult = async function(resultId) {
  // GET /api/teachers/{teacherId}/cbt-results/{resultId}
  const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt-results/${resultId}`, { headers: authHeaders() });
  const r = await res.json();
  // Modal style (reuse modal or create new)
  let modal = document.getElementById('cbtResultModalBg');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'cbtResultModalBg';
    modal.className = 'form-modal-bg';
    modal.style.display = 'flex';
    modal.innerHTML = `
      <div class="form-modal">
        <button class="close-btn" onclick="document.getElementById('cbtResultModalBg').style.display='none';">&times;</button>
        <h3>CBT Result Detail</h3>
        <div id="cbtResultDetail"></div>
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    modal.style.display = 'flex';
  }
  document.getElementById('cbtResultDetail').innerHTML = `
    <div><b>Student:</b> ${r.studentName}</div>
    <div><b>Class:</b> ${r.className}</div>
    <div><b>Exam Title:</b> ${r.examTitle}</div>
    <div><b>Score:</b> ${r.score} / ${r.total}</div>
    <div><b>Started:</b> ${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</div>
    <div><b>Finished:</b> ${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</div>
    <div><b>Answers:</b><pre style="background:#f8fafc;border-radius:7px;padding:1em;margin-top:0.6em;">${JSON.stringify(r.answers, null, 2)}</pre></div>
  `;
};

// Optional: Hide modal when clicking outside
document.body.addEventListener('click', function(e) {
  const modal = document.getElementById('cbtResultModalBg');
  if (modal && modal.style.display === 'flex' && e.target === modal) modal.style.display = 'none';
});

// Fetch all CBTs uploaded by this teacher
async function fetchMyCBTQuestions() {
  try {
    const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt`, { headers: authHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.cbts || []); // <-- This ensures you always get an array!
  } catch {
    return [];
  }
}


function renderMyCBTQuestions() {
  const listDiv = document.getElementById('myCBTQuestionsList');
  const pushBtn = document.getElementById('pushToUniversalBtn');
  if (!myUploadedCBTs.length) {
    listDiv.innerHTML = '<div style="color:#888; padding:2em 0;">No CBTs uploaded yet.</div>';
    pushBtn.disabled = true;
    return;
  }
  let html = '';
  myUploadedCBTs.forEach((cbt, i) => {
    const questionCount = cbt.questions ? cbt.questions.length : 0;
    html += `
      <div class="cbt-item" style="border:1px solid #eee; border-radius:7px; margin-bottom:12px; box-shadow:0 2px 8px #0001;">
        <div class="cbt-header" style="cursor:pointer; padding:12px 8px; font-weight:bold; font-size:1.1em; display:flex;align-items:center;" onclick="toggleCBTQuestions(${i})">
          <input type="checkbox" class="cbt-select-checkbox" data-cbtid="${cbt._id}" ${selectedCBTIds.includes(cbt._id) ? 'checked' : ''} style="margin-right:9px;" onclick="event.stopPropagation();">
          <span>${cbt.title || '(Untitled CBT)'}</span>
          <span style="margin-left:auto; color:#555; font-size:0.9em;">${cbt.duration||''} min · ${questionCount} question${questionCount!==1?'s':''}</span>
          <span style="margin-left:10px;" id="cbt-q-arrow-${i}">&#9654;</span>
          <button class="cbt-delete-btn" title="Delete" data-cbtid="${cbt._id}" style="margin-left:12px; color:#c00; background:none; border:none; cursor:pointer;"><i class="fa fa-trash"></i></button>
        </div>
        <div class="cbt-questions" id="cbt-questions-${i}" style="display:none; padding:10px 20px 15px 35px;">
          ${cbt.questions && cbt.questions.length
            ? cbt.questions.map((q, qidx) => `
  <div class="cbt-question-view" style="margin-bottom:1.2em; border-bottom:1px solid #eee; padding-bottom:10px;">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <div style="font-weight:600;">
        Q${qidx+1}: 
        <span style="font-weight:normal;" class="cbt-q-text">${q.text}</span>
      </div>
      <div>
        <button class="cbt-edit-q-btn" title="Edit" data-cbtidx="${i}" data-qidx="${qidx}" style="background:none;border:none;color:#1e88e5;font-size:1.1em;margin-right:10px;cursor:pointer;">
          <i class="fa fa-edit"></i>
        </button>
        <button class="cbt-delete-q-btn" title="Delete" data-cbtidx="${i}" data-qidx="${qidx}" style="background:none;border:none;color:#c00;font-size:1.1em;cursor:pointer;">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>
    <ol style="margin:4px 0 0 20px; padding:0;">
      ${q.options.map((opt, oi) =>
        `<li style="margin:0.2em 0;${q.answer===oi?'font-weight:bold;color:#159d5e;':''}">
          <span class="cbt-q-opt">${opt.value}${q.answer===oi ? ' <span style="color:#159d5e;">&#10003;</span>' : ''}</span>
        </li>`
      ).join('')}
    </ol>
    <div style="font-size:0.96em;color:#555;">Score: ${q.score||1}</div>
  </div>
`).join('')
            : '<div style="color:#999;">No questions in this CBT.</div>'
          }
        </div>
      </div>
    `;
  });
  listDiv.innerHTML = html;

  // --- Style images in rendered HTML (questions/options) ---
  setTimeout(() => {
    document.querySelectorAll('.cbt-q-text img, .cbt-q-opt img').forEach(img => {
      img.style.maxWidth = '96%';
      img.style.height = 'auto';
      img.style.display = 'block';
      img.style.margin = '12px 0';
      img.style.borderRadius = '7px';
      img.style.boxShadow = '0 2px 10px #0001';
    });
  }, 0);

  window.toggleCBTQuestions = function(idx) {
    const qDiv = document.getElementById('cbt-questions-' + idx);
    const arrow = document.getElementById('cbt-q-arrow-' + idx);
    if (!qDiv) return;
    const expanded = qDiv.style.display === '' || qDiv.style.display === 'block';
    qDiv.style.display = expanded ? 'none' : 'block';
    arrow.innerHTML = expanded ? '&#9654;' : '&#9660;';
  };

  // Select individual checkboxes
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

  // Delete CBT (entire)
  listDiv.querySelectorAll('.cbt-delete-btn').forEach(btn => {
    btn.onclick = async function(e) {
      e.stopPropagation();
      const id = btn.getAttribute('data-cbtid');
      // No alert, just delete and refresh!
      const res = await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${id}`, { method: "DELETE", headers: authHeaders() });
      if (res.ok) {
        myUploadedCBTs = await fetchMyCBTQuestions();
        selectedCBTIds = selectedCBTIds.filter(cid => cid !== id);
        renderMyCBTQuestions();
      }
    }
  });

  // Delete Question within a CBT
  listDiv.querySelectorAll('.cbt-delete-q-btn').forEach(btn => {
    btn.onclick = async function(e) {
      e.stopPropagation();
      const cbtIdx = parseInt(btn.getAttribute('data-cbtidx'));
      const qIdx = parseInt(btn.getAttribute('data-qidx'));
      const cbt = myUploadedCBTs[cbtIdx];
      cbt.questions.splice(qIdx, 1);
      await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${cbt._id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ questions: cbt.questions })
      });
      myUploadedCBTs = await fetchMyCBTQuestions();
      renderMyCBTQuestions();
    }
  });

  // Edit Question (opens modal)
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

// --- Edit Modal Logic ---
function ensureEditModal() {
  if (!document.getElementById('cbt-edit-modal-bg')) {
    const m = document.createElement('div');
    m.id = 'cbt-edit-modal-bg';
    m.innerHTML = `
      <div id="cbt-edit-modal">
        <div style="font-size:1.1em; font-weight:bold; margin-bottom:0.8em;">Edit Question</div>
        <div id="cbt-edit-modal-fields"></div>
        <div style="text-align:right;">
          <button id="cbt-edit-modal-cancel" style="margin-right:10px;">Cancel</button>
          <button id="cbt-edit-modal-save" style="background:#1e88e5;color:#fff;">Save</button>
        </div>
      </div>
    `;
    m.style.display = "none";
    document.body.appendChild(m);
  }
}
function openEditCBTQuestionModal(cbtIdx, qIdx) {
  ensureEditModal();
  const modalBg = document.getElementById('cbt-edit-modal-bg');
  const fieldsDiv = document.getElementById('cbt-edit-modal-fields');
  const cbt = myUploadedCBTs[cbtIdx];
  const q = cbt.questions[qIdx];
  // Simple HTML form (can be improved!)
  fieldsDiv.innerHTML = `
    <label>Question Text (supports HTML):</label>
    <textarea id="cbt-edit-q-text" rows="3" style="width:99%;">${q.text.replace(/<\/?[^>]+(>|$)/g, "")}</textarea>
    <label>Options (one per line):</label>
    <textarea id="cbt-edit-q-opts" rows="4" style="width:99%;">${q.options.map(o=>o.value.replace(/<\/?[^>]+(>|$)/g, "")).join('\n')}</textarea>
    <label>Correct Option (1-based):</label>
    <input type="number" id="cbt-edit-q-answer" min="1" max="${q.options.length}" value="${(q.answer||0)+1}">
    <label>Score:</label>
    <input type="number" min="1" id="cbt-edit-q-score" value="${q.score||1}">
  `;
  modalBg.style.display = "flex";
  document.getElementById('cbt-edit-modal-cancel').onclick = ()=>{ modalBg.style.display="none"; };
  document.getElementById('cbt-edit-modal-save').onclick = async function() {
    // Save changes
    const newText = document.getElementById('cbt-edit-q-text').value;
    const newOpts = document.getElementById('cbt-edit-q-opts').value.split('\n').filter(Boolean).map(val=>({value:val}));
    let newAns = parseInt(document.getElementById('cbt-edit-q-answer').value) - 1;
    if (newAns < 0) newAns = 0;
    if (newAns >= newOpts.length) newAns = newOpts.length - 1;
    const newScore = parseInt(document.getElementById('cbt-edit-q-score').value) || 1;
    cbt.questions[qIdx] = {
      text: newText,
      options: newOpts,
      answer: newAns,
      score: newScore,
    };
    await fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/cbt/${cbt._id}`, {
      method: "PATCH",
      headers: authHeaders(),
      body: JSON.stringify({ questions: cbt.questions })
    });
    modalBg.style.display = "none";
    myUploadedCBTs = await fetchMyCBTQuestions();
    renderMyCBTQuestions();
  };
}

// Initial fetch and render for the section
async function showMyCBTQuestionsSection() {
  myUploadedCBTs = await fetchMyCBTQuestions();
  selectedCBTIds = [];
  renderMyCBTQuestions();
}
  
document.getElementById('pushToUniversalBtn').onclick = async function() {
  if (!selectedCBTIds.length) return;
  // Gather selected CBTs
  const selectedCBTs = myUploadedCBTs.filter(q => selectedCBTIds.includes(q._id));
  if (!selectedCBTs.length) return;

  // Confirm action
  if (!confirm(`Push ${selectedCBTs.length} selected CBT(s) to universal document?`)) return;

  this.disabled = true;
  this.innerHTML = '<span class="cbt-loader-spinner"></span>Pushing...';

  // Push one by one, or as batch if your API supports (here, do individually as in admin-cbt)
  let successCount = 0;
  for (const cbt of selectedCBTs) {
    try {
      // Use the same structure as admin-cbt (POST /api/exam)
      const payload = {
        title: cbt.title,
        class: cbt.class, // use the proper class id, not name
        subject: cbt.subject, // use the proper subject id, not name
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
  this.innerHTML = 'Push Selected to Universal Document';
  alert(`${successCount} CBT(s) pushed to universal successfully.`);
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
  let html = `<table>
      <thead><tr><th>Student</th><th>Present</th></tr></thead>
      <tbody>`;
  students.forEach(stu => {
    const record = (attendanceRecords.find(a => a.classId === classId && a.studentId === stu.id) || { present: false });
    html += `<tr>
      <td data-label="Student">${stu.name}</td>
      <td data-label="Present"><input type="checkbox" name="present_${stu.id}" ${record.present ? 'checked' : ''}></td>
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
  // Optionally: POST attendance to backend here, e.g.:
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
  let html = `<table>
      <thead><tr><th>Student</th>`;
  subjects.forEach(subj => html += `<th>${subj.name}</th>`);
  html += `</tr></thead><tbody>`;
  students.forEach(stu => {
    html += `<tr><td data-label="Student">${stu.name}</td>`;
    subjects.forEach(subj => {
      const gb = (gradebookData[classId] && gradebookData[classId][stu.id] && gradebookData[classId][stu.id][subj.id]) || '-';
      html += `<td data-label="${subj.name}">${gb}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('gradebook-table').innerHTML = html;
}



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
  document.getElementById('assignmentModalBg').style.display = 'flex';
  populateAssignmentSubjects();
  document.getElementById('assignment-class').onchange = populateAssignmentSubjects;

  // Fetch and populate CBTs
  cbts = await fetchTeacherCBTs();
  populateAssignmentCBTs();
}

function renderAssignmentList() {
  const div = document.getElementById('assignment-list');
  if (!assignments.length) {
    div.innerHTML = '<em>No assignments yet.</em>';
    return;
  }
  let html = '<table><thead><tr><th>Title</th><th>Class</th><th>Due</th><th>CBT</th><th>Description</th></tr></thead><tbody>';
  assignments.forEach(a => {
    const classId = a.class && a.class._id ? a.class._id : a.class;
    const cls = teacher.classes.find(c => c.id == classId);
    let cbtTitle = '';
    if (a.cbt) {
      // Try to find CBT title if available
      const found = cbts.find(cbt => cbt._id === a.cbt);
      cbtTitle = found ? found.title : a.cbt;
    }
    html += `<tr>
      <td data-label="Title">${a.title}</td>
      <td data-label="Class">${(a.class && a.class.name) || (cls && cls.name) || classId || 'Unknown'}</td>
      <td data-label="Due">${a.dueDate ? a.dueDate.slice(0,10) : (a.due || '')}</td>
      <td data-label="CBT">${cbtTitle || '-'}</td>
      <td data-label="Description">${a.description || a.desc}</td>
    </tr>`;
  });
  html += '</tbody></table>';
  div.innerHTML = html;
}

function closeAssignmentModal() {
  document.getElementById('assignmentModalBg').style.display = 'none';
}
// Submission handler for creating assignments
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
  if (cbtId) assignment.cbt = cbtId; // <-- Add CBT id if selected

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
  let html = '<h4 style="margin:10px 0 7px 0;">Subjects & Scores</h4>';
  subjects.forEach(subj => {
    const data = (result.data && result.data[subj.id]) || {};
    html += `
      <label>${subj.name} - CA</label>
      <input type="number" min="0" max="20" name="ca_${subj.id}" value="${data.ca || ''}" required>
      <label>${subj.name} - Mid Term</label>
      <input type="number" min="0" max="20" name="mid_${subj.id}" value="${data.mid || ''}" required>
      <label>${subj.name} - Exam</label>
      <input type="number" min="0" max="60" name="exam_${subj.id}" value="${data.exam || ''}" required>
      <label>${subj.name} - Teacher's Comment</label>
      <input type="text" name="comment_${subj.id}" value="${data.comment || ''}">
    `;
  });
  html += `<h4 style="margin-top:15px;">Affective Skills (1-5)</h4>`;
  const affectiveSkills = ['Punctuality', 'Attentiveness', 'Neatness', 'Honesty', 'Politeness', 'Perseverance', 'Relationship with Others', 'Organization Ability'];
  affectiveSkills.forEach(skill => {
    html += `<label>${skill}</label>
      <input type="number" min="1" max="5" name="affective_${skill.toLowerCase().replace(/ /g, '_')}" value="${(result.affectiveRatings && result.affectiveRatings[skill]) || ''}">`;
  });
  html += `<h4 style="margin-top:15px;">Psychomotor Skills (1-5)</h4>`;
  const psychomotorSkills = ['Hand Writing', 'Drawing and Painting', 'Speech / Verbal Fluency', 'Quantitative Reasoning', 'Processing Speed', 'Retentiveness', 'Visual Memory', 'Public Speaking', 'Sports and Games'];
  psychomotorSkills.forEach(skill => {
    html += `<label>${skill}</label>
      <input type="number" min="1" max="5" name="psychomotor_${skill.toLowerCase().replace(/ |\//g, '_')}" value="${(result.psychomotorRatings && result.psychomotorRatings[skill]) || ''}">`;
  });
  html += `<h4 style="margin-top:15px;">Attendance</h4>
    <label>No. of School Days</label>
    <input type="number" min="0" name="attendance_total" value="${result.attendanceTotal || ''}">
    <label>No. of Days Present</label>
    <input type="number" min="0" name="attendance_present" value="${result.attendancePresent || ''}">
    <label>No. of Days Absent</label>
    <input type="number" min="0" name="attendance_absent" value="${result.attendanceAbsent || ''}">
    <label>% Attendance</label>
    <input type="number" min="0" max="100" step="0.01" name="attendance_percent" value="${result.attendancePercent || ''}">
  `;
  document.getElementById('resultFormFields').innerHTML = html;
  document.getElementById('resultModalBg').style.display = 'flex';
}
function closeResultModal() {
  document.getElementById('resultModalBg').style.display = 'none';
  currentResultStudentId = currentResultClassId = null;
}
document.getElementById('resultForm').onsubmit = async function (e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const subjects = subjectsByClass[currentResultClassId] || [];
  // --- Build subjects array for backend ---
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

  // --- Skills ---
  let affectiveRatings = {};
  ['Punctuality', 'Attentiveness', 'Neatness', 'Honesty', 'Politeness', 'Perseverance', 'Relationship with Others', 'Organization Ability']
    .forEach(skill => affectiveRatings[skill] = Number(fd.get(`affective_${skill.toLowerCase().replace(/ /g, '_')}`)));
  let psychomotorRatings = {};
  ['Hand Writing', 'Drawing and Painting', 'Speech / Verbal Fluency', 'Quantitative Reasoning', 'Processing Speed', 'Retentiveness', 'Visual Memory', 'Public Speaking', 'Sports and Games']
    .forEach(skill => psychomotorRatings[skill] = Number(fd.get(`psychomotor_${skill.toLowerCase().replace(/ |\//g, '_')}`)));

  // --- Attendance ---
  let attendanceTotal = Number(fd.get('attendance_total'));
  let attendancePresent = Number(fd.get('attendance_present'));
  let attendanceAbsent = Number(fd.get('attendance_absent'));
  let attendancePercent = Number(fd.get('attendance_percent'));

  // --- Term/session values: get from your UI (dropdown/select), or hardcode for now
  const term = "FIRST TERM"; // Or get from a select/dropdown
  const session = "2024–2025"; // Or get from a select/dropdown

  // --- Compose payload for backend ---
  const payload = {
    student: currentResultStudentId,
    class: currentResultClassId,
    term,
    session,
    subjects: subjectsPayload,
    affectiveRatings,
    psychomotorRatings,
    attendanceTotal,
    attendancePresent,
    attendanceAbsent,
    attendancePercent,
    status: "Draft" // Or "Published"
  };

  // --- POST to new backend endpoint ---
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
    teacherResults = await fetchTeacherAllResults();
    renderTeacherResults(); // You may want to fetch published results instead!
  } catch (err) {
    alert('Failed to save results: ' + err.message);
  }
};
async function fetchTeacherAllResults() {
  try {
    // Fetch drafts and published in parallel
    const [draftRes, publishedRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results?status=Draft`, { headers: authHeaders() }),
      fetch(`${API_BASE_URL}/api/teachers/${encodeURIComponent(teacher.id)}/results?status=Published`, { headers: authHeaders() })
    ]);
    let draftResults = [];
    let publishedResults = [];
    if (draftRes.ok) {
      const drData = await draftRes.json();
      draftResults = Array.isArray(drData.results) ? drData.results : [];
    }
    if (publishedRes.ok) {
      const prData = await publishedRes.json();
      publishedResults = Array.isArray(prData.results) ? prData.results : [];
    }
    // Combine both arrays (optionally sort by updatedAt descending)
    return [...draftResults, ...publishedResults].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  } catch {
    return [];
  }
}
function renderTeacherResults() {
  const tbody = document.querySelector('#draft-results-table tbody');
  tbody.innerHTML = '';
  teacherResults.forEach(dr => {
    const stu = dr.student || {};
    const cls = dr.class || {};
    let statusColor = dr.status === "Published" ? "var(--accent)" : "var(--warning)";
    let tr = document.createElement('tr');
    tr.innerHTML = `<td data-label="Student">${stu.name || stu.firstname || '[Unknown]'}</td>
      <td data-label="Class">${cls.name || '[Unknown]'}</td>
      <td data-label="Term">${dr.term || ''}</td>
      <td data-label="Status" style="color:${statusColor};font-weight:bold">${dr.status || ''}</td>
      <td data-label="Last Updated">${dr.updatedAt ? new Date(dr.updatedAt).toLocaleString() : ''}</td>
      <td data-label="Actions">
        <button class="btn" onclick="openResultModal('${stu._id}','${cls._id}')">Edit</button>
        <button class="btn danger" onclick="alert('You cannot publish. Contact Admin.')">Publish</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
            }
// --- Notifications ---
function renderNotifications() {
  const list = document.getElementById('notification-list');
  list.innerHTML = `<h2>Notifications</h2>`;
  notifications.forEach(note => {
    const div = document.createElement('div');
    div.className = 'notification';
    div.innerHTML = `<span class="date">${note.date}</span> <span>${note.message}</span>`;
    list.appendChild(div);
  });
}

// --- Profile Update (Now connected to backend!) ---
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
      if (confirm("It looks like you have an unfinished CBT draft. Restore it?")) {
        justRestoredDraft = true;
        cbtQuestions = Array.isArray(draft.questions) ? draft.questions : [];
        // 1. Set class; 2. When changed, populate subjects; 3. TRY subject, then fill the rest and render
        classSel.value = draft.classId || '';
        classSel.dispatchEvent(new Event('change')); // populates subjSel

        // Try setting subjectId after class/subject dropdown is updated.
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
    qDiv.innerHTML = `
      <div class="cbt-question-header">
        <span>Question ${idx+1}</span>
        <button type="button" class="cbt-remove-q-btn" title="Remove" onclick="removeCBTQuestion(${idx})"><i class="fa fa-trash"></i></button>
      </div>
      <div class="cbt-question-label">Question Text</div>
      <div id="cbt-qtext-quill-${idx}" class="quill-editor"></div>
      <div class="cbt-question-label">Score</div>
      <input type="number" min="1" class="cbt-input cbt-qscore" value="${q.score||1}" placeholder="Score" style="max-width:110px;margin-bottom:0.7em;">
      <div class="cbt-question-label">Options</div>
      <div class="cbt-options-list" id="cbt-options-list-${idx}"></div>
      <button type="button" class="cbt-add-opt-btn" onclick="addCBTOption(${idx})"><i class="fa fa-plus"></i> Add Option</button>
    `;
    listDiv.appendChild(qDiv);

    // Initialize Quill for question
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
  // Save on update
  saveCBTDraftToLocalStorage();
}

function renderCBTOptions(qidx) {
  const optionsDiv = document.getElementById(`cbt-options-list-${qidx}`);
  optionsDiv.innerHTML = '';
  (cbtQuestions[qidx].options||[]).forEach((opt, oi) => {
    let optDiv = document.createElement('div');
    optDiv.className = 'cbt-option-row';
    optDiv.innerHTML = `
      <input type="radio" class="cbt-option-radio" name="cbt-correct-${qidx}" ${cbtQuestions[qidx].answer===oi?'checked':''} onclick="setCBTCorrect(${qidx},${oi})" title="Mark as correct">
      <div id="cbt-q${qidx}-opt-quill-${oi}" class="quill-editor" style="width:100%;max-width:420px;"></div>
      <button type="button" class="cbt-remove-opt-btn" onclick="removeCBTOption(${qidx},${oi})" title="Remove"><i class="fa fa-trash"></i></button>
    `;
    optionsDiv.appendChild(optDiv);
    // Quill for option
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

// MODIFIED window.removeCBTQuestion etc
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
  btn.innerHTML = '<span class="cbt-loader-spinner"></span>Uploading...';
  msgDiv.textContent = '';
  msgDiv.style.color = '#15a55a';

  // ... validation logic unchanged ...
  const classId = document.getElementById('cbt-class-select').value;
  const subjectId = document.getElementById('cbt-subject-select').value;
  const title = document.getElementById('cbt-title').value.trim();
  const duration = Number(document.getElementById('cbt-duration').value);

  if (!classId || !subjectId || !title || !duration) {
    msgDiv.style.color = 'red';
    msgDiv.textContent = 'Please fill all fields.';
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
    return;
  }
  if (!cbtQuestions.length) {
    msgDiv.style.color = 'red';
    msgDiv.textContent = 'Add at least one question.';
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
    return;
  }
  for (let [i, q] of cbtQuestions.entries()) {
    if (!q.text || !Array.isArray(q.options) || q.options.length < 2) {
      msgDiv.style.color = 'red';
      msgDiv.textContent = `Question ${i+1} must have text and at least 2 options.`;
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
      return;
    }
    for (let o of q.options) {
      if (!o.value) {
        msgDiv.style.color = 'red';
        msgDiv.textContent = `No empty options allowed.`;
        btn.disabled = false;
        btn.innerHTML = originalBtnHTML;
        return;
      }
    }
    if (typeof q.answer !== 'number' || q.answer < 0 || q.answer >= q.options.length) {
      msgDiv.style.color = 'red';
      msgDiv.textContent = `Select a correct option for Question ${i+1}.`;
      btn.disabled = false;
      btn.innerHTML = originalBtnHTML;
      return;
    }
  }
  // Submit
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
    msgDiv.style.color = 'green';
    msgDiv.textContent = 'CBT uploaded successfully!';
    cbtQuestions = [];
    renderCBTQuestions();
    clearCBTDraftFromLocalStorage(); // <-- CLEAR DRAFT ON SUCCESS
  } catch (err) {
    msgDiv.style.color = 'red';
    msgDiv.textContent = 'Upload failed: ' + err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalBtnHTML;
  }
};

// --- Initial Render (called after data is fetched) ---
window.renderClassesList = renderClassesList;
window.renderStudentsBlock = renderStudentsBlock;
window.renderSubjectsBlock = renderSubjectsBlock;
window.openAssignmentModal = openAssignmentModal;
window.closeAssignmentModal = closeAssignmentModal;
window.openResultModal = openResultModal;
window.closeResultModal = closeResultModal;

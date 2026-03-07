// ===== CONFIGURATION =====
const API_BASE_URL = "https://goldlincschools.onrender.com/api";
const token = localStorage.getItem('token') || localStorage.getItem('teacherToken') || localStorage.getItem('teacher_token') || '';
const cbtDraftKey = 'teacher_cbt_draft';

let currentTeacher = null;
let teacherClasses = [];
let teacherAssignments = [];
let teacherResults = [];
let cbtQuestions = [];
let myCBTs = [];
let selectedCBTIndex = -1;
let currentResultStudentId = null;
let currentResultClassId = null;

// ===== SPINNER FUNCTIONS =====
function showDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) {
    spinner.style.display = 'flex';
    spinner.classList.remove('hidden');
  }
}

function hideDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) {
    spinner.classList.add('hidden');
    setTimeout(() => { spinner.style.display = 'none'; }, 400);
  }
}

// ===== CBT DRAFT STORAGE =====
function saveCBTDraftToLocalStorage() {
  const draft = {
    classId: document.getElementById('cbt-class-select')?.value || '',
    subjectId: document.getElementById('cbt-subject-select')?.value || '',
    title: document.getElementById('cbt-title')?.value || '',
    duration: document.getElementById('cbt-duration')?.value || '',
    questions: cbtQuestions
  };
  localStorage.setItem(cbtDraftKey, JSON.stringify(draft));
}

function loadCBTDraftFromLocalStorage() {
  const draft = localStorage.getItem(cbtDraftKey);
  if (draft) {
    try {
      const data = JSON.parse(draft);
      cbtQuestions = data.questions || [];
      
      // Populate form if elements exist
      if (document.getElementById('cbt-class-select')) {
        document.getElementById('cbt-class-select').value = data.classId || '';
      }
      if (document.getElementById('cbt-subject-select')) {
        document.getElementById('cbt-subject-select').value = data.subjectId || '';
      }
      if (document.getElementById('cbt-title')) {
        document.getElementById('cbt-title').value = data.title || '';
      }
      if (document.getElementById('cbt-duration')) {
        document.getElementById('cbt-duration').value = data.duration || '';
      }
      
      return true;
    } catch (e) {
      console.error('Error loading CBT draft:', e);
      return false;
    }
  }
  return false;
}

function clearCBTDraftFromLocalStorage() {
  localStorage.removeItem(cbtDraftKey);
}

// ===== AUTH HEADERS =====
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// ===== API CALLS =====
async function fetchTeacherProfile() {
  try {
    showDashboardSpinner();
    const res = await fetch(`${API_BASE_URL}/teacher/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch teacher profile');
    
    const data = await res.json();
    currentTeacher = data;
    
    document.getElementById('teacherName').textContent = data.name || 'Teacher';
    document.getElementById('teacherSubject').textContent = data.subject || 'Teacher';
    
    return data;
  } catch (err) {
    console.error('Error fetching teacher profile:', err);
    return null;
  }
}

async function fetchTeacherClasses() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/classes`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch classes');
    
    teacherClasses = await res.json();
    return teacherClasses;
  } catch (err) {
    console.error('Error fetching teacher classes:', err);
    return [];
  }
}

async function fetchStudentsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/class/${classId}/students`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch students');
    
    return await res.json();
  } catch (err) {
    console.error('Error fetching students:', err);
    return [];
  }
}

async function fetchSubjectsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/class/${classId}/subjects`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch subjects');
    
    return await res.json();
  } catch (err) {
    console.error('Error fetching subjects:', err);
    return [];
  }
}

async function fetchAssignments() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/assignments`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch assignments');
    
    teacherAssignments = await res.json();
    return teacherAssignments;
  } catch (err) {
    console.error('Error fetching assignments:', err);
    return [];
  }
}

async function fetchDraftResults() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/results/draft`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch draft results');
    
    return await res.json();
  } catch (err) {
    console.error('Error fetching draft results:', err);
    return [];
  }
}

async function fetchTeacherNotifications() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/notifications`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    
    return await res.json();
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return [];
  }
}

async function fetchTeacherCBTs() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/cbts`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch CBTs');
    
    myCBTs = await res.json();
    return myCBTs;
  } catch (err) {
    console.error('Error fetching CBTs:', err);
    return [];
  }
}

async function fetchCBTResultsForClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/cbt-results?class=${classId}`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch CBT results');
    
    return await res.json();
  } catch (err) {
    console.error('Error fetching CBT results:', err);
    return [];
  }
}

async function fetchTeacherAllResults() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/results`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch results');
    
    teacherResults = await res.json();
    return teacherResults;
  } catch (err) {
    console.error('Error fetching results:', err);
    return [];
  }
}

// ===== RENDER FUNCTIONS =====
async function renderDashboard() {
  try {
    const classes = await fetchTeacherClasses();
    const classesStats = document.getElementById('classesStats');
    
    if (!classesStats) return;
    
    if (classes.length === 0) {
      classesStats.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-state-icon">📚</div>
          <div class="empty-state-title">No Classes Assigned</div>
          <p style="color: var(--muted);">You haven't been assigned any classes yet.</p>
        </div>
      `;
      return;
    }
    
    classesStats.innerHTML = classes.map(cls => `
      <div class="stat-card" onclick="navigateToClass('${cls._id}')">
        <div class="stat-icon" style="background: linear-gradient(90deg, var(--accent-2), #3b82f6);">
          <i class="fa fa-book"></i>
        </div>
        <div class="stat-value">${cls.name || ''}</div>
        <div class="stat-label">${cls.studentsCount || 0} Students</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Error rendering dashboard:', err);
  }
}

function renderClassesList() {
  const classList = document.getElementById('class-list');
  if (!classList) return;
  
  if (teacherClasses.length === 0) {
    classList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No Classes</div>
      </div>
    `;
    return;
  }
  
  classList.innerHTML = teacherClasses.map(cls => `
    <div class="list-item">
      <div>
        <strong>${cls.name}</strong><br>
        <small style="color: var(--muted);">${cls.studentsCount || 0} Students</small>
      </div>
      <button class="btn" onclick="navigateToClass('${cls._id}')">
        <i class="fa fa-arrow-right"></i>
      </button>
    </div>
  `).join('');
}

async function renderAttendance() {
  const classSelect = document.getElementById('attendance-class');
  if (!classSelect) return;
  
  classSelect.innerHTML = '<option value="">Select a class...</option>' + 
    teacherClasses.map(cls => `<option value="${cls._id}">${cls.name}</option>`).join('');
  
  classSelect.onchange = async function() {
    await renderAttendanceStudents();
  };
}

async function renderAttendanceStudents() {
  const classId = document.getElementById('attendance-class').value;
  const container = document.getElementById('attendance-students');
  
  if (!classId) {
    container.innerHTML = '';
    return;
  }
  
  const students = await fetchStudentsByClass(classId);
  
  if (students.length === 0) {
    container.innerHTML = '<p style="color: var(--muted);">No students in this class.</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="margin-top: 16px;">
      <h3 style="font-weight: 700; margin-bottom: 12px;">Mark Attendance</h3>
      ${students.map((student, idx) => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 10px; background: #f8faff; border-radius: 8px; margin-bottom: 8px;">
          <div style="flex: 1;">
            <strong>${student.firstname} ${student.surname}</strong><br>
            <small style="color: var(--muted);">${student.student_id}</small>
          </div>
          <select name="attendance_${idx}" style="padding: 8px; border: 1px solid #eef3ff; border-radius: 6px;">
            <option value="Present">Present</option>
            <option value="Absent">Absent</option>
            <option value="Late">Late</option>
            <option value="Excused">Excused</option>
            <option value="Leave">Leave</option>
          </select>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderGradebook() {
  const classSelect = document.getElementById('gradebook-class');
  if (!classSelect) return;
  
  classSelect.innerHTML = '<option value="">Select a class...</option>' + 
    teacherClasses.map(cls => `<option value="${cls._id}">${cls.name}</option>`).join('');
  
  classSelect.onchange = async function() {
    await renderGradebookTable();
  };
}

async function renderGradebookTable() {
  const classId = document.getElementById('gradebook-class').value;
  const container = document.getElementById('gradebook-table');
  
  if (!classId) {
    container.innerHTML = '';
    return;
  }
  
  const students = await fetchStudentsByClass(classId);
  const subjects = await fetchSubjectsByClass(classId);
  
  if (students.length === 0) {
    container.innerHTML = '<p style="color: var(--muted);">No students in this class.</p>';
    return;
  }
  
  let html = '<table style="width: 100%; border-collapse: collapse;"><thead><tr>';
  html += '<th style="text-align: left; padding: 10px; background: #f8faff; border-bottom: 2px solid #eef3ff;">Student Name</th>';
  
  (subjects || []).forEach(subj => {
    html += `<th style="text-align: center; padding: 10px; background: #f8faff; border-bottom: 2px solid #eef3ff;">${subj.name}</th>`;
  });
  
  html += '</tr></thead><tbody>';
  
  students.forEach(student => {
    html += `<tr style="border-bottom: 1px solid #eef3ff;"><td style="padding: 10px;"><strong>${student.firstname} ${student.surname}</strong></td>`;
    
    (subjects || []).forEach(subj => {
      html += `<td style="padding: 10px; text-align: center;"><input type="number" min="0" max="100" placeholder="Score" style="width: 70px; padding: 6px; border: 1px solid #eef3ff; border-radius: 4px;"></td>`;
    });
    
    html += '</tr>';
  });
  
  html += '</tbody></table>';
  container.innerHTML = html;
}

async function renderAssignments() {
  const assignments = await fetchAssignments();
  const container = document.getElementById('assignment-list');
  
  if (!container) return;
  
  if (assignments.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No Assignments</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = assignments.map(assign => `
    <div class="list-item">
      <div style="flex: 1;">
        <strong>${assign.title}</strong><br>
        <small style="color: var(--muted);">${assign.class?.name} | Due: ${new Date(assign.due).toLocaleDateString()}</small><br>
        <span class="badge badge-draft" style="margin-top: 6px; display: inline-block;">${assign.status || 'Active'}</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn secondary" onclick="editAssignment('${assign._id}')">
          <i class="fa fa-edit"></i>
        </button>
        <button class="btn secondary" onclick="deleteAssignment('${assign._id}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  await populateAssignmentSubjects();
}

async function populateAssignmentSubjects() {
  const classSelect = document.getElementById('assignment-class');
  const subjectSelect = document.getElementById('assignment-subject');
  const cbtSelect = document.getElementById('assignment-cbt');
  
  if (classSelect) {
    classSelect.innerHTML = teacherClasses.map(cls => `<option value="${cls._id}">${cls.name}</option>`).join('');
    
    classSelect.onchange = async function() {
      const subjects = await fetchSubjectsByClass(this.value);
      subjectSelect.innerHTML = subjects.map(subj => `<option value="${subj._id}">${subj.name}</option>`).join('');
    };
  }
  
  if (cbtSelect) {
    await fetchTeacherCBTs();
    cbtSelect.innerHTML = '<option value="">None - Regular Assignment</option>' + 
      myCBTs.map(cbt => `<option value="${cbt._id}">${cbt.title}</option>`).join('');
  }
}

async function renderDraftResults() {
  const draftResults = await fetchDraftResults();
  const tbody = document.getElementById('draft-results-tbody');
  
  if (!tbody) return;
  
  if (draftResults.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">No Draft Results</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  tbody.innerHTML = draftResults.map(result => `
    <tr>
      <td><strong>${result.studentName}</strong></td>
      <td>${result.className}</td>
      <td>${result.term}</td>
      <td><span class="badge badge-draft">${result.status}</span></td>
      <td>${new Date(result.updatedAt).toLocaleDateString()}</td>
      <td>
        <button class="btn secondary" onclick="editResult('${result._id}')">
          <i class="fa fa-edit"></i> Edit
        </button>
      </td>
    </tr>
  `).join('');
}

async function renderCBTResultsSection() {
  const classSelect = document.getElementById('gradebook-class');
  const container = document.getElementById('cbtResultsContainer');
  
  if (!classSelect || !container) return;
  
  const classId = classSelect.value;
  if (!classId) {
    container.innerHTML = '<p style="color: var(--muted);">Select a class first.</p>';
    return;
  }
  
  const results = await fetchCBTResultsForClass(classId);
  
  if (results.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No CBT Results</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = results.map(result => `
    <div class="list-item" onclick="viewCBTResult('${result._id}')">
      <div style="flex: 1;">
        <strong>${result.studentName}</strong><br>
        <small style="color: var(--muted);">${result.examTitle} | Score: ${result.score}/${result.totalScore}</small>
      </div>
      <div style="text-align: right;">
        <strong style="color: var(--accent-2);">${Math.round((result.score / result.totalScore) * 100)}%</strong>
      </div>
    </div>
  `).join('');
}

function renderCBTQuestionSection() {
  const classSelect = document.getElementById('cbt-class-select');
  const subjectSelect = document.getElementById('cbt-subject-select');
  
  if (!classSelect || !subjectSelect) return;
  
  // Populate classes
  classSelect.innerHTML = teacherClasses.map(cls => `<option value="${cls._id}">${cls.name}</option>`).join('');
  
  // Update subjects when class changes
  classSelect.onchange = async function() {
    const subjects = await fetchSubjectsByClass(this.value);
    subjectSelect.innerHTML = subjects.map(subj => `<option value="${subj._id}">${subj.name}</option>`).join('');
  };
  
  // Trigger initial subject load
  if (classSelect.value) {
    classSelect.dispatchEvent(new Event('change'));
  }
  
  renderCBTQuestions();
  loadCBTDraftFromLocalStorage();
}

function renderCBTQuestions() {
  const container = document.getElementById('cbt-questions-list');
  if (!container) return;
  
  if (cbtQuestions.length === 0) {
    container.innerHTML = '<p style="color: var(--muted);">No questions added yet.</p>';
    return;
  }
  
  container.innerHTML = cbtQuestions.map((q, idx) => `
    <div style="padding: 16px; background: #f8faff; border: 1px solid #eef3ff; border-radius: 8px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <strong>Q${idx + 1}: ${q.text}</strong>
        <button type="button" class="btn secondary" style="padding: 6px 12px;" onclick="window.removeCBTQuestion(${idx})">
          <i class="fa fa-trash"></i>
        </button>
      </div>
      
      <div style="margin: 10px 0;">
        <label style="font-weight: 600; font-size: 0.9rem; color: var(--accent); display: block; margin-bottom: 6px;">Score/Points</label>
        <input type="number" value="${q.score || 1}" min="1" class="cbt-qscore" style="padding: 8px; border: 1px solid #eef3ff; border-radius: 6px; width: 80px;" data-idx="${idx}">
      </div>
      
      <div style="margin: 10px 0;">
        <strong style="font-size: 0.95rem;">Options:</strong>
        ${(q.options || []).map((opt, oidx) => `
          <div style="display: flex; align-items: center; gap: 8px; padding: 8px; background: #fff; border-radius: 6px; margin-bottom: 6px;">
            <input type="radio" name="answer_${idx}" ${q.answer === oidx ? 'checked' : ''} onclick="window.setCBTCorrect(${idx}, ${oidx})" style="cursor: pointer;">
            <input type="text" value="${opt.value}" style="flex: 1; padding: 6px; border: 1px solid #eef3ff; border-radius: 4px;" readonly>
            <button type="button" class="btn secondary" style="padding: 4px 8px; font-size: 0.85rem;" onclick="window.removeCBTOption(${idx}, ${oidx})">
              <i class="fa fa-times"></i>
            </button>
          </div>
        `).join('')}
      </div>
      
      <button type="button" class="btn secondary" style="margin-top: 8px; font-size: 0.9rem;" onclick="window.addCBTOption(${idx})">
        <i class="fa fa-plus"></i> Add Option
      </button>
    </div>
  `).join('');
  
  // Attach change listeners
  document.querySelectorAll('.cbt-qscore').forEach(input => {
    input.onchange = (e) => {
      const idx = parseInt(e.target.dataset.idx);
      cbtQuestions[idx].score = Number(e.target.value) || 1;
      saveCBTDraftToLocalStorage();
    };
  });
}

async function renderMyCBTQuestions() {
  const cbtsList = await fetchTeacherCBTs();
  const container = document.getElementById('myCBTQuestionsList');
  
  if (!container) return;
  
  if (cbtsList.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-title">No CBTs Uploaded</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = cbtsList.map((cbt, idx) => `
    <div class="list-item">
      <div style="flex: 1;">
        <input type="checkbox" class="cbt-select" value="${cbt._id}" style="margin-right: 12px; cursor: pointer;">
        <strong>${cbt.title}</strong><br>
        <small style="color: var(--muted);">${cbt.class?.name} | ${cbt.questions?.length || 0} Questions | ${cbt.duration} mins</small>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn secondary" style="font-size: 0.85rem;" onclick="editCBT('${cbt._id}')">
          <i class="fa fa-edit"></i>
        </button>
        <button class="btn secondary" style="font-size: 0.85rem;" onclick="deleteCBT('${cbt._id}')">
          <i class="fa fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
  
  // Setup push to universal button
  const pushBtn = document.getElementById('pushToUniversalBtn');
  if (pushBtn) {
    pushBtn.disabled = true;
    document.querySelectorAll('.cbt-select').forEach(cb => {
      cb.onchange = function() {
        const anyChecked = Array.from(document.querySelectorAll('.cbt-select')).some(c => c.checked);
        pushBtn.disabled = !anyChecked;
      };
    });
    
    pushBtn.onclick = async function() {
      const selected = Array.from(document.querySelectorAll('.cbt-select:checked')).map(c => c.value);
      if (selected.length === 0) return alert('Select at least one CBT');
      
      try {
        const res = await fetch(`${API_BASE_URL}/teacher/cbts/push-universal`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ cbtIds: selected })
        });
        
        if (res.ok) {
          alert('CBTs pushed to question bank successfully!');
          await renderMyCBTQuestions();
        } else {
          alert('Failed to push CBTs');
        }
      } catch (err) {
        console.error('Error pushing CBTs:', err);
        alert('Error pushing CBTs');
      }
    };
  }
}

async function renderNotifications() {
  const notifications = await fetchTeacherNotifications();
  const container = document.getElementById('notification-list');
  
  if (!container) return;
  
  if (notifications.length === 0) {
    container.innerHTML += `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">🔔</div>
        <div class="empty-state-title">No Notifications</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML += notifications.map(notif => `
    <div class="list-item">
      <div>
        <strong>${notif.title}</strong><br>
        <small style="color: var(--muted);">${notif.message}</small><br>
        <small style="color: #999; margin-top: 4px; display: block;">${new Date(notif.createdAt).toLocaleString()}</small>
      </div>
    </div>
  `).join('');
}

// ===== WINDOW FUNCTIONS (for HTML event handlers) =====
window.removeCBTQuestion = function(idx) {
  cbtQuestions.splice(idx, 1);
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
};

window.addCBTOption = function(qidx) {
  if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
  cbtQuestions[qidx].options.push({ value: '' });
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
};

window.removeCBTOption = function(qidx, oidx) {
  cbtQuestions[qidx].options.splice(oidx, 1);
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
};

window.setCBTCorrect = function(qidx, oidx) {
  cbtQuestions[qidx].answer = oidx;
  saveCBTDraftToLocalStorage();
};

window.navigateToClass = function(classId) {
  // Will be implemented based on app structure
  console.log('Navigate to class:', classId);
};

window.viewCBTResult = async function(resultId) {
  alert('View CBT Result: ' + resultId);
};

window.editAssignment = function(assignId) {
  openAssignmentModal();
};

window.deleteAssignment = async function(assignId) {
  if (!confirm('Delete this assignment?')) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/assignments/${assignId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    
    if (res.ok) {
      await renderAssignments();
    }
  } catch (err) {
    console.error('Error deleting assignment:', err);
  }
};

window.editCBT = function(cbtId) {
  alert('Edit CBT: ' + cbtId);
};

window.deleteCBT = async function(cbtId) {
  if (!confirm('Delete this CBT?')) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/cbts/${cbtId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    
    if (res.ok) {
      await renderMyCBTQuestions();
    }
  } catch (err) {
    console.error('Error deleting CBT:', err);
  }
};

window.editResult = function(resultId) {
  alert('Edit Result: ' + resultId);
};

function openAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.add('active');
  populateAssignmentSubjects();
}

function closeAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.remove('active');
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', async () => {
  hideDashboardSpinner();
  
  // Fetch and render initial data
  await fetchTeacherProfile();
  await fetchTeacherClasses();
  
  // Setup event listeners
  const assignmentForm = document.getElementById('assignmentForm');
  if (assignmentForm) {
    assignmentForm.onsubmit = async function(e) {
      e.preventDefault();
      
      const formData = {
        class: document.getElementById('assignment-class').value,
        subject: document.getElementById('assignment-subject').value,
        title: document.getElementById('assignment-title').value,
        desc: document.getElementById('assignment-desc').value,
        due: document.getElementById('assignment-due').value,
        cbt: document.getElementById('assignment-cbt').value || null
      };
      
      try {
        const res = await fetch(`${API_BASE_URL}/assignments`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(formData)
        });
        
        if (res.ok) {
          closeAssignmentModal();
          await renderAssignments();
          alert('Assignment created successfully!');
        }
      } catch (err) {
        console.error('Error creating assignment:', err);
        alert('Failed to create assignment');
      }
    };
  }
  
  const attendanceForm = document.getElementById('attendance-form');
  if (attendanceForm) {
    attendanceForm.onsubmit = async function(e) {
      e.preventDefault();
      
      const classId = document.getElementById('attendance-class').value;
      const attendance = [];
      
      document.querySelectorAll('[name^="attendance_"]').forEach((select, idx) => {
        attendance.push({
          studentIndex: idx,
          status: select.value
        });
      });
      
      try {
        const res = await fetch(`${API_BASE_URL}/teacher/attendance`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ classId, attendance })
        });
        
        if (res.ok) {
          alert('Attendance saved successfully!');
        }
      } catch (err) {
        console.error('Error saving attendance:', err);
        alert('Failed to save attendance');
      }
    };
  }
  
  const cbtForm = document.getElementById('cbt-question-form');
  if (cbtForm) {
    renderCBTQuestionSection();
    
    const addQBtn = document.getElementById('cbt-add-question-btn');
    if (addQBtn) {
      addQBtn.onclick = function() {
        cbtQuestions.push({
          text: '',
          options: [{ value: '' }, { value: '' }],
          answer: 0,
          score: 1
        });
        saveCBTDraftToLocalStorage();
        renderCBTQuestions();
      };
    }
    
    cbtForm.onsubmit = async function(e) {
      e.preventDefault();
      
      if (cbtQuestions.length === 0) {
        alert('Add at least one question');
        return;
      }
      
      const payload = {
        class: document.getElementById('cbt-class-select').value,
        subject: document.getElementById('cbt-subject-select').value,
        title: document.getElementById('cbt-title').value,
        duration: document.getElementById('cbt-duration').value,
        questions: cbtQuestions
      };
      
      try {
        const res = await fetch(`${API_BASE_URL}/teacher/cbts`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          clearCBTDraftFromLocalStorage();
          cbtQuestions = [];
          cbtForm.reset();
          renderCBTQuestions();
          alert('CBT uploaded successfully!');
          await renderMyCBTQuestions();
        }
      } catch (err) {
        console.error('Error uploading CBT:', err);
        alert('Failed to upload CBT');
      }
    };
  }
  
  const profileForm = document.getElementById('profile-form');
  if (profileForm) {
    if (currentTeacher) {
      document.getElementById('profile-name').value = currentTeacher.name || '';
      document.getElementById('profile-email').value = currentTeacher.email || '';
      document.getElementById('profile-subject').value = currentTeacher.subject || '';
    }
    
    profileForm.onsubmit = async function(e) {
      e.preventDefault();
      
      const updateData = {
        name: document.getElementById('profile-name').value,
        email: document.getElementById('profile-email').value,
        subject: document.getElementById('profile-subject').value
      };
      
      const password = document.getElementById('profile-password').value;
      if (password) updateData.password = password;
      
      try {
        const res = await fetch(`${API_BASE_URL}/teacher/me`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(updateData)
        });
        
        if (res.ok) {
          alert('Profile updated successfully!');
        }
      } catch (err) {
        console.error('Error updating profile:', err);
        alert('Failed to update profile');
      }
    };
  }
  
  // Render initial sections
  await renderDashboard();
  await renderAssignments();
  await renderDraftResults();
});

// ===== AUTO-RENDER WHEN SECTIONS CHANGE =====
document.querySelectorAll('.nav button').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    const section = btn.dataset.section;
    
    switch(section) {
      case 'dashboard':
        await renderDashboard();
        break;
      case 'classes':
        renderClassesList();
        break;
      case 'attendance':
        await renderAttendance();
        break;
      case 'gradebook':
        await renderGradebook();
        break;
      case 'assignments':
        await renderAssignments();
        break;
      case 'draftResults':
        await renderDraftResults();
        break;
      case 'cbtResults':
        await renderCBTResultsSection();
        break;
      case 'cbtQuestions':
        renderCBTQuestionSection();
        break;
      case 'myCBTQuestions':
        await renderMyCBTQuestions();
        break;
      case 'notifications':
        await renderNotifications();
        break;
      case 'profile':
        // Profile form already handled
        break;
    }
  });
});

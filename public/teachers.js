// ===== GLOBAL VARIABLES =====
const API_BASE_URL = "https://goldlincschools.onrender.com/api";
const token = localStorage.getItem('token') || localStorage.getItem('teacherToken') || localStorage.getItem('teacher_token') || '';

let teacherData = null;
let teacherClasses = [];
let currentClassId = null;
let allAssignments = [];
let allStudents = [];
let cbtQuestions = [];
let cbtDraftKey = 'cbt_draft_' + (teacherData?.id || 'teacher');
let currentResultStudentId = null;
let currentResultClassId = null;

// ===== SPINNER CONTROL =====
function showDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) spinner.style.display = 'flex';
}

function hideDashboardSpinner() {
  const spinner = document.getElementById('dashboardSpinnerOverlay');
  if (spinner) {
    spinner.classList.add('hidden');
    setTimeout(() => { spinner.style.display = 'none'; }, 400);
  }
}

// ===== AUTHENTICATION & HEADERS =====
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
}

function authHeadersFormData() {
  return {
    'Authorization': 'Bearer ' + token
  };
}

// ===== FETCH TEACHER PROFILE =====
async function fetchTeacherProfile() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/me`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    
    teacherData = await res.json();
    cbtDraftKey = 'cbt_draft_' + teacherData._id;
    
    document.getElementById('teacherName').textContent = teacherData.name || 'Teacher';
    document.getElementById('teacherSubject').textContent = (teacherData.subject || 'Subject') + ' Teacher';
    
    loadCBTDraftFromLocalStorage();
    return teacherData;
  } catch (err) {
    console.error('Error fetching teacher profile:', err);
    alert('Failed to load teacher profile. Please log in again.');
    window.location.href = 'login.html';
  }
}

// ===== FETCH TEACHER CLASSES =====
async function fetchTeacherClasses() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/classes`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch classes');
    
    teacherClasses = await res.json();
    renderClassesList();
    renderDashboardStats();
    
    // Populate class selects
    populateClassSelects();
    return teacherClasses;
  } catch (err) {
    console.error('Error fetching teacher classes:', err);
  }
}

// ===== POPULATE CLASS SELECTS =====
function populateClassSelects() {
  const selects = [
    'attendance-class',
    'gradebook-class',
    'assignment-class',
    'cbt-class-select'
  ];
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '<option value="">Select a class...</option>';
      teacherClasses.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls._id;
        opt.textContent = cls.name;
        select.appendChild(opt);
      });
    }
  });
}

// ===== RENDER DASHBOARD STATS =====
function renderDashboardStats() {
  const statsContainer = document.getElementById('classesStats');
  if (!statsContainer) return;
  
  let html = '';
  teacherClasses.forEach(cls => {
    html += `
      <div class="stat-card" onclick="currentClassId='${cls._id}'; fetchStudentsByClass('${cls._id}'); fetchSubjectsByClass('${cls._id}');">
        <div class="stat-icon" style="background: linear-gradient(90deg, #3b82f6, #60a5fa);">
          <i class="fa fa-book"></i>
        </div>
        <div class="stat-value">${cls.name}</div>
        <div class="stat-label">${cls.students?.length || 0} Students</div>
      </div>
    `;
  });
  
  statsContainer.innerHTML = html;
}

// ===== RENDER CLASSES LIST =====
function renderClassesList() {
  const classList = document.getElementById('class-list');
  if (!classList) return;
  
  if (!teacherClasses.length) {
    classList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No classes assigned</div>
        <p style="color: var(--muted);">Contact your administrator to assign classes</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  teacherClasses.forEach(cls => {
    html += `
      <div class="list-item">
        <div>
          <div style="font-weight: 700; color: var(--accent);">${cls.name}</div>
          <div style="font-size: 0.85rem; color: var(--muted);">${cls.students?.length || 0} students</div>
        </div>
        <button class="btn secondary" onclick="currentClassId='${cls._id}'; document.querySelector('.nav button[data-section=attendance]').click();">
          <i class="fa fa-check"></i> Mark Attendance
        </button>
      </div>
    `;
  });
  
  classList.innerHTML = html;
}

// ===== FETCH STUDENTS BY CLASS =====
async function fetchStudentsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/classes/${classId}/students`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch students');
    
    allStudents = await res.json();
    renderStudentsBlock();
    renderAttendanceStudents();
    renderGradebookTable();
    return allStudents;
  } catch (err) {
    console.error('Error fetching students:', err);
  }
}

// ===== RENDER STUDENTS BLOCK =====
function renderStudentsBlock() {
  const block = document.getElementById('students-block');
  if (!block) return;
  
  if (!allStudents.length) {
    block.innerHTML = '';
    return;
  }
  
  let html = `
    <div class="section" style="margin-top: 24px;">
      <h2 class="section-title">
        <i class="fa fa-users"></i>
        Students in Selected Class
      </h2>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Registration No.</th>
              <th>Email</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  allStudents.forEach(student => {
    html += `
      <tr>
        <td><strong>${student.firstname} ${student.surname}</strong></td>
        <td>${student.student_id || 'N/A'}</td>
        <td>${student.email || 'N/A'}</td>
        <td><span class="badge badge-present">Active</span></td>
      </tr>
    `;
  });
  
  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;
  
  block.innerHTML = html;
}

// ===== FETCH SUBJECTS BY CLASS =====
async function fetchSubjectsByClass(classId) {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/classes/${classId}/subjects`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch subjects');
    
    const subjects = await res.json();
    renderSubjectsBlock(subjects);
    populateAssignmentSubjects(subjects);
    return subjects;
  } catch (err) {
    console.error('Error fetching subjects:', err);
  }
}

// ===== RENDER SUBJECTS BLOCK =====
function renderSubjectsBlock(subjects = []) {
  const block = document.getElementById('subjects-block');
  if (!block) return;
  
  if (!subjects.length) {
    block.innerHTML = '';
    return;
  }
  
  let html = `
    <div class="section" style="margin-top: 24px;">
      <h2 class="section-title">
        <i class="fa fa-chalkboard"></i>
        Subjects Taught
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
  `;
  
  subjects.forEach(subject => {
    html += `
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(90deg, #10b981, #059669);">
          <i class="fa fa-book-open"></i>
        </div>
        <div class="stat-value" style="font-size: 1.1rem;">${subject.name || subject}</div>
        <div class="stat-label">Subject</div>
      </div>
    `;
  });
  
  html += `
      </div>
    </div>
  `;
  
  block.innerHTML = html;
}

// ===== POPULATE ASSIGNMENT SUBJECTS =====
function populateAssignmentSubjects(subjects = []) {
  const select = document.getElementById('assignment-subject');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select a subject...</option>';
  subjects.forEach(subject => {
    const opt = document.createElement('option');
    opt.value = typeof subject === 'string' ? subject : subject._id;
    opt.textContent = typeof subject === 'string' ? subject : subject.name;
    select.appendChild(opt);
  });
}

// ===== FETCH ASSIGNMENTS =====
async function fetchAssignments() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/assignments`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch assignments');
    
    allAssignments = await res.json();
    renderAssignmentList();
    populateAssignmentCBTs();
    return allAssignments;
  } catch (err) {
    console.error('Error fetching assignments:', err);
  }
}

// ===== RENDER ASSIGNMENT LIST =====
function renderAssignmentList() {
  const container = document.getElementById('assignment-list');
  if (!container) return;
  
  if (!allAssignments.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📝</div>
        <div class="empty-state-title">No assignments created</div>
        <p style="color: var(--muted);">Create your first assignment to get started</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  allAssignments.forEach((assignment, idx) => {
    const dueDate = new Date(assignment.dueDate);
    const isOverdue = dueDate < new Date();
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${assignment.title}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${assignment.class?.name || 'Unknown Class'} | ${assignment.subject}
          </div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            Due: ${dueDate.toLocaleDateString()}
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn secondary" onclick="editAssignment(${idx})">
            <i class="fa fa-edit"></i> Edit
          </button>
          <button class="btn secondary" style="border-color: #f8d7da; color: #721c24;" onclick="deleteAssignment(${idx})">
            <i class="fa fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;
  });
  
  document.getElementById('assignment-list').innerHTML = html;
}

// ===== OPEN ASSIGNMENT MODAL =====
function openAssignmentModal(assignmentIdx = null) {
  const modal = document.getElementById('assignmentModalBg');
  const form = document.getElementById('assignmentForm');
  
  if (assignmentIdx !== null && allAssignments[assignmentIdx]) {
    const assignment = allAssignments[assignmentIdx];
    document.getElementById('assignment-class').value = assignment.class?._id || '';
    document.getElementById('assignment-subject').value = assignment.subject;
    document.getElementById('assignment-title').value = assignment.title;
    document.getElementById('assignment-desc').value = assignment.description;
    document.getElementById('assignment-due').value = assignment.dueDate?.split('T')[0];
    document.getElementById('assignment-cbt').value = assignment.cbt?._id || '';
    form.dataset.assignmentId = assignment._id;
    document.querySelector('.modal-title').textContent = 'Edit Assignment';
  } else {
    form.reset();
    delete form.dataset.assignmentId;
    document.querySelector('.modal-title').textContent = 'Create Assignment';
  }
  
  modal.classList.add('active');
}

function closeAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.remove('active');
}

// ===== SUBMIT ASSIGNMENT =====
document.getElementById('assignmentForm').onsubmit = async function(e) {
  e.preventDefault();
  
  const assignmentId = this.dataset.assignmentId;
  const data = {
    class: document.getElementById('assignment-class').value,
    subject: document.getElementById('assignment-subject').value,
    title: document.getElementById('assignment-title').value,
    description: document.getElementById('assignment-desc').value,
    dueDate: document.getElementById('assignment-due').value,
    cbt: document.getElementById('assignment-cbt').value || null
  };
  
  try {
    const url = assignmentId ? 
      `${API_BASE_URL}/assignments/${assignmentId}` : 
      `${API_BASE_URL}/assignments`;
    
    const res = await fetch(url, {
      method: assignmentId ? 'PUT' : 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Failed to save assignment');
    
    alert('Assignment saved successfully!');
    closeAssignmentModal();
    fetchAssignments();
  } catch (err) {
    console.error('Error saving assignment:', err);
    alert('Failed to save assignment: ' + err.message);
  }
};

async function editAssignment(idx) {
  openAssignmentModal(idx);
}

async function deleteAssignment(idx) {
  if (!confirm('Are you sure you want to delete this assignment?')) return;
  
  const assignment = allAssignments[idx];
  try {
    const res = await fetch(`${API_BASE_URL}/assignments/${assignment._id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to delete assignment');
    
    alert('Assignment deleted successfully!');
    fetchAssignments();
  } catch (err) {
    console.error('Error deleting assignment:', err);
    alert('Failed to delete assignment: ' + err.message);
  }
}

// ===== ATTENDANCE FUNCTIONS =====
function renderAttendanceStudents() {
  const container = document.getElementById('attendance-students');
  if (!container) return;
  
  if (!allStudents.length) {
    container.innerHTML = '<p style="color: var(--muted);">Select a class first</p>';
    return;
  }
  
  let html = '<div style="margin-top: 16px;">';
  allStudents.forEach((student, idx) => {
    html += `
      <div style="padding: 12px; background: #f8faff; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--accent);">${student.firstname} ${student.surname}</div>
          <div style="font-size: 0.85rem; color: var(--muted);">${student.student_id}</div>
        </div>
        <select name="attendance-${idx}" class="attendance-status" style="padding: 8px; border: 1.5px solid #eef3ff; border-radius: 6px;">
          <option value="Present">Present</option>
          <option value="Absent">Absent</option>
          <option value="Late">Late</option>
          <option value="Leave">Leave</option>
        </select>
      </div>
    `;
  });
  html += '</div>';
  
  container.innerHTML = html;
}

document.getElementById('attendance-form').onsubmit = async function(e) {
  e.preventDefault();
  
  const classId = document.getElementById('attendance-class').value;
  if (!classId) {
    alert('Please select a class');
    return;
  }
  
  const attendance = [];
  allStudents.forEach((student, idx) => {
    const status = document.querySelector(`select[name="attendance-${idx}"]`).value;
    attendance.push({
      student: student._id,
      status: status
    });
  });
  
  try {
    const res = await fetch(`${API_BASE_URL}/attendance/mark`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        class: classId,
        date: new Date().toISOString().split('T')[0],
        attendance: attendance
      })
    });
    
    if (!res.ok) throw new Error('Failed to save attendance');
    
    alert('Attendance saved successfully!');
  } catch (err) {
    console.error('Error saving attendance:', err);
    alert('Failed to save attendance: ' + err.message);
  }
};

// ===== GRADEBOOK FUNCTIONS =====
function renderGradebookTable() {
  const container = document.getElementById('gradebook-table');
  if (!container) return;
  
  if (!allStudents.length) {
    container.innerHTML = '<p style="color: var(--muted);">Select a class first</p>';
    return;
  }
  
  let html = `
    <table>
      <thead>
        <tr>
          <th>Student Name</th>
          <th>Reg. No.</th>
          <th>Term 1</th>
          <th>Term 2</th>
          <th>Term 3</th>
          <th>Average</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  allStudents.forEach(student => {
    html += `
      <tr>
        <td>${student.firstname} ${student.surname}</td>
        <td>${student.student_id}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  document.getElementById('gradebook-table').innerHTML = html;
}

// ===== CBT QUESTIONS FUNCTIONS =====
function saveCBTDraftToLocalStorage() {
  localStorage.setItem(cbtDraftKey, JSON.stringify({
    classId: document.getElementById('cbt-class-select')?.value || '',
    subjectId: document.getElementById('cbt-subject-select')?.value || '',
    title: document.getElementById('cbt-title')?.value || '',
    duration: document.getElementById('cbt-duration')?.value || '',
    questions: cbtQuestions
  }));
}

function loadCBTDraftFromLocalStorage() {
  const draft = localStorage.getItem(cbtDraftKey);
  if (draft) {
    const data = JSON.parse(draft);
    cbtQuestions = data.questions || [];
  }
}

function clearCBTDraftFromLocalStorage() {
  localStorage.removeItem(cbtDraftKey);
  cbtQuestions = [];
}

function renderCBTQuestions() {
  const container = document.getElementById('cbt-questions-list');
  if (!container) return;
  
  let html = '';
  cbtQuestions.forEach((q, idx) => {
    html += `
      <div style="background: #f8faff; border: 1.5px solid #eef3ff; border-radius: 12px; padding: 16px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div style="font-weight: 700; color: var(--accent);">Question ${idx + 1}</div>
          <button type="button" class="btn secondary" onclick="window.removeCBTQuestion(${idx})">
            <i class="fa fa-trash"></i> Remove
          </button>
        </div>
        
        <div class="form-group">
          <label>Question Text</label>
          <textarea class="cbt-question-text" style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; width: 100%; min-height: 80px; font-family: inherit;">${q.text || ''}</textarea>
        </div>
        
        <div class="form-group">
          <label>Points</label>
          <input type="number" class="cbt-qscore" value="${q.score || 1}" min="1" style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; max-width: 100px;">
        </div>
        
        <div style="margin-top: 12px; margin-bottom: 12px;">
          <label style="font-weight: 600; font-size: 0.9rem; color: var(--accent); display: block; margin-bottom: 8px;">Options</label>
          <div id="options-${idx}"></div>
          <button type="button" class="btn secondary" onclick="window.addCBTOption(${idx})" style="margin-top: 8px;">
            <i class="fa fa-plus"></i> Add Option
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Attach event listeners after rendering
  document.querySelectorAll('.cbt-question-text').forEach((el, idx) => {
    el.oninput = (e) => {
      cbtQuestions[idx].text = e.target.value;
      saveCBTDraftToLocalStorage();
    };
  });
  
  document.querySelectorAll('.cbt-qscore').forEach((el, idx) => {
    el.oninput = (e) => {
      cbtQuestions[idx].score = Number(e.target.value) || 1;
      saveCBTDraftToLocalStorage();
    };
  });
  
  renderCBTOptions();
}

function renderCBTOptions() {
  cbtQuestions.forEach((q, qidx) => {
    const optionsDiv = document.getElementById(`options-${qidx}`);
    if (!optionsDiv) return;
    
    let html = '';
    (q.options || []).forEach((opt, oidx) => {
      const isCorrect = q.answer === oidx;
      html += `
        <div style="padding: 10px; background: #fff; border: 1px solid #eef3ff; border-radius: 8px; margin-bottom: 8px; display: flex; gap: 8px; align-items: center;">
          <input type="text" value="${opt.value || ''}" class="cbt-option-text" style="flex: 1; padding: 8px; border: 1px solid #eef3ff; border-radius: 6px;" placeholder="Option text">
          <button type="button" class="btn secondary" onclick="window.setCBTCorrect(${qidx}, ${oidx})" style="padding: 8px 12px; background: ${isCorrect ? 'var(--accent-2)' : 'transparent'}; color: ${isCorrect ? '#fff' : 'var(--accent-2)'};">
            <i class="fa fa-check"></i>
          </button>
          <button type="button" class="btn secondary" onclick="window.removeCBTOption(${qidx}, ${oidx})">
            <i class="fa fa-trash"></i>
          </button>
        </div>
      `;
    });
    
    optionsDiv.innerHTML = html;
    
    // Attach event listeners
    optionsDiv.querySelectorAll('.cbt-option-text').forEach((el, oidx) => {
      el.oninput = (e) => {
        if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
        if (!cbtQuestions[qidx].options[oidx]) cbtQuestions[qidx].options[oidx] = {};
        cbtQuestions[qidx].options[oidx].value = e.target.value;
        saveCBTDraftToLocalStorage();
      };
    });
  });
}

window.removeCBTQuestion = function(idx) {
  cbtQuestions.splice(idx, 1);
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
};

window.addCBTOption = function(qidx) {
  if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
  cbtQuestions[qidx].options.push({ value: '' });
  saveCBTDraftToLocalStorage();
  renderCBTOptions();
};

window.removeCBTOption = function(qidx, oidx) {
  cbtQuestions[qidx].options.splice(oidx, 1);
  if (cbtQuestions[qidx].answer === oidx) cbtQuestions[qidx].answer = 0;
  saveCBTDraftToLocalStorage();
  renderCBTOptions();
};

window.setCBTCorrect = function(qidx, oidx) {
  cbtQuestions[qidx].answer = oidx;
  saveCBTDraftToLocalStorage();
  renderCBTOptions();
};

document.getElementById('cbt-add-question-btn')?.addEventListener('click', function() {
  cbtQuestions.push({
    text: '',
    score: 1,
    options: [{ value: '' }],
    answer: 0
  });
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
});

document.getElementById('cbt-question-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  if (!cbtQuestions.length) {
    alert('Please add at least one question');
    return;
  }
  
  const data = {
    class: document.getElementById('cbt-class-select').value,
    subject: document.getElementById('cbt-subject-select').value,
    title: document.getElementById('cbt-title').value,
    duration: parseInt(document.getElementById('cbt-duration').value),
    questions: cbtQuestions
  };
  
  try {
    const res = await fetch(`${API_BASE_URL}/exam/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Failed to upload CBT');
    
    const msgDiv = document.getElementById('cbt-upload-msg');
    msgDiv.textContent = '✓ CBT uploaded successfully!';
    msgDiv.style.display = 'block';
    msgDiv.style.background = '#d4edda';
    msgDiv.style.color = '#155724';
    
    setTimeout(() => {
      clearCBTDraftFromLocalStorage();
      this.reset();
      renderCBTQuestions();
      fetchTeacherCBTs();
      msgDiv.style.display = 'none';
    }, 2000);
  } catch (err) {
    console.error('Error uploading CBT:', err);
    const msgDiv = document.getElementById('cbt-upload-msg');
    msgDiv.textContent = '✗ Failed to upload: ' + err.message;
    msgDiv.style.display = 'block';
    msgDiv.style.background = '#f8d7da';
    msgDiv.style.color = '#721c24';
  }
});

// ===== FETCH TEACHER CBTs =====
async function fetchTeacherCBTs() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/cbts`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch CBTs');
    
    const cbts = await res.json();
    renderMyCBTQuestions(cbts);
    populateAssignmentCBTs(cbts);
    return cbts;
  } catch (err) {
    console.error('Error fetching CBTs:', err);
  }
}

// ===== RENDER MY CBT QUESTIONS =====
function renderMyCBTQuestions(cbts = []) {
  const container = document.getElementById('myCBTQuestionsList');
  if (!container) return;
  
  if (!cbts.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❓</div>
        <div class="empty-state-title">No CBTs uploaded yet</div>
        <p style="color: var(--muted);">Upload your first CBT from the "Upload CBT" section</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  cbts.forEach((cbt, idx) => {
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${cbt.title}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${cbt.subject} | ${cbt.questions?.length || 0} questions | ${cbt.duration} mins
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <label>
            <input type="checkbox" class="cbt-select-checkbox" data-cbt-id="${cbt._id}" style="cursor: pointer; width: 18px; height: 18px;">
          </label>
          <button class="btn secondary" onclick="window.viewCBT('${cbt._id}')">
            <i class="fa fa-eye"></i> View
          </button>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ===== POPULATE ASSIGNMENT CBTs =====
function populateAssignmentCBTs(cbts = []) {
  const select = document.getElementById('assignment-cbt');
  if (!select) return;
  
  const selected = select.value;
  select.innerHTML = '<option value="">None - Regular Assignment</option>';
  
  cbts.forEach(cbt => {
    const opt = document.createElement('option');
    opt.value = cbt._id;
    opt.textContent = `${cbt.title} (${cbt.questions?.length || 0} questions)`;
    select.appendChild(opt);
  });
  
  select.value = selected;
}

window.viewCBT = async function(cbtId) {
  try {
    const res = await fetch(`${API_BASE_URL}/exam/${cbtId}`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch CBT');
    
    const cbt = await res.json();
    alert(`CBT: ${cbt.title}\n\nQuestions: ${cbt.questions?.length || 0}\nDuration: ${cbt.duration} minutes`);
  } catch (err) {
    console.error('Error viewing CBT:', err);
    alert('Failed to load CBT');
  }
};

// ===== FETCH CBT RESULTS =====
async function fetchCBTResults() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/cbt-results`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch CBT results');
    
    const results = await res.json();
    renderCBTResults(results);
    return results;
  } catch (err) {
    console.error('Error fetching CBT results:', err);
  }
}

function renderCBTResults(results = []) {
  const container = document.getElementById('cbtResultsContainer');
  if (!container) return;
  
  if (!results.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💻</div>
        <div class="empty-state-title">No CBT results yet</div>
        <p style="color: var(--muted);">Students will see their results here after completing a CBT</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  results.forEach(result => {
    const percentage = result.score && result.totalScore ? ((result.score / result.totalScore) * 100).toFixed(1) : 0;
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${result.student?.name || 'Unknown Student'}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${result.exam?.title || 'Unknown Exam'} | ${result.score}/${result.totalScore}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; color: var(--accent-2);">${percentage}%</div>
          <div style="font-size: 0.85rem; color: var(--muted);">Submitted ${new Date(result.submittedAt).toLocaleDateString()}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ===== FETCH NOTIFICATIONS =====
async function fetchTeacherNotifications() {
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/notifications`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch notifications');
    
    const notifications = await res.json();
    renderNotifications(notifications);
    return notifications;
  } catch (err) {
    console.error('Error fetching notifications:', err);
  }
}

function renderNotifications(notifications = []) {
  const container = document.getElementById('notification-list');
  if (!container) return;
  
  if (!notifications.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔔</div>
        <div class="empty-state-title">No notifications</div>
        <p style="color: var(--muted);">You're all caught up!</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  notifications.forEach(notif => {
    html += `
      <div class="list-item">
        <div>
          <div style="font-weight: 700; color: var(--accent);">${notif.title}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">${notif.message}</div>
          <div style="font-size: 0.8rem; color: var(--muted); margin-top: 6px;">${new Date(notif.createdAt).toLocaleString()}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ===== PROFILE UPDATE =====
document.getElementById('profile-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const data = {
    name: document.getElementById('profile-name').value,
    email: document.getElementById('profile-email').value,
    subject: document.getElementById('profile-subject').value
  };
  
  if (document.getElementById('profile-password').value) {
    data.password = document.getElementById('profile-password').value;
  }
  
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/profile`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Failed to update profile');
    
    alert('Profile updated successfully!');
    fetchTeacherProfile();
  } catch (err) {
    console.error('Error updating profile:', err);
    alert('Failed to update profile: ' + err.message);
  }
});

// ===== INITIALIZE DASHBOARD =====
async function initializeDashboard() {
  showDashboardSpinner();
  
  try {
    await fetchTeacherProfile();
    await fetchTeacherClasses();
    await fetchAssignments();
    await fetchTeacherCBTs();
    await fetchTeacherNotifications();
    await fetchCBTResults();
  } catch (err) {
    console.error('Error initializing dashboard:', err);
  } finally {
    hideDashboardSpinner();
  }
}

// ===== PAGE LOAD =====
document.addEventListener('DOMContentLoaded', () => {
  if (!token) {
    alert('Please log in first');
    window.location.href = 'login.html';
    return;
  }
  
  initializeDashboard();
  
  // Load CBT drafts on startup
  loadCBTDraftFromLocalStorage();
});

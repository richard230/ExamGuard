// ===== GLOBAL VARIABLES =====
const API_BASE_URL = "https://goldlincschools.onrender.com/api";
const token = localStorage.getItem('token') || localStorage.getItem('teacherToken') || localStorage.getItem('teacher_token') || '';

let teacherData = null;
let teacherClasses = [];
let currentClassId = null;
let allAssignments = [];
let allStudents = [];
let allNotifications = [];
let cbtQuestions = [];
let cbtDraftKey = 'cbt_draft_teacher';
let currentResultStudentId = null;
let currentResultClassId = null;

// ===== SPINNER CONTROL =====
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

// ===== AUTHENTICATION & HEADERS =====
function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token
  };
}

// ===== FETCH TEACHER PROFILE (WITH FALLBACK ENDPOINTS) =====
async function fetchTeacherProfile() {
  const endpoints = [
    `${API_BASE_URL}/teacher/me`,
    `${API_BASE_URL}/teacher/profile`,
    `${API_BASE_URL}/auth/me`,
    `${API_BASE_URL}/user/me`
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting to fetch from: ${endpoint}`);
      
      const res = await fetch(endpoint, {
        headers: authHeaders()
      });
      
      if (!res.ok) {
        console.warn(`Failed to fetch from ${endpoint}: ${res.status}`);
        continue;
      }
      
      teacherData = await res.json();
      cbtDraftKey = 'cbt_draft_' + (teacherData._id || teacherData.id || 'teacher');
      
      // Update profile display
      const teacherName = document.getElementById('teacherName');
      const teacherSubject = document.getElementById('teacherSubject');
      
      if (teacherName) {
        teacherName.textContent = teacherData.name || teacherData.firstName || teacherData.firstname || 'Teacher';
      }
      
      if (teacherSubject) {
        const subject = teacherData.subject || teacherData.Subject || 'Subject';
        teacherSubject.textContent = subject + ' Teacher';
      }
      
      // Fill profile form if it exists
      const profileForm = document.getElementById('profile-form');
      if (profileForm) {
        const profileNameInput = document.getElementById('profile-name');
        const profileEmailInput = document.getElementById('profile-email');
        const profileSubjectInput = document.getElementById('profile-subject');
        
        if (profileNameInput) {
          profileNameInput.value = teacherData.name || teacherData.firstName || teacherData.firstname || '';
        }
        if (profileEmailInput) {
          profileEmailInput.value = teacherData.email || '';
        }
        if (profileSubjectInput) {
          profileSubjectInput.value = teacherData.subject || teacherData.Subject || '';
        }
      }
      
      console.log('✓ Teacher profile loaded successfully from:', endpoint);
      return teacherData;
    } catch (err) {
      console.warn(`Error fetching from ${endpoint}:`, err.message);
      continue;
    }
  }
  
  // If all endpoints fail
  console.error('❌ Failed to fetch teacher profile from all endpoints');
  alert('Failed to load teacher profile. Please ensure you are logged in correctly.');
  
  // Create a mock teacher object to allow the dashboard to work
  teacherData = {
    name: 'Teacher',
    email: localStorage.getItem('userEmail') || 'teacher@school.com',
    subject: 'Subject',
    _id: 'temp_' + Date.now()
  };
  
  // Update UI with mock data
  const teacherName = document.getElementById('teacherName');
  const teacherSubject = document.getElementById('teacherSubject');
  
  if (teacherName) teacherName.textContent = teacherData.name;
  if (teacherSubject) teacherSubject.textContent = teacherData.subject + ' Teacher';
  
  return teacherData;
}

// ===== SIDEBAR & NAVIGATION =====
function initializeSidebarNavigation() {
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarOverlay = document.getElementById('sidebarOverlay');

  if (!sidebar || !sidebarToggle) {
    console.warn('Sidebar elements not found');
    return;
  }

  sidebarToggle.addEventListener('click', () => {
    sidebar.classList.add('open');
    if (sidebarOverlay) sidebarOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  });

  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = 'auto';
    });
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  });

  // Section navigation
  document.querySelectorAll('.nav button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const section = btn.dataset.section;
      
      // Hide all sections
      document.querySelectorAll('section[id^="section-"]').forEach(s => {
        s.style.display = 'none';
      });
      
      // Show selected section
      const targetSection = document.getElementById(`section-${section}`);
      if (targetSection) {
        targetSection.style.display = 'block';
      }

      // Update active button
      document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Close sidebar on mobile
      if (window.innerWidth < 768) {
        sidebar.classList.remove('open');
        if (sidebarOverlay) sidebarOverlay.classList.remove('active');
        document.body.style.overflow = 'auto';
      }

      // Load section-specific data
      switch(section) {
        case 'attendance':
          populateClassSelects();
          break;
        case 'gradebook':
          populateClassSelects();
          break;
        case 'draftResults':
          fetchDraftResults();
          break;
        case 'cbtResults':
          fetchCBTResults();
          break;
        case 'cbtQuestions':
          renderCBTQuestionSection();
          break;
        case 'myCBTQuestions':
          fetchTeacherCBTs();
          break;
      }
    });
  });
}

// ===== FETCH TEACHER CLASSES =====
async function fetchTeacherClasses() {
  const endpoints = [
    `${API_BASE_URL}/teacher/classes`,
    `${API_BASE_URL}/classes/my-classes`,
    `${API_BASE_URL}/teacher/my-classes`
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Attempting to fetch classes from: ${endpoint}`);
      
      const res = await fetch(endpoint, {
        headers: authHeaders()
      });
      
      if (!res.ok) {
        console.warn(`Failed to fetch classes from ${endpoint}: ${res.status}`);
        continue;
      }
      
      teacherClasses = await res.json();
      
      // Ensure it's an array
      if (!Array.isArray(teacherClasses)) {
        teacherClasses = teacherClasses.classes || teacherClasses.data || [];
      }
      
      console.log('✓ Classes loaded:', teacherClasses.length);
      
      // Set first class as default
      if (teacherClasses.length > 0) {
        currentClassId = teacherClasses[0]._id;
        await fetchStudentsByClass(currentClassId);
        await fetchSubjectsByClass(currentClassId);
      }
      
      renderDashboardStats();
      renderClassesList();
      populateClassSelects();
      
      return teacherClasses;
    } catch (err) {
      console.warn(`Error fetching classes from ${endpoint}:`, err.message);
      continue;
    }
  }
  
  console.warn('⚠️ Failed to load classes from all endpoints');
  teacherClasses = [];
  renderDashboardStats();
  renderClassesList();
  return [];
}

// ===== RENDER DASHBOARD STATS =====
function renderDashboardStats() {
  const statsContainer = document.getElementById('classesStats');
  if (!statsContainer) return;
  
  if (!teacherClasses || teacherClasses.length === 0) {
    statsContainer.innerHTML = `
      <div class="empty-state" style="padding: 40px 20px;">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No Classes Assigned</div>
        <p style="color: var(--muted);">Contact your administrator to assign classes</p>
      </div>
    `;
    return;
  }

  let html = '';
  teacherClasses.forEach(cls => {
    const classId = cls._id || cls.id;
    const className = cls.name || cls.className || 'Unknown';
    const studentCount = cls.students?.length || cls.studentCount || 0;
    
    html += `
      <div class="stat-card" style="cursor: pointer;" onclick="currentClassId='${classId}'; fetchStudentsByClass('${classId}'); fetchSubjectsByClass('${classId}');">
        <div class="stat-icon" style="background: linear-gradient(90deg, #3b82f6, #60a5fa);">
          <i class="fa fa-book"></i>
        </div>
        <div class="stat-value">${className}</div>
        <div class="stat-label">${studentCount} Students</div>
      </div>
    `;
  });
  
  statsContainer.innerHTML = html;
}

// ===== RENDER CLASSES LIST =====
function renderClassesList() {
  const classList = document.getElementById('class-list');
  if (!classList) return;
  
  if (!teacherClasses || teacherClasses.length === 0) {
    classList.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📚</div>
        <div class="empty-state-title">No classes assigned</div>
      </div>
    `;
    return;
  }
  
  let html = '';
  teacherClasses.forEach(cls => {
    const classId = cls._id || cls.id;
    const className = cls.name || cls.className || 'Unknown';
    const studentCount = cls.students?.length || cls.studentCount || 0;
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${className}</div>
          <div style="font-size: 0.85rem; color: var(--muted);">${studentCount} students</div>
        </div>
        <button class="btn secondary" onclick="currentClassId='${classId}'; fetchStudentsByClass('${classId}'); document.querySelector('.nav button[data-section=attendance]').click();">
          <i class="fa fa-check"></i> Attendance
        </button>
      </div>
    `;
  });
  
  classList.innerHTML = html;
}

// ===== POPULATE CLASS SELECTS =====
function populateClassSelects() {
  const selects = ['attendance-class', 'gradebook-class', 'assignment-class', 'cbt-class-select'];
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = '<option value="">Select a class...</option>';
      if (teacherClasses && teacherClasses.length > 0) {
        teacherClasses.forEach(cls => {
          const opt = document.createElement('option');
          opt.value = cls._id || cls.id;
          opt.textContent = cls.name || cls.className || 'Unknown';
          select.appendChild(opt);
        });
      }
      
      // Add change event listener
      select.addEventListener('change', async (e) => {
        if (e.target.value) {
          currentClassId = e.target.value;
          await fetchStudentsByClass(e.target.value);
          await fetchSubjectsByClass(e.target.value);
        }
      });
    }
  });
}

// ===== FETCH STUDENTS BY CLASS =====
async function fetchStudentsByClass(classId) {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/classes/${classId}/students`,
      `${API_BASE_URL}/classes/${classId}/students`,
      `${API_BASE_URL}/student?class=${classId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        allStudents = Array.isArray(data) ? data : (data.students || data.data || []);
        
        renderStudentsBlock();
        renderAttendanceStudents();
        renderGradebookTable();
        
        return allStudents;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch students from all endpoints');
    allStudents = [];
    renderStudentsBlock();
    return [];
  } catch (err) {
    console.error('Error fetching students:', err);
    allStudents = [];
    return [];
  }
}

// ===== RENDER STUDENTS BLOCK =====
function renderStudentsBlock() {
  const block = document.getElementById('students-block');
  if (!block) return;
  
  if (!allStudents || allStudents.length === 0) {
    block.innerHTML = '';
    return;
  }
  
  let html = `
    <div class="section" style="margin-top: 24px;">
      <h2 class="section-title">
        <i class="fa fa-users"></i>
        Students in Selected Class (${allStudents.length})
      </h2>
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Registration No.</th>
              <th>Email</th>
              <th>Phone</th>
            </tr>
          </thead>
          <tbody>
  `;
  
  allStudents.forEach(student => {
    const firstName = student.firstname || student.firstName || '';
    const surname = student.surname || student.lastName || '';
    const studentId = student.student_id || student.studentId || 'N/A';
    const email = student.email || 'N/A';
    const phone = student.phone || 'N/A';
    
    html += `
      <tr>
        <td><strong>${firstName} ${surname}</strong></td>
        <td>${studentId}</td>
        <td>${email}</td>
        <td>${phone}</td>
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
    const endpoints = [
      `${API_BASE_URL}/teacher/classes/${classId}/subjects`,
      `${API_BASE_URL}/classes/${classId}/subjects`,
      `${API_BASE_URL}/subject?class=${classId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        let subjects = Array.isArray(data) ? data : (data.subjects || data.data || []);
        
        renderSubjectsBlock(subjects);
        populateAssignmentSubjects(subjects);
        populateCBTSubjects(subjects);
        
        return subjects;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch subjects from all endpoints');
    return [];
  } catch (err) {
    console.error('Error fetching subjects:', err);
    return [];
  }
}

// ===== RENDER SUBJECTS BLOCK =====
function renderSubjectsBlock(subjects = []) {
  const block = document.getElementById('subjects-block');
  if (!block) return;
  
  if (!subjects || subjects.length === 0) {
    block.innerHTML = '';
    return;
  }
  
  let html = `
    <div class="section" style="margin-top: 24px;">
      <h2 class="section-title">
        <i class="fa fa-chalkboard"></i>
        Subjects Taught (${subjects.length})
      </h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
  `;
  
  subjects.forEach(subject => {
    const subjectName = typeof subject === 'string' ? subject : (subject.name || subject.subjectName || subject);
    html += `
      <div class="stat-card">
        <div class="stat-icon" style="background: linear-gradient(90deg, #10b981, #059669);">
          <i class="fa fa-book-open"></i>
        </div>
        <div class="stat-value" style="font-size: 1.1rem;">${subjectName}</div>
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

// ===== FETCH ASSIGNMENTS =====
async function fetchAssignments() {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/assignments`,
      `${API_BASE_URL}/assignments?teacher=me`,
      `${API_BASE_URL}/assignment/my-assignments`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        allAssignments = Array.isArray(data) ? data : (data.assignments || data.data || []);
        
        renderAssignmentList();
        populateAssignmentCBTs();
        
        return allAssignments;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch assignments from all endpoints');
    allAssignments = [];
    renderAssignmentList();
    return [];
  } catch (err) {
    console.error('Error fetching assignments:', err);
    allAssignments = [];
    return [];
  }
}

// ===== RENDER ASSIGNMENT LIST =====
function renderAssignmentList() {
  const container = document.getElementById('assignment-list');
  if (!container) return;
  
  if (!allAssignments || allAssignments.length === 0) {
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
    const dueDate = new Date(assignment.dueDate || assignment.due);
    const isOverdue = dueDate < new Date();
    const classNameValue = assignment.class?.name || assignment.className || 'Unknown';
    const subject = assignment.subject || assignment.subjectName || 'Unknown Subject';
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${assignment.title}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${classNameValue} | ${subject}
          </div>
          <div style="font-size: 0.85rem; color: ${isOverdue ? '#e74c3c' : '#6b7280'}; margin-top: 4px;">
            Due: ${dueDate.toLocaleDateString()} ${isOverdue ? '(Overdue)' : ''}
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn secondary" onclick="editAssignment('${assignment._id || assignment.id}')">
            <i class="fa fa-edit"></i> Edit
          </button>
          <button class="btn secondary" style="border-color: #f8d7da; color: #721c24;" onclick="deleteAssignment('${assignment._id || assignment.id}')">
            <i class="fa fa-trash"></i> Delete
          </button>
        </div>
      </div>
    `;
  });
  
  document.getElementById('assignment-list').innerHTML = html;
}

// ===== ATTENDANCE FUNCTIONS =====
function renderAttendanceStudents() {
  const container = document.getElementById('attendance-students');
  if (!container) return;
  
  if (!allStudents || allStudents.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">Select a class first</p>';
    return;
  }
  
  let html = '<div style="margin-top: 16px;">';
  allStudents.forEach((student, idx) => {
    const firstName = student.firstname || student.firstName || '';
    const surname = student.surname || student.lastName || '';
    const studentId = student.student_id || student.studentId || '';
    const studentDbId = student._id || student.id || '';
    
    html += `
      <div style="padding: 12px; background: #f8faff; border-radius: 8px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--accent);">${firstName} ${surname}</div>
          <div style="font-size: 0.85rem; color: var(--muted);">${studentId}</div>
        </div>
        <select class="attendance-status" data-student-id="${studentDbId}" style="padding: 8px; border: 1.5px solid #eef3ff; border-radius: 6px; font-family: inherit;">
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

document.getElementById('attendance-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const classId = document.getElementById('attendance-class').value;
  if (!classId) {
    alert('Please select a class');
    return;
  }
  
  const attendance = [];
  document.querySelectorAll('.attendance-status').forEach(select => {
    attendance.push({
      student: select.dataset.studentId,
      status: select.value
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
    
    alert('✓ Attendance saved successfully!');
  } catch (err) {
    console.error('Error saving attendance:', err);
    alert('Failed to save attendance: ' + err.message);
  }
});

// ===== GRADEBOOK FUNCTIONS =====
function renderGradebookTable() {
  const container = document.getElementById('gradebook-table');
  if (!container) return;
  
  if (!allStudents || allStudents.length === 0) {
    container.innerHTML = '<p style="color: var(--muted); text-align: center; padding: 20px;">Select a class first</p>';
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
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  allStudents.forEach(student => {
    const firstName = student.firstname || student.firstName || '';
    const surname = student.surname || student.lastName || '';
    const studentId = student.student_id || student.studentId || 'N/A';
    const studentDbId = student._id || student.id || '';
    
    html += `
      <tr>
        <td><strong>${firstName} ${surname}</strong></td>
        <td>${studentId}</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>-</td>
        <td>
          <button class="btn secondary" onclick="openResultModal('${studentDbId}', '${currentClassId}')">
            <i class="fa fa-plus"></i> Enter
          </button>
        </td>
      </tr>
    `;
  });
  
  html += `
      </tbody>
    </table>
  `;
  
  container.innerHTML = html;
}

// ===== OPEN ASSIGNMENT MODAL =====
function openAssignmentModal(assignmentId = null) {
  const modal = document.getElementById('assignmentModalBg');
  const form = document.getElementById('assignmentForm');
  
  if (assignmentId && allAssignments) {
    const assignment = allAssignments.find(a => (a._id || a.id) === assignmentId);
    if (assignment) {
      document.querySelector('.modal-title').textContent = 'Edit Assignment';
      document.getElementById('assignment-class').value = assignment.class?._id || assignment.classId || '';
      document.getElementById('assignment-subject').value = assignment.subject || '';
      document.getElementById('assignment-title').value = assignment.title || '';
      document.getElementById('assignment-desc').value = assignment.description || assignment.desc || '';
      document.getElementById('assignment-due').value = (assignment.dueDate || assignment.due)?.split('T')[0] || '';
      document.getElementById('assignment-cbt').value = assignment.cbt?._id || assignment.cbtId || '';
      form.dataset.assignmentId = assignment._id || assignment.id;
    }
  } else {
    document.querySelector('.modal-title').textContent = 'Create Assignment';
    form.reset();
    delete form.dataset.assignmentId;
  }
  
  modal.classList.add('active');
}

function closeAssignmentModal() {
  document.getElementById('assignmentModalBg').classList.remove('active');
}

// ===== SUBMIT ASSIGNMENT =====
document.getElementById('assignmentForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const assignmentId = this.dataset.assignmentId;
  const classId = document.getElementById('assignment-class').value;
  
  if (!classId) {
    alert('Please select a class');
    return;
  }
  
  const data = {
    class: classId,
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
    
    alert('✓ Assignment saved successfully!');
    closeAssignmentModal();
    await fetchAssignments();
  } catch (err) {
    console.error('Error saving assignment:', err);
    alert('Failed to save assignment: ' + err.message);
  }
});

async function editAssignment(assignmentId) {
  openAssignmentModal(assignmentId);
}

async function deleteAssignment(assignmentId) {
  if (!confirm('Are you sure you want to delete this assignment?')) return;
  
  try {
    const res = await fetch(`${API_BASE_URL}/assignments/${assignmentId}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    
    if (!res.ok) throw new Error('Failed to delete assignment');
    
    alert('✓ Assignment deleted successfully!');
    await fetchAssignments();
  } catch (err) {
    console.error('Error deleting assignment:', err);
    alert('Failed to delete assignment: ' + err.message);
  }
}

// ===== DRAFT RESULTS FUNCTIONS =====
async function fetchDraftResults() {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/draft-results`,
      `${API_BASE_URL}/results/draft`,
      `${API_BASE_URL}/teacher/results?status=draft`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        let results = Array.isArray(data) ? data : (data.results || data.data || []);
        
        renderDraftResults(results);
        return results;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch draft results from all endpoints');
    renderDraftResults([]);
    return [];
  } catch (err) {
    console.error('Error fetching draft results:', err);
    renderDraftResults([]);
    return [];
  }
}

function renderDraftResults(results = []) {
  const tbody = document.getElementById('draft-results-tbody');
  if (!tbody) return;
  
  if (!results || results.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6">
          <div class="empty-state">
            <div class="empty-state-icon">📋</div>
            <div class="empty-state-title">No draft results</div>
          </div>
        </td>
      </tr>
    `;
    return;
  }
  
  let html = '';
  results.forEach(result => {
    const studentName = (result.student?.firstname || '') + ' ' + (result.student?.surname || '');
    const className = result.class?.name || 'Unknown';
    const term = result.term || 'Term 1';
    const updatedAt = new Date(result.updatedAt).toLocaleDateString();
    
    html += `
      <tr>
        <td><strong>${studentName}</strong></td>
        <td>${className}</td>
        <td>${term}</td>
        <td><span class="badge badge-draft">Draft</span></td>
        <td>${updatedAt}</td>
        <td>
          <button class="btn secondary" onclick="openResultModal('${result.student?._id}', '${result.class?._id}')">
            <i class="fa fa-edit"></i> Edit
          </button>
        </td>
      </tr>
    `;
  });
  
  tbody.innerHTML = html;
}

// ===== RESULT ENTRY MODAL =====
function openResultModal(studentId, classId) {
  currentResultStudentId = studentId;
  currentResultClassId = classId;
  
  const student = allStudents?.find(s => (s._id || s.id) === studentId);
  const className = teacherClasses?.find(c => (c._id || c.id) === classId)?.name || 'Unknown';
  const studentName = (student?.firstname || '') + ' ' + (student?.surname || '');
  
  document.querySelector('#resultModalBg .modal-title').textContent = 
    `Enter Results for ${studentName}`;
  
  const fieldsDiv = document.getElementById('resultFormFields');
  fieldsDiv.innerHTML = `
    <div class="form-group">
      <label>Student: ${studentName}</label>
    </div>
    <div class="form-group">
      <label>Class: ${className}</label>
    </div>
    <div class="form-group">
      <label for="result-term">Term</label>
      <select id="result-term" required style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; font-family: inherit;">
        <option value="FIRST TERM">First Term</option>
        <option value="SECOND TERM">Second Term</option>
        <option value="THIRD TERM">Third Term</option>
      </select>
    </div>
    <div class="form-group">
      <label for="result-score">Score (0-100)</label>
      <input type="number" id="result-score" min="0" max="100" required style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px;">
    </div>
    <div class="form-group">
      <label for="result-grade">Grade</label>
      <select id="result-grade" required style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; font-family: inherit;">
        <option value="A">A (90-100)</option>
        <option value="B">B (80-89)</option>
        <option value="C">C (70-79)</option>
        <option value="D">D (60-69)</option>
        <option value="E">E (50-59)</option>
        <option value="F">F (Below 50)</option>
      </select>
    </div>
    <div class="form-group">
      <label for="result-remark">Remark</label>
      <textarea id="result-remark" rows="3" placeholder="Optional remarks..." style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; font-family: inherit;"></textarea>
    </div>
  `;
  
  document.getElementById('resultModalBg').classList.add('active');
}

function closeResultModal() {
  document.getElementById('resultModalBg').classList.remove('active');
  currentResultStudentId = null;
  currentResultClassId = null;
}

document.getElementById('resultForm')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const data = {
    student: currentResultStudentId,
    class: currentResultClassId,
    term: document.getElementById('result-term').value,
    score: parseInt(document.getElementById('result-score').value),
    grade: document.getElementById('result-grade').value,
    remark: document.getElementById('result-remark').value,
    status: 'Draft'
  };
  
  try {
    const res = await fetch(`${API_BASE_URL}/teacher/results`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Failed to save result');
    
    alert('✓ Result saved as draft!');
    closeResultModal();
    await fetchDraftResults();
  } catch (err) {
    console.error('Error saving result:', err);
    alert('Failed to save result: ' + err.message);
  }
});

// ===== CBT QUESTIONS FUNCTIONS =====
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
  try {
    const draft = localStorage.getItem(cbtDraftKey);
    if (draft) {
      const data = JSON.parse(draft);
      cbtQuestions = data.questions || [];
    }
  } catch (err) {
    console.error('Error loading CBT draft:', err);
    cbtQuestions = [];
  }
}

function clearCBTDraftFromLocalStorage() {
  localStorage.removeItem(cbtDraftKey);
  cbtQuestions = [];
}

// ===== RENDER CBT QUESTION SECTION =====
function renderCBTQuestionSection() {
  const classSelect = document.getElementById('cbt-class-select');
  const subjectSelect = document.getElementById('cbt-subject-select');
  
  if (!classSelect || !subjectSelect) return;
  
  // Populate class select
  populateClassSelects();
  
  // Update subjects when class changes
  classSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      await fetchSubjectsByClass(e.target.value);
    }
  });
  
  renderCBTQuestions();
}

// ===== RENDER CBT QUESTIONS =====
function renderCBTQuestions() {
  const container = document.getElementById('cbt-questions-list');
  if (!container) return;
  
  let html = '';
  if (!cbtQuestions || cbtQuestions.length === 0) {
    html = '<p style="color: var(--muted); text-align: center; padding: 20px;">No questions added yet. Click "Add Question" to start.</p>';
  } else {
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
            <textarea class="cbt-question-text" data-index="${idx}" style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; width: 100%; min-height: 80px; font-family: inherit;">${q.text || ''}</textarea>
          </div>
          
          <div class="form-group">
            <label>Points</label>
            <input type="number" class="cbt-qscore" data-index="${idx}" value="${q.score || 1}" min="1" style="padding: 10px 12px; border: 1.5px solid #eef3ff; border-radius: 8px; max-width: 100px;">
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
  }
  
  container.innerHTML = html;
  
  // Attach event listeners
  document.querySelectorAll('.cbt-question-text').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (cbtQuestions[idx]) {
        cbtQuestions[idx].text = e.target.value;
        saveCBTDraftToLocalStorage();
      }
    });
  });
  
  document.querySelectorAll('.cbt-qscore').forEach((el) => {
    el.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.index);
      if (cbtQuestions[idx]) {
        cbtQuestions[idx].score = Number(e.target.value) || 1;
        saveCBTDraftToLocalStorage();
      }
    });
  });
  
  renderCBTOptions();
}

// ===== RENDER CBT OPTIONS =====
function renderCBTOptions() {
  cbtQuestions.forEach((q, qidx) => {
    const optionsDiv = document.getElementById(`options-${qidx}`);
    if (!optionsDiv) return;
    
    let html = '';
    if (!q.options || q.options.length === 0) {
      html = '<p style="color: var(--muted); font-size: 0.85rem;">No options added yet</p>';
    } else {
      (q.options || []).forEach((opt, oidx) => {
        const isCorrect = q.answer === oidx;
        html += `
          <div style="padding: 10px; background: #fff; border: 1px solid #eef3ff; border-radius: 8px; margin-bottom: 8px; display: flex; gap: 8px; align-items: center;">
            <input type="text" value="${opt.value || ''}" class="cbt-option-text" data-qidx="${qidx}" data-oidx="${oidx}" style="flex: 1; padding: 8px; border: 1px solid #eef3ff; border-radius: 6px;" placeholder="Option text">
            <button type="button" class="btn secondary" onclick="window.setCBTCorrect(${qidx}, ${oidx})" style="padding: 8px 12px; background: ${isCorrect ? 'var(--accent-2)' : 'transparent'}; color: ${isCorrect ? '#fff' : 'var(--accent-2)'};">
              <i class="fa fa-check"></i> 
            </button>
            <button type="button" class="btn secondary" onclick="window.removeCBTOption(${qidx}, ${oidx})">
              <i class="fa fa-trash"></i>
            </button>
          </div>
        `;
      });
    }
    
    optionsDiv.innerHTML = html;
    
    // Attach event listeners
    optionsDiv.querySelectorAll('.cbt-option-text').forEach((el) => {
      el.addEventListener('input', (e) => {
        const qidx = parseInt(e.target.dataset.qidx);
        const oidx = parseInt(e.target.dataset.oidx);
        if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
        if (!cbtQuestions[qidx].options[oidx]) cbtQuestions[qidx].options[oidx] = {};
        cbtQuestions[qidx].options[oidx].value = e.target.value;
        saveCBTDraftToLocalStorage();
      });
    });
  });
}

// ===== WINDOW FUNCTIONS FOR CBT =====
window.removeCBTQuestion = function(idx) {
  if (cbtQuestions && cbtQuestions[idx]) {
    cbtQuestions.splice(idx, 1);
    saveCBTDraftToLocalStorage();
    renderCBTQuestions();
  }
};

window.addCBTOption = function(qidx) {
  if (cbtQuestions && cbtQuestions[qidx]) {
    if (!cbtQuestions[qidx].options) cbtQuestions[qidx].options = [];
    cbtQuestions[qidx].options.push({ value: '' });
    saveCBTDraftToLocalStorage();
    renderCBTOptions();
  }
};

window.removeCBTOption = function(qidx, oidx) {
  if (cbtQuestions && cbtQuestions[qidx] && cbtQuestions[qidx].options) {
    cbtQuestions[qidx].options.splice(oidx, 1);
    if (cbtQuestions[qidx].answer === oidx) cbtQuestions[qidx].answer = 0;
    saveCBTDraftToLocalStorage();
    renderCBTOptions();
  }
};

window.setCBTCorrect = function(qidx, oidx) {
  if (cbtQuestions && cbtQuestions[qidx]) {
    cbtQuestions[qidx].answer = oidx;
    saveCBTDraftToLocalStorage();
    renderCBTOptions();
  }
};

// ===== ADD CBT QUESTION BUTTON =====
document.getElementById('cbt-add-question-btn')?.addEventListener('click', function() {
  cbtQuestions.push({
    text: '',
    score: 1,
    options: [{ value: '' }, { value: '' }],
    answer: 0
  });
  saveCBTDraftToLocalStorage();
  renderCBTQuestions();
});

// ===== SUBMIT CBT QUESTION FORM =====
document.getElementById('cbt-question-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const classId = document.getElementById('cbt-class-select')?.value;
  const subjectId = document.getElementById('cbt-subject-select')?.value;
  const title = document.getElementById('cbt-title')?.value;
  const duration = parseInt(document.getElementById('cbt-duration')?.value || 0);
  
  if (!classId || !subjectId || !title || !duration) {
    alert('Please fill in all required fields');
    return;
  }
  
  if (!cbtQuestions || cbtQuestions.length === 0) {
    alert('Please add at least one question');
    return;
  }
  
  // Validate questions
  for (let q of cbtQuestions) {
    if (!q.text || !q.options || q.options.length < 2) {
      alert('Each question must have text and at least 2 options');
      return;
    }
  }
  
  const data = {
    class: classId,
    subject: subjectId,
    title: title,
    duration: duration,
    questions: cbtQuestions
  };
  
  const uploadBtn = document.getElementById('cbt-upload-btn');
  const msgDiv = document.getElementById('cbt-upload-msg');
  
  uploadBtn.disabled = true;
  msgDiv.textContent = '⏳ Uploading...';
  msgDiv.style.display = 'block';
  msgDiv.style.background = '#d1ecf1';
  msgDiv.style.color = '#0c5460';
  msgDiv.style.padding = '12px';
  msgDiv.style.borderRadius = '8px';
  
  try {
    const res = await fetch(`${API_BASE_URL}/exam/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(data)
    });
    
    if (!res.ok) throw new Error('Failed to upload CBT');
    
    msgDiv.textContent = '✓ CBT uploaded successfully!';
    msgDiv.style.background = '#d4edda';
    msgDiv.style.color = '#155724';
    
    setTimeout(() => {
      clearCBTDraftFromLocalStorage();
      this.reset();
      cbtQuestions = [];
      renderCBTQuestions();
      fetchTeacherCBTs();
      msgDiv.style.display = 'none';
      uploadBtn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error('Error uploading CBT:', err);
    msgDiv.textContent = '✗ Failed: ' + err.message;
    msgDiv.style.background = '#f8d7da';
    msgDiv.style.color = '#721c24';
    uploadBtn.disabled = false;
  }
});

// ===== POPULATE SUBJECT SELECTS =====
function populateAssignmentSubjects(subjects = []) {
  const select = document.getElementById('assignment-subject');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select a subject...</option>';
  subjects.forEach(subject => {
    const opt = document.createElement('option');
    opt.value = typeof subject === 'string' ? subject : (subject._id || subject.id);
    opt.textContent = typeof subject === 'string' ? subject : (subject.name || subject.subjectName);
    select.appendChild(opt);
  });
}

function populateCBTSubjects(subjects = []) {
  const select = document.getElementById('cbt-subject-select');
  if (!select) return;
  
  select.innerHTML = '<option value="">Select a subject...</option>';
  subjects.forEach(subject => {
    const opt = document.createElement('option');
    opt.value = typeof subject === 'string' ? subject : (subject._id || subject.id);
    opt.textContent = typeof subject === 'string' ? subject : (subject.name || subject.subjectName);
    select.appendChild(opt);
  });
}

// ===== FETCH TEACHER CBTs =====
async function fetchTeacherCBTs() {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/cbts`,
      `${API_BASE_URL}/exam/my-exams`,
      `${API_BASE_URL}/cbt/my-cbts`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        let cbts = Array.isArray(data) ? data : (data.cbts || data.exams || data.data || []);
        
        renderMyCBTQuestions(cbts);
        populateAssignmentCBTs(cbts);
        
        return cbts;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch CBTs from all endpoints');
    renderMyCBTQuestions([]);
    return [];
  } catch (err) {
    console.error('Error fetching CBTs:', err);
    renderMyCBTQuestions([]);
    return [];
  }
}

// ===== RENDER MY CBT QUESTIONS =====
function renderMyCBTQuestions(cbts = []) {
  const container = document.getElementById('myCBTQuestionsList');
  if (!container) return;
  
  if (!cbts || cbts.length === 0) {
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
    const cbtId = cbt._id || cbt.id;
    const cbtTitle = cbt.title || 'Untitled CBT';
    const cbtSubject = cbt.subject || cbt.subjectName || 'Unknown';
    const questionCount = cbt.questions?.length || 0;
    const duration = cbt.duration || 0;
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${cbtTitle}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${cbtSubject} | ${questionCount} questions | ${duration} mins
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" class="cbt-select-checkbox" data-cbt-id="${cbtId}" style="cursor: pointer; width: 18px; height: 18px; margin-right: 8px;">
          </label>
          <button class="btn secondary" onclick="window.viewCBT('${cbtId}')">
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
    opt.value = cbt._id || cbt.id;
    const questionCount = cbt.questions?.length || 0;
    const duration = cbt.duration || 0;
    opt.textContent = `${cbt.title} (${questionCount} Q's, ${duration} min)`;
    select.appendChild(opt);
  });
  
  select.value = selected;
}

// ===== VIEW CBT =====
window.viewCBT = async function(cbtId) {
  try {
    const endpoints = [
      `${API_BASE_URL}/exam/${cbtId}`,
      `${API_BASE_URL}/cbt/${cbtId}`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        const cbt = await res.json();
        alert(`📝 CBT: ${cbt.title}\n\n❓ Questions: ${cbt.questions?.length || 0}\n⏱️ Duration: ${cbt.duration} minutes\n📚 Subject: ${cbt.subject || 'Unknown'}`);
        return;
      } catch (err) {
        continue;
      }
    }
    
    alert('Unable to load CBT details');
  } catch (err) {
    console.error('Error viewing CBT:', err);
    alert('Failed to load CBT details');
  }
};

// ===== FETCH CBT RESULTS =====
async function fetchCBTResults() {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/cbt-results`,
      `${API_BASE_URL}/exam/results`,
      `${API_BASE_URL}/cbt/results`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        let results = Array.isArray(data) ? data : (data.results || data.data || []);
        
        renderCBTResults(results);
        return results;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch CBT results from all endpoints');
    renderCBTResults([]);
    return [];
  } catch (err) {
    console.error('Error fetching CBT results:', err);
    renderCBTResults([]);
    return [];
  }
}

// ===== RENDER CBT RESULTS =====
function renderCBTResults(results = []) {
  const container = document.getElementById('cbtResultsContainer');
  if (!container) return;
  
  if (!results || results.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">💻</div>
        <div class="empty-state-title">No CBT results yet</div>
        <p style="color: var(--muted);">Results will appear here as students complete your CBTs</p>
      </div>
    `;
    return;
  }
  
  let html = '';
  results.forEach(result => {
    const studentName = (result.student?.firstname || '') + ' ' + (result.student?.surname || '');
    const examTitle = result.exam?.title || result.examName || 'Unknown Exam';
    const score = result.score || 0;
    const totalScore = result.totalScore || 100;
    const percentage = totalScore ? ((score / totalScore) * 100).toFixed(1) : 0;
    const submittedDate = new Date(result.submittedAt).toLocaleString();
    
    let percentageColor = '#10b981'; // Green
    if (percentage < 70 && percentage >= 50) percentageColor = '#f59e0b'; // Orange
    if (percentage < 50) percentageColor = '#e74c3c'; // Red
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${studentName}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">
            ${examTitle} | Score: ${score}/${totalScore}
          </div>
          <div style="font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
            Submitted: ${submittedDate}
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-weight: 700; font-size: 1.2rem; color: ${percentageColor};">${percentage}%</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ===== FETCH TEACHER NOTIFICATIONS =====
async function fetchTeacherNotifications() {
  try {
    const endpoints = [
      `${API_BASE_URL}/teacher/notifications`,
      `${API_BASE_URL}/notification/my-notifications`,
      `${API_BASE_URL}/notifications`
    ];
    
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          headers: authHeaders()
        });
        
        if (!res.ok) continue;
        
        let data = await res.json();
        allNotifications = Array.isArray(data) ? data : (data.notifications || data.data || []);
        
        renderNotifications(allNotifications);
        return allNotifications;
      } catch (err) {
        continue;
      }
    }
    
    console.warn('Failed to fetch notifications from all endpoints');
    renderNotifications([]);
    return [];
  } catch (err) {
    console.error('Error fetching notifications:', err);
    renderNotifications([]);
    return [];
  }
}

// ===== RENDER NOTIFICATIONS =====
function renderNotifications(notifications = []) {
  const container = document.getElementById('notification-list');
  if (!container) return;
  
  if (!notifications || notifications.length === 0) {
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
    const title = notif.title || notif.message || 'Notification';
    const message = notif.message || notif.description || '';
    const createdAt = new Date(notif.createdAt || notif.date).toLocaleString();
    
    html += `
      <div class="list-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; color: var(--accent);">${title}</div>
          <div style="font-size: 0.85rem; color: var(--muted); margin-top: 4px;">${message}</div>
          <div style="font-size: 0.8rem; color: var(--muted); margin-top: 6px;">${createdAt}</div>
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
}

// ===== PROFILE UPDATE =====
document.getElementById('profile-form')?.addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const profileNameInput = document.getElementById('profile-name');
  const profileEmailInput = document.getElementById('profile-email');
  const profileSubjectInput = document.getElementById('profile-subject');
  const profilePasswordInput = document.getElementById('profile-password');
  
  const data = {
    name: profileNameInput?.value || teacherData?.name || '',
    email: profileEmailInput?.value || teacherData?.email || '',
    subject: profileSubjectInput?.value || teacherData?.subject || ''
  };
  
  if (profilePasswordInput?.value) {
    data.password = profilePasswordInput.value;
  }
  
  const endpoints = [
    `${API_BASE_URL}/teacher/profile`,
    `${API_BASE_URL}/teacher/update`,
    `${API_BASE_URL}/user/profile`
  ];
  
  try {
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify(data)
        });
        
        if (!res.ok) continue;
        
        alert('✓ Profile updated successfully!');
        await fetchTeacherProfile();
        return;
      } catch (err) {
        continue;
      }
    }
    
    alert('Failed to update profile from all endpoints');
  } catch (err) {
    console.error('Error updating profile:', err);
    alert('Failed to update profile: ' + err.message);
  }
});

// ===== INITIALIZE DASHBOARD =====
async function initializeDashboard() {
  showDashboardSpinner();
  
  try {
    console.log('🚀 Initializing Teacher Dashboard...');
    
    // Initialize sidebar navigation first
    initializeSidebarNavigation();
    console.log('✓ Sidebar navigation initialized');
    
    // Fetch all critical data
    await fetchTeacherProfile();
    console.log('✓ Teacher profile loaded');
    
    await fetchTeacherClasses();
    console.log('✓ Teacher classes loaded');
    
    await fetchAssignments();
    console.log('✓ Assignments loaded');
    
    await fetchTeacherCBTs();
    console.log('✓ CBTs loaded');
    
    await fetchTeacherNotifications();
    console.log('✓ Notifications loaded');
    
    await fetchCBTResults();
    console.log('✓ CBT results loaded');
    
    // Load CBT drafts from local storage
    loadCBTDraftFromLocalStorage();
    console.log('✓ CBT drafts loaded');
    
    console.log('✅ Dashboard initialization complete!');
  } catch (err) {
    console.error('❌ Error initializing dashboard:', err);
    alert('Error loading dashboard. Please refresh the page.');
  } finally {
    hideDashboardSpinner();
  }
}

// ===== PAGE LOAD EVENT =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('📄 Page loaded');
  
  if (!token) {
    console.warn('⚠️ No token found');
    alert('Please log in first');
    window.location.href = 'login.html';
    return;
  }
  
  console.log('✓ Token found, initializing dashboard...');
  initializeDashboard();
});

// ===== WINDOW RESIZE HANDLER =====
window.addEventListener('resize', () => {
  if (window.innerWidth >= 768) {
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    document.body.style.overflow = 'auto';
  }
});

// ===== LOGOUT HANDLER =====
window.logout = function() {
  localStorage.removeItem('token');
  localStorage.removeItem('teacherToken');
  localStorage.removeItem('teacher_token');
  clearCBTDraftFromLocalStorage();
  window.location.href = 'login.html';
};

// ===== ERROR HANDLER =====
window.addEventListener('error', (event) => {
  console.error('❌ Global error:', event.error);
});

// ===== UNHANDLED REJECTION HANDLER =====
window.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Unhandled promise rejection:', event.reason);
});

console.log('✓ Teachers.js loaded successfully');

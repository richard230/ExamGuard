// ============ TAB NAVIGATION ============

// Tab logic for main sections
function showTab(tab) {
  document.querySelectorAll('.tablist button').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('[data-section]').forEach(sec => sec.classList.toggle('hidden', sec.dataset.section !== tab));
  // Highlight active nav link in sidebar
  document.querySelectorAll('.nav a').forEach(nav => nav.classList.toggle('active', nav.dataset.tab === tab));
  
  // Load uploaded subjects when entering the subjects tab
  if (tab === "subjects") loadUploadedSubjects();
}

// Attach tab button click handlers
document.querySelectorAll('.tablist button').forEach(btn => {
  btn.addEventListener('click', () => showTab(btn.dataset.tab));
});

// Exam section tabs
function showExamTab(tab) {
  document.querySelectorAll('#examTabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.examtab === tab));
  document.querySelectorAll('#examTabContent > div').forEach(sec => sec.classList.toggle('hidden', sec.dataset.examsection !== tab));
}

document.querySelectorAll('#examTabs button').forEach(btn => {
  btn.addEventListener('click', () => showExamTab(btn.dataset.examtab));
});

// ============ API CONFIGURATION ============

const API_BASE = "https://goldlincschools.onrender.com/api/academics";
const token = localStorage.getItem('adminToken') || localStorage.getItem('token');

// ============ UTILITY FUNCTIONS ============

// Fill dropdown with data from API
async function fillDropdown(endpoint, selectId, valueKey = 'name') {
  try {
    const res = await fetch(API_BASE + endpoint, { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById(selectId);
    if (select) {
      select.innerHTML = data.map(d => `<option value="${d._id}">${d[valueKey]}</option>`).join('');
    }
  } catch (err) {
    console.error('Error filling dropdown:', err);
  }
}

// Fill teacher dropdown
async function fillTeacherDropdown() {
  try {
    const res = await fetch("https://goldlincschools.onrender.com/api/teachers", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('classTeacherSelect');
    if (select) {
      select.innerHTML = data.map(t => 
        `<option value="${t.id}">${t.name} (${t.email})</option>`
      ).join('');
    }
  } catch (err) {
    console.error('Error filling teacher dropdown:', err);
  }
}

// Fill class dropdown for subjects
async function fillClassDropdown() {
  try {
    const res = await fetch(API_BASE + "/classes", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('assignClassSelect');
    if (select) {
      select.innerHTML = data.map(c => 
        `<option value="${c._id}">${c.name}</option>`
      ).join('');
    }
  } catch (err) {
    console.error('Error filling class dropdown:', err);
  }
}

// Fill teacher dropdown for subjects
async function fillTeacherDropdown2() {
  try {
    const res = await fetch(API_BASE.replace('/academics', '') + "/teachers", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('assignSubjectTeacherSelect');
    if (select) {
      select.innerHTML = data.map(t => 
        `<option value="${t.id}">${t.name} (${t.email})</option>`
      ).join('');
    }
  } catch (err) {
    console.error('Error filling subject teacher dropdown:', err);
  }
}

// ============ CLASSES MANAGEMENT ============

// Toggle teacher dropdown
function toggleTeacherDropdown() {
  const menu = document.getElementById('teacherDropdownMenu');
  if (menu) {
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
  }
}

// Fill teacher checkboxes for class form
async function fillTeacherCheckboxes() {
  try {
    const res = await fetch("https://goldlincschools.onrender.com/api/teachers", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const container = document.getElementById('teacherDropdownMenu');
    if (container) {
      container.innerHTML = data.map(t =>
        `<label style="display: flex; align-items: center; padding: 8px 12px; cursor: pointer;">
          <input type="checkbox" name="teacherIds" value="${t.id}" style="margin-right: 8px;"> 
          ${t.name} (${t.email})
        </label>`
      ).join('');
    }
  } catch (err) {
    console.error('Error filling teacher checkboxes:', err);
  }
}

// Load classes
async function loadClasses() {
  const tbody = document.getElementById('classesTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/classes", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading classes.</td></tr>';
      return;
    }
    const classes = await res.json();
    
    if (!classes.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">No classes found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = classes.map(c =>
      `<tr>
        <td class="py-2 px-3">${c.name}</td>
        <td class="py-2 px-3">${c.arms && c.arms.length ? c.arms.join(', ') : '-'}</td>
        <td class="py-2 px-3">${
          c.teachers && c.teachers.length 
            ? c.teachers.map(t => `${t.first_name ?? t.name ?? ''} ${t.last_name ?? ''}`).join(', ') 
            : '-'
        }</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editClass('${c._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteClass('${c._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading classes.</td></tr>';
    console.error('Error loading classes:', err);
  }
}

// Delete class
window.deleteClass = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API_BASE}/classes/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    if (res.ok) {
      loadClasses();
    } else {
      alert("Failed to delete class.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting class:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Edit class
window.editClass = function(id) {
  fetch(`${API_BASE}/classes/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(cls => {
      const form = document.getElementById('classForm');
      if (!form) return;
      form.name.value = cls.name || "";
      form.arms.value = cls.arms && cls.arms.length ? cls.arms.join(', ') : "";
      
      // Preselect teachers
      const teacherCheckboxes = form.querySelectorAll('input[name="teacherIds"]');
      teacherCheckboxes.forEach(cb => {
        cb.checked = cls.teachers?.some(t => t._id === cb.value || t.id === cb.value);
      });
      
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('classMessage');
      if (msg) msg.textContent = "Editing class. Save to update.";
    })
    .catch(err => console.error('Error editing class:', err));
};

// Add/Update class
document.addEventListener('DOMContentLoaded', () => {
  const classForm = document.getElementById('classForm');
  if (classForm) {
    classForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      
      // Process arms
      data.arms = data.arms 
        ? data.arms.split(',').map(a => a.trim()).filter(a => a) 
        : [];
      
      // Get checked teachers
      const teacherCheckboxes = form.querySelectorAll('input[name="teacherIds"]:checked');
      data.teacherIds = Array.from(teacherCheckboxes).map(cb => cb.value);
      
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('classMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/classes" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          document.querySelectorAll('input[name="teacherIds"]').forEach(cb => cb.checked = false);
          loadClasses();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving class:', err);
      }
    };
  }
});

// ============ SESSIONS MANAGEMENT ============

async function loadSessions() {
  await fillDropdown("/sessions", "termSessionSelect");
  await fillDropdown("/sessions", "resultsSessionSelect");
  
  const tbody = document.getElementById('sessionsTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/sessions", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading sessions.</td></tr>';
      return;
    }
    const sessions = await res.json();
    
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">No sessions found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = sessions.map(s =>
      `<tr>
        <td class="py-2 px-3">${s.name}</td>
        <td class="py-2 px-3">${s.startDate ? s.startDate.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">${s.endDate ? s.endDate.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editSession('${s._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteSession('${s._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading sessions.</td></tr>';
    console.error('Error loading sessions:', err);
  }
}

// Delete session
window.deleteSession = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API_BASE}/sessions/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    if (res.ok) {
      loadSessions();
    } else {
      alert("Failed to delete session.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting session:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Edit session
window.editSession = function(id) {
  fetch(`${API_BASE}/sessions/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(session => {
      const form = document.getElementById('sessionForm');
      if (!form) return;
      form.name.value = session.name || "";
      form.startDate.value = session.startDate ? session.startDate.slice(0, 10) : "";
      form.endDate.value = session.endDate ? session.endDate.slice(0, 10) : "";
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('sessionMessage');
      if (msg) msg.textContent = "Editing session. Save to update.";
    })
    .catch(err => console.error('Error editing session:', err));
};

// Save session
document.addEventListener('DOMContentLoaded', () => {
  const sessionForm = document.getElementById('sessionForm');
  if (sessionForm) {
    sessionForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('sessionMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/sessions" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          loadSessions();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving session:', err);
      }
    };
  }
});

// ============ TERMS MANAGEMENT ============

async function loadTerms() {
  const tbody = document.getElementById('termsTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/terms", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading terms.</td></tr>';
      return;
    }
    const terms = await res.json();
    
    if (!terms.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">No terms found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = terms.map(t =>
      `<tr>
        <td class="py-2 px-3">${t.name}</td>
        <td class="py-2 px-3">${t.session?.name || '-'}</td>
        <td class="py-2 px-3">${t.startDate ? t.startDate.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">${t.endDate ? t.endDate.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editTerm('${t._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteTerm('${t._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading terms.</td></tr>';
    console.error('Error loading terms:', err);
  }
}

// Delete term
window.deleteTerm = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API_BASE}/terms/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    if (res.ok) {
      loadTerms();
    } else {
      alert("Failed to delete term.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting term:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Edit term
window.editTerm = function(id) {
  fetch(`${API_BASE}/terms/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(term => {
      const form = document.getElementById('termForm');
      if (!form) return;
      form.name.value = term.name || "";
      form.sessionId.value = term.sessionId || "";
      form.startDate.value = term.startDate ? term.startDate.slice(0, 10) : "";
      form.endDate.value = term.endDate ? term.endDate.slice(0, 10) : "";
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('termMessage');
      if (msg) msg.textContent = "Editing term. Save to update.";
    })
    .catch(err => console.error('Error editing term:', err));
};

// Save term
document.addEventListener('DOMContentLoaded', () => {
  const termForm = document.getElementById('termForm');
  if (termForm) {
    termForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('termMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/terms" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          loadTerms();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving term:', err);
      }
    };
  }
});

// ============ EXAMS MANAGEMENT ============

// Fill exam dropdowns
fillDropdown("/terms", "examTermSelect");
fillDropdown("/classes", "examClassSelect");
fillDropdown("/classes", "cbtClassSelect");
fillDropdown("/classes", "resultsClassSelect");

// Load exam schedules
async function loadExamSchedules() {
  const tbody = document.getElementById('examScheduleTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/exams/schedules", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading schedules.</td></tr>';
      return;
    }
    const exams = await res.json();
    
    if (!exams.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">No exams scheduled.</td></tr>';
      return;
    }
    
    tbody.innerHTML = exams.map(ex =>
      `<tr>
        <td class="py-2 px-3">${ex.title}</td>
        <td class="py-2 px-3">${ex.term?.name || '-'}</td>
        <td class="py-2 px-3">${ex.class?.name || '-'}</td>
        <td class="py-2 px-3">${ex.date ? ex.date.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editExamSchedule('${ex._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteExamSchedule('${ex._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading schedules.</td></tr>';
    console.error('Error loading exam schedules:', err);
  }
}

// Delete exam schedule
window.deleteExamSchedule = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API_BASE}/exams/schedules/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    if (res.ok) {
      loadExamSchedules();
    } else {
      alert("Failed to delete exam schedule.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting exam schedule:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Edit exam schedule
window.editExamSchedule = function(id) {
  fetch(`${API_BASE}/exams/schedules/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(exam => {
      const form = document.getElementById('examScheduleForm');
      if (!form) return;
      form.title.value = exam.title || "";
      form.termId.value = exam.termId || "";
      form.classId.value = exam.classId || "";
      form.date.value = exam.date ? exam.date.slice(0, 10) : "";
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('examScheduleMessage');
      if (msg) msg.textContent = "Editing exam schedule. Save to update.";
    })
    .catch(err => console.error('Error editing exam schedule:', err));
};

// Save exam schedule
document.addEventListener('DOMContentLoaded', () => {
  const examScheduleForm = document.getElementById('examScheduleForm');
  if (examScheduleForm) {
    examScheduleForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('examScheduleMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/exams/schedules" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          loadExamSchedules();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving exam schedule:', err);
      }
    };
  }
});

// Fill exams dropdown for modes
async function fillExamDropdown() {
  try {
    const res = await fetch(API_BASE + "/exams/schedules", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const exams = await res.json();
    const select = document.getElementById('modeExamSelect');
    if (select) {
      select.innerHTML = exams.map(ex => `<option value="${ex._id}">${ex.title}</option>`).join('');
    }
  } catch (err) {
    console.error('Error filling exam dropdown:', err);
  }
}

// Load exam modes
async function loadExamModes() {
  const tbody = document.getElementById('examModeTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/exams/modes", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading modes.</td></tr>';
      return;
    }
    const modes = await res.json();
    
    if (!modes.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">No exam modes set.</td></tr>';
      return;
    }
    
    tbody.innerHTML = modes.map(m =>
      `<tr>
        <td class="py-2 px-3">${m.exam?.title || '-'}</td>
        <td class="py-2 px-3">${m.mode}</td>
        <td class="py-2 px-3">${m.duration || '-'}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editExamMode('${m._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="4">Error loading modes.</td></tr>';
    console.error('Error loading exam modes:', err);
  }
}

// Edit exam mode
window.editExamMode = function(id) {
  fetch(`${API_BASE}/exams/modes/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(mode => {
      const form = document.getElementById('examModeForm');
      if (!form) return;
      form.examId.value = mode.examId || "";
      form.mode.value = mode.mode || "";
      form.duration.value = mode.duration || "";
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('examModeMessage');
      if (msg) msg.textContent = "Editing exam mode. Save to update.";
    })
    .catch(err => console.error('Error editing exam mode:', err));
};

// Save exam mode
document.addEventListener('DOMContentLoaded', () => {
  const examModeForm = document.getElementById('examModeForm');
  if (examModeForm) {
    examModeForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('examModeMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/exams/modes" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          loadExamModes();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving exam mode:', err);
      }
    };
  }
});

// ============ CBT & MOCKS MANAGEMENT ============

async function loadCBTs() {
  const tbody = document.getElementById('cbtTableBody');
  if (!tbody) return;
  
  try {
    const res = await fetch(API_BASE + "/cbt/mocks", { 
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading CBT/mocks.</td></tr>';
      return;
    }
    const cbts = await res.json();
    
    if (!cbts.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">No CBT/mocks found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = cbts.map(c =>
      `<tr>
        <td class="py-2 px-3">${c.title}</td>
        <td class="py-2 px-3">${c.class?.name || '-'}</td>
        <td class="py-2 px-3">${c.mode}</td>
        <td class="py-2 px-3">${c.date ? c.date.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="editCBT('${c._id}')" title="Edit">
            <i class="fa fa-edit"></i>
          </button>
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteCBT('${c._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading CBT/mocks.</td></tr>';
    console.error('Error loading CBTs:', err);
  }
}

// Delete CBT/Mock
window.deleteCBT = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`${API_BASE}/cbt/mocks/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    if (res.ok) {
      loadCBTs();
    } else {
      alert("Failed to delete CBT/mock.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting CBT:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Edit CBT/Mock
window.editCBT = function(id) {
  fetch(`${API_BASE}/cbt/mocks/${id}`, { 
    headers: { Authorization: "Bearer " + token }
  })
    .then(res => res.json())
    .then(cbt => {
      const form = document.getElementById('cbtForm');
      if (!form) return;
      form.title.value = cbt.title || "";
      form.classId.value = cbt.classId || "";
      form.mode.value = cbt.mode || "";
      form.date.value = cbt.date ? cbt.date.slice(0, 10) : "";
      form.setAttribute('data-edit-id', id);
      const msg = document.getElementById('cbtMessage');
      if (msg) msg.textContent = "Editing CBT/mock. Save to update.";
    })
    .catch(err => console.error('Error editing CBT:', err));
};

// Save CBT/Mock
document.addEventListener('DOMContentLoaded', () => {
  const cbtForm = document.getElementById('cbtForm');
  if (cbtForm) {
    cbtForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = this;
      const data = Object.fromEntries(new FormData(form));
      const editId = form.getAttribute('data-edit-id');
      const msgEl = document.getElementById('cbtMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const method = editId ? "PUT" : "POST";
        const url = API_BASE + "/cbt/mocks" + (editId ? "/" + editId : "");
        const res = await fetch(url, {
          method,
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify(data)
        });
        
        if (msgEl) msgEl.textContent = res.ok ? "Saved!" : "Failed!";
        if (res.ok) {
          form.reset();
          form.removeAttribute('data-edit-id');
          loadCBTs();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error saving CBT:', err);
      }
    };
  }
});

// ============ RESULTS & CBT PUSH ============

async function loadResults(filter = {}) {
  const tbody = document.getElementById('resultsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="7">Loading...</td></tr>';
  
  try {
    let results = [];
    
    if (filter.type === "CBT") {
      const res = await fetch("https://goldlincschools.onrender.com/api/result", { 
        headers: { Authorization: "Bearer " + token } 
      });
      if (!res.ok) throw new Error('Failed to fetch CBT results');
      
      results = await res.json();
      
      if (!results.length) {
        tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="7">No CBT results found.</td></tr>';
        return;
      }
      
      tbody.innerHTML = results.map(r =>
        `<tr>
          <td class="py-2 px-3">${r.studentName || '-'}</td>
          <td class="py-2 px-3">${r.className || '-'}</td>
          <td class="py-2 px-3">CBT</td>
          <td class="py-2 px-3">${r.examTitle || '-'}</td>
          <td class="py-2 px-3">${r.score}/${r.total}</td>
          <td class="py-2 px-3">${r.finishedAt ? r.finishedAt.slice(0, 10) : ''}</td>
          <td class="py-2 px-3">
            <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteCBTResult('${r._id}', this)" title="Delete">
              <i class="fa fa-trash"></i>
            </button>
          </td>
        </tr>`
      ).join('');
      return;
    }
    
    let url = API_BASE + "/results/cbt-mocks";
    if (filter.sessionId || filter.classId || filter.type) {
      url += '?' + new URLSearchParams(filter).toString();
    }
    
    const res = await fetch(url, { 
      headers: { Authorization: "Bearer " + token } 
    });
    if (!res.ok) throw new Error('Failed to fetch results');
    
    results = await res.json();
    
    if (!results.length) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="7">No results found.</td></tr>';
      return;
    }
    
    tbody.innerHTML = results.map(r =>
      `<tr>
        <td class="py-2 px-3">${r.student?.name || '-'}</td>
        <td class="py-2 px-3">${r.class?.name || '-'}</td>
        <td class="py-2 px-3">${r.type || '-'}</td>
        <td class="py-2 px-3">${r.exam?.title || r.mock?.title || '-'}</td>
        <td class="py-2 px-3">${r.score}</td>
        <td class="py-2 px-3">${r.date ? r.date.slice(0, 10) : ''}</td>
        <td class="py-2 px-3">
          <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteCBTResult('${r._id}', this)" title="Delete">
            <i class="fa fa-trash"></i>
          </button>
        </td>
      </tr>`
    ).join('');
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="7">Error loading results.</td></tr>';
    console.error('Error loading results:', err);
  }
}

// Filter results form
document.addEventListener('DOMContentLoaded', () => {
  const resultsForm = document.getElementById('resultsFilterForm');
  if (resultsForm) {
    resultsForm.onsubmit = function(e) {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(this));
      loadResults(data);
    };
  }
});

// Delete CBT result
window.deleteCBTResult = async function(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    let res = await fetch(`https://goldlincschools.onrender.com/api/result/${id}`, { 
      method: "DELETE", 
      headers: { Authorization: "Bearer " + token } 
    });
    
    if (!res.ok) {
      const url = API_BASE + `/results/cbt-mocks/${id}`;
      res = await fetch(url, { 
        method: "DELETE", 
        headers: { Authorization: "Bearer " + token } 
      });
    }
    
    if (res.ok) {
      loadResults();
    } else {
      alert("Failed to delete result.");
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting CBT result:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// Fill push CBT dropdowns
async function fillPushCBTSessionDropdown() {
  try {
    const res = await fetch("https://goldlincschools.onrender.com/api/academics/sessions", { 
      headers: { Authorization: "Bearer " + token } 
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('pushCBTSessionSelect');
    if (select) {
      select.innerHTML = data.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
    }
  } catch (err) {
    console.error('Error filling push CBT session dropdown:', err);
  }
}

async function fillPushCBTTermDropdown() {
  try {
    const res = await fetch("https://goldlincschools.onrender.com/api/academics/terms", { 
      headers: { Authorization: "Bearer " + token } 
    });
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById('pushCBTTermSelect');
    if (select) {
      select.innerHTML = data.map(t => `<option value="${t._id}">${t.name} (${t.session?.name || "-"})</option>`).join('');
    }
  } catch (err) {
    console.error('Error filling push CBT term dropdown:', err);
  }
}

// Push CBT Results Modal
document.addEventListener('DOMContentLoaded', () => {
  const pushCBTResultsBtn = document.getElementById('pushCBTResultsBtn');
  const pushCBTModal = document.getElementById('pushCBTModal');
  const pushCBTModalForm = document.getElementById('pushCBTModalForm');
  const pushCBTResultsMessage = document.getElementById('pushCBTResultsMessage');
  const pushCBTModalFeedback = document.getElementById('pushCBTModalFeedback');
  const cancelPushCBTModal = document.getElementById('cancelPushCBTModal');
  
  if (pushCBTResultsBtn) {
    pushCBTResultsBtn.addEventListener('click', () => {
      fillPushCBTSessionDropdown();
      fillPushCBTTermDropdown();
      pushCBTModal.style.display = 'flex';
      if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = "";
    });
  }
  
  if (cancelPushCBTModal) {
    cancelPushCBTModal.addEventListener('click', () => {
      pushCBTModal.style.display = 'none';
      if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = "";
    });
  }
  
  if (pushCBTModalForm) {
    pushCBTModalForm.onsubmit = async function(e) {
      e.preventDefault();
      const formData = new FormData(pushCBTModalForm);
      const scoreField = formData.get('scoreField');
      const sessionId = formData.get('sessionId');
      const termId = formData.get('termId');
      
      if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = "Pushing CBT results...";
      
      try {
        const res = await fetch("https://goldlincschools.onrender.com/api/results/push-cbt", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ scoreField, sessionId, termId })
        });
        
        const data = await res.json();
        if (data.success) {
          if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = `Done! Inserted: ${data.inserted}, Skipped: ${data.skipped}`;
          if (pushCBTResultsMessage) pushCBTResultsMessage.textContent = `Last push: Inserted ${data.inserted}, Skipped ${data.skipped}`;
        } else {
          if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = "Error: " + (data.error || "Unknown error");
        }
      } catch (err) {
        if (pushCBTModalFeedback) pushCBTModalFeedback.textContent = "Network error";
        console.error('Error pushing CBT results:', err);
      } finally {
        setTimeout(() => {
          pushCBTModal.style.display = 'none';
        }, 2000);
      }
    };
  }
});

// ============ SUBJECTS MANAGEMENT ============

// Assign subject to class
document.addEventListener('DOMContentLoaded', () => {
  const assignSubjectForm = document.getElementById('assignSubjectForm');
  if (assignSubjectForm) {
    assignSubjectForm.onsubmit = async function(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      const msgEl = document.getElementById('assignSubjectMessage');
      if (msgEl) msgEl.textContent = "Saving...";
      
      try {
        const res = await fetch(API_BASE + `/classes/${data.classId}/subjects`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json", 
            "Authorization": "Bearer " + token 
          },
          body: JSON.stringify({ subjectName: data.subjectName, teacherId: data.teacherId })
        });
        
        const resp = await res.json();
        if (msgEl) {
          msgEl.textContent = res.ok ? "Assigned!" : ("Error: " + (resp.error || "Unknown"));
        }
        if (res.ok) {
          form.reset();
          loadUploadedSubjects();
        }
      } catch (err) {
        if (msgEl) msgEl.textContent = "Network error.";
        console.error('Error assigning subject:', err);
      }
    };
  }
});

// Load uploaded subjects
async function loadUploadedSubjects() {
  const tbody = document.getElementById('uploadedSubjectsTableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Loading...</td></tr>';
  
  try {
    const res = await fetch("https://goldlincschools.onrender.com/api/academics/classes", { 
      headers: { Authorization: "Bearer " + token } 
    });
    if (!res.ok) throw new Error('Failed to fetch classes');
    
    const classes = await res.json();
    let rows = [];
    
    classes.forEach(cls => {
      if (Array.isArray(cls.subjects)) {
        cls.subjects.forEach(subj => {
          const subjectId = subj.subject || subj._id;
          rows.push(`
            <tr>
              <td class="py-2 px-3">${subj.subject?.name || '-'}</td>
              <td class="py-2 px-3">${cls.name || '-'}</td>
              <td class="py-2 px-3">${
                subj.teacher 
                  ? (subj.teacher.name || `${subj.teacher.first_name || ''} ${subj.teacher.last_name || ''}`) 
                  : '-'
              }</td>
              <td class="py-2 px-3">${subj.uploadedAt ? new Date(subj.uploadedAt).toLocaleDateString() : '-'}</td>
              <td class="py-2 px-3">
                <button class="px-2 py-1 rounded bg-[#2647a6] text-white text-xs" onclick="viewSubject('${subjectId}')" title="View">
                  <i class="fa fa-eye"></i>
                </button>
                <button class="px-2 py-1 rounded bg-red-600 text-white text-xs" onclick="deleteSubjectFromClass('${cls._id}', '${subj.subject?._id || subj.subject}', this)" title="Delete">
                  <i class="fa fa-trash"></i>
                </button>
              </td>
            </tr>
          `);
        });
      }
    });
    
    if (rows.length === 0) {
      tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">No subjects uploaded.</td></tr>';
    } else {
      tbody.innerHTML = rows.join('');
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td class="py-2 px-3" colspan="5">Error loading uploaded subjects.</td></tr>';
    console.error('Error loading uploaded subjects:', err);
  }
}

// View subject
window.viewSubject = function(id) {
  alert("Subject details for " + id);
};

// Delete subject from class
window.deleteSubjectFromClass = async function(classId, subjectId, btn) {
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
  try {
    const res = await fetch(`https://goldlincschools.onrender.com/api/academics/classes/${classId}/subjects/${subjectId}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    
    if (res.ok) {
      loadUploadedSubjects();
    } else {
      const data = await res.json();
      alert("Failed to delete: " + (data.error || "Unknown error"));
    }
  } catch (err) {
    alert("Network error.");
    console.error('Error deleting subject from class:', err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-trash"></i>';
  }
};

// ============ PAGE INITIALIZATION ============

document.addEventListener('DOMContentLoaded', () => {
  // Load initial data
  fillTeacherCheckboxes();
  fillClassDropdown();
  fillTeacherDropdown2();
  fillTeacherDropdown();
  fillExamDropdown();
  loadSessions();
  loadTerms();
  loadClasses();
  loadExamSchedules();
  loadExamModes();
  loadCBTs();
  loadResults();
  loadUploadedSubjects();
});

// ============ PAGE INITIALIZATION & UI LOGIC ============

// Authentication helper - gets token from localStorage
function getAuthHeaders() {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

// Spinner overlay logic
document.addEventListener('DOMContentLoaded', () => {
  const spinner = document.getElementById('pageSpinnerOverlay');
  if (spinner) spinner.style.display = 'flex';
  setTimeout(() => {
    if (spinner) {
      spinner.style.opacity = '0';
      setTimeout(() => {
        spinner.style.display = 'none';
      }, 400);
    }
  }, 1200);
});

// Sidebar mobile toggle logic
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');

function handleResize() {
  if (window.innerWidth <= 768) {
    sidebarToggle.style.display = 'flex';
  } else {
    sidebarToggle.style.display = 'none';
    sidebar.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  }
}

function openSidebar() {
  sidebar.classList.add('active');
  sidebarOverlay.classList.add('active');
}

function closeSidebar() {
  sidebar.classList.remove('active');
  sidebarOverlay.classList.remove('active');
}

sidebarToggle.addEventListener('click', openSidebar);
sidebarOverlay.addEventListener('click', closeSidebar);

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    if (window.innerWidth <= 768) {
      closeSidebar();
    }
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

window.addEventListener('resize', handleResize);
handleResize();

// CBT Submenu toggle
const cbtToggle = document.getElementById('cbtToggle');
const cbtSubmenu = document.getElementById('cbtSubmenu');

cbtToggle.addEventListener('click', () => {
  cbtSubmenu.classList.toggle('active');
  cbtToggle.classList.toggle('expanded');
});

// Expand submenu by default
cbtSubmenu.classList.add('active');
cbtToggle.classList.add('expanded');

// CBT Navigation
document.querySelectorAll('.cbt-nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;
    
    // Update active state
    document.querySelectorAll('.cbt-nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    
    // Close sidebar on mobile
    if (window.innerWidth <= 768) {
      closeSidebar();
    }

    // Load section
    switch(section) {
      case 'exams': showExams(); break;
      case 'upload': showUploadExam(); break;
      case 'schedule': showScheduleExam(); break;
      case 'results': showResults(); break;
      case 'activity': showStudentActivity(); break;
    }
  });
});

// ============ UTILITY FUNCTIONS ============
function setActiveCBTTab(section) {
    document.querySelectorAll('.cbt-nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.section === section);
    });
}
// Copy to clipboard helper
function copyToClipboard(text, btn = null) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fa fa-check"></i> Copied!';
      setTimeout(() => {
        btn.innerHTML = originalHTML;
      }, 2000);
    }
  }).catch(() => {
    alert('Failed to copy to clipboard');
  });
}

// Date range filter helper
function isDateInRange(dateToCheck, startDate, endDate) {
  const checkDate = new Date(dateToCheck).setHours(0, 0, 0, 0);
  const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
  const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;
  
  if (start && checkDate < start) return false;
  if (end && checkDate > end) return false;
  return true;
}

// ============ DYNAMIC CONTENT LOADERS ============

// 1. Exams List - WITH EXAM CODES AND LOADER
function showExams() {
  document.getElementById('pageTitle').textContent = 'All Exams';
  document.getElementById('contentArea').innerHTML = `
    <div class="flex items-center justify-between mb-7">
      <h2 class="text-2xl font-bold text-[#22305a]">All Exams</h2>
      <button class="cbt-btn" onclick="showUploadExam()"><i class="fa fa-plus mr-1"></i> Upload Exam</button>
    </div>
    <div id="examsLoading" class="flex items-center justify-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-[#d4e0f1]">
      <div class="text-center">
        <i class="fa fa-spinner fa-spin fa-3x text-[#2647a6] mb-4"></i>
        <p class="text-[#2647a6] font-semibold text-lg">Loading exams...</p>
        <p class="text-gray-500 text-sm mt-2">Please wait while we fetch your exams</p>
      </div>
    </div>
    <div id="examsContainer" style="display: none;">
      <div id="examsTable" class="overflow-auto"></div>
    </div>
  `;
  loadExamsTable();
}

async function loadExamsTable() {
  const exams = await fetch('https://goldlincschools.onrender.com/api/exam', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);
  
  const loader = document.getElementById('examsLoading');
  const container = document.getElementById('examsContainer');
  const table = document.getElementById('examsTable');
  
  if (loader) loader.style.display = 'none';
  if (container) container.style.display = 'block';
  
  if (!Array.isArray(exams) || exams.length === 0) {
    table.innerHTML = `
      <div class="text-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-dashed border-[#cbd5e1]">
        <i class="fa fa-inbox fa-3x text-gray-400 mb-4"></i>
        <p class="text-gray-600 font-semibold text-lg">No exams found</p>
        <p class="text-gray-500 text-sm mt-2">Create your first exam to get started</p>
      </div>
    `;
    return;
  }

  let html = `<div class="overflow-x-auto rounded-lg border border-[#e2e8f0] shadow-sm">
    <table class="w-full text-left text-sm">
      <thead class="bg-gradient-to-r from-[#2647a6] to-[#1d35a0] text-white font-semibold">
        <tr>
          <th class="px-4 py-3">#</th>
          <th class="px-4 py-3">Title</th>
          <th class="px-4 py-3">Class</th>
          <th class="px-4 py-3">Subject</th>
          <th class="px-4 py-3">Exam Code</th>
          <th class="px-4 py-3">Scheduled</th>
          <th class="px-4 py-3">Status</th>
          <th class="px-4 py-3">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#e2e8f0]">`;

  for (let i = 0; i < exams.length; i++) {
    const ex = exams[i];
    const codeDisplay = ex.examCode 
      ? `<div class="flex items-center gap-2">
           <code class="bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold text-xs">
             ${ex.examCode}
           </code>
           <button class="text-blue-600 hover:text-blue-800 hover:bg-blue-50 p-1 rounded" title="Copy Code" onclick="copyToClipboard('${ex.examCode}', this)">
             <i class="fa fa-copy"></i>
           </button>
         </div>`
      : '<span class="text-gray-400 text-xs">No Code</span>';
    
    const statusColor = ex.status === 'Active' 
      ? 'bg-green-100 text-green-700' 
      : 'bg-amber-100 text-amber-700';
    
    html += `<tr class="hover:bg-[#f8f9fc] transition-colors">
      <td class="px-4 py-3 font-bold text-[#2647a6]">${i + 1}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${ex.title}</td>
      <td class="px-4 py-3 text-gray-700">${ex.className || '-'}</td>
      <td class="px-4 py-3 text-gray-700">${ex.subjectName || '-'}</td>
      <td class="px-4 py-3">${codeDisplay}</td>
      <td class="px-4 py-3 text-gray-600 text-xs">${ex.scheduledFor ? new Date(ex.scheduledFor).toLocaleDateString() : '-'}</td>
      <td class="px-4 py-3">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${statusColor}">
          ${ex.status || 'Draft'}
        </span>
      </td>
      <td class="px-4 py-3">
        <div class="flex items-center gap-2">
          <button title="View" class="text-blue-600 hover:bg-blue-50 p-2 rounded" onclick="viewExam('${ex._id}')"><i class="fa fa-eye"></i></button>
          <button title="Edit" class="text-green-600 hover:bg-green-50 p-2 rounded" onclick="editExam('${ex._id}')"><i class="fa fa-edit"></i></button>
          <button title="Delete" class="text-red-600 hover:bg-red-50 p-2 rounded" onclick="deleteExam('${ex._id}')"><i class="fa fa-trash"></i></button>
          <button title="Stop" class="text-amber-600 hover:bg-amber-50 p-2 rounded" onclick="stopExam('${ex._id}')"><i class="fa fa-stop"></i></button>
        </div>
      </td>
    </tr>`;
  }
  
  html += `</tbody></table></div>`;
  table.innerHTML = html;
}

window.showUploadExam = showUploadExam;
window.showScheduleExam = showScheduleExam;

// 2. Upload Exam
async function showUploadExam() {
    setActiveCBTTab('upload');
    document.getElementById('pageTitle').textContent = 'Upload New Exam';
  const classes = await fetch('https://goldlincschools.onrender.com/api/classes', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);
  const subjects = await fetch('https://goldlincschools.onrender.com/api/subjects', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Upload New Exam</h2>
    <form id="uploadExamForm" class="space-y-6 max-w-3xl">
      <div class="form-group">
        <label class="block text-gray-700 font-semibold mb-2">Title <span class="text-red-500">*</span></label>
        <input name="title" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="form-group">
          <label class="block text-gray-700 font-semibold mb-2">Class <span class="text-red-500">*</span></label>
          <select name="class" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">Select Class</option>
            ${classes.map(c => `<option value="${c._id}">${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="block text-gray-700 font-semibold mb-2">Subject <span class="text-red-500">*</span></label>
          <select name="subject" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
            <option value="">Select Subject</option>
            ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="block text-gray-700 font-semibold mb-2">Duration (minutes) <span class="text-red-500">*</span></label>
        <input name="duration" type="number" min="1" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
      </div>
      <div class="form-group">
        <label class="block text-gray-700 font-semibold mb-3">Questions <span class="text-red-500">*</span></label>
        <div id="questionsList" class="space-y-4"></div>
        <button type="button" class="cbt-btn mt-4" id="addQuestionBtn"><i class="fa fa-plus mr-2"></i> Add Question</button>
      </div>
      <button type="submit" class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-lg transition-all"><i class="fa fa-upload mr-2"></i>Upload Exam</button>
    </form>
    <div id="uploadExamMsg" class="mt-6"></div>
  `;

  let questions = [];

  function renderQuestions() {
    const qlist = document.getElementById('questionsList');
    if (!qlist) return;
    qlist.innerHTML = '';
    questions.forEach((q, qi) => {
      qlist.innerHTML += `
      <div class="border-2 border-gray-200 rounded-xl bg-white p-6 hover:shadow-md transition-shadow" data-question-idx="${qi}">
        <div class="flex items-center justify-between mb-4">
          <div class="font-bold text-lg text-[#2647a6]">Question ${qi + 1}</div>
          <button type="button" class="text-red-600 hover:bg-red-50 p-2 rounded-lg transition" onclick="removeQuestion(${qi})"><i class="fa fa-trash"></i></button>
        </div>
        <label class="block text-gray-700 font-semibold mb-2">Question Text:</label>
        <div id="qtext-quill-${qi}" class="quill-editor mb-4 bg-white"></div>
        <div class="flex items-end gap-4 mb-4">
          <div class="flex-1">
            <label class="block text-gray-700 font-semibold mb-2">Score:</label>
            <input type="number" min="1" value="${q.score || 1}" class="score-input w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Points for this question"/>
          </div>
        </div>
        <label class="block text-gray-700 font-semibold mb-3">Options:</label>
        <div id="optionsList-${qi}" class="space-y-3 mb-4"></div>
        <button type="button" class="cbt-btn mb-4" onclick="addOption(${qi})"><i class="fa fa-plus mr-1"></i> Add Option</button>
        <div class="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <label class="block text-gray-700 font-semibold mb-3">Select Correct Answer(s) <span class="text-red-500">*</span></label>
          <div id="correctAnswersCheckboxes-${qi}" class="grid grid-cols-2 gap-3"></div>
        </div>
      </div>
      `;
    });
    questions.forEach((q, qi) => {
      let container = document.getElementById(`qtext-quill-${qi}`);
      if(container && !container.__quill) {
        let quill = new Quill(container, getQuillConfig());
        if(q.text) quill.root.innerHTML = q.text;
        quill.on('text-change', () => { questions[qi].text = quill.root.innerHTML; });
        container.__quill = quill;
      }
      renderOptions(qi);
      renderCorrectAnswerCheckboxes(qi);
    });
  }

  window.removeQuestion = function(idx) {
    questions.splice(idx, 1);
    renderQuestions();
    attachUploadFormHandler();
  };

  document.getElementById('addQuestionBtn').onclick = function() {
    questions.push({ text: '', options: [], answer: [], score: 1 });
    renderQuestions();
    attachUploadFormHandler();
  };

  window.addOption = function(qi) {
    if (!questions[qi].options) questions[qi].options = [];
    questions[qi].options.push({ value: '' });
    renderOptions(qi);
    renderCorrectAnswerCheckboxes(qi);
  };

  window.removeOption = function(qi, oi) {
    questions[qi].options.splice(oi, 1);
    if (!Array.isArray(questions[qi].answer)) {
      questions[qi].answer = [];
    }
    questions[qi].answer = questions[qi].answer.filter(idx => idx !== oi);
    renderOptions(qi);
    renderCorrectAnswerCheckboxes(qi);
  }

  function renderOptions(qi) {
    const olist = document.getElementById(`optionsList-${qi}`);
    if (!olist) return;
    olist.innerHTML = '';
    (questions[qi].options||[]).forEach((opt, oi) => {
      olist.innerHTML += `
        <div class="border border-gray-200 rounded-lg p-4 bg-gray-50" data-option-idx="${oi}">
          <div class="flex items-center justify-between mb-3">
            <span class="font-semibold text-gray-700">Option ${String.fromCharCode(65+oi)}</span>
            <button type="button" class="text-red-600 hover:bg-red-50 p-2 rounded transition" onclick="removeOption(${qi},${oi})"><i class="fa fa-trash"></i></button>
          </div>
          <div id="q${qi}-opt-quill-${oi}" class="quill-editor bg-white"></div>
        </div>
      `;
    });
    (questions[qi].options||[]).forEach((opt, oi) => {
      let container = document.getElementById(`q${qi}-opt-quill-${oi}`);
      if(container && !container.__quill) {
        let quill = new Quill(container, getQuillConfig());
        if(opt.value) quill.root.innerHTML = opt.value;
        quill.on('text-change', () => { questions[qi].options[oi].value = quill.root.innerHTML; });
        container.__quill = quill;
      }
    });
    const scoreInput = document.querySelector(`[data-question-idx="${qi}"] .score-input`);
    if (scoreInput) {
      scoreInput.onchange = function() { questions[qi].score = Number(this.value) || 1; };
    }
  }

  function renderCorrectAnswerCheckboxes(qi) {
    const checkboxContainer = document.getElementById(`correctAnswersCheckboxes-${qi}`);
    if (!checkboxContainer) return;
    
    if (!Array.isArray(questions[qi].answer)) {
      questions[qi].answer = [];
    }

    checkboxContainer.innerHTML = '';
    (questions[qi].options||[]).forEach((opt, oi) => {
      const isChecked = questions[qi].answer.includes(oi);
      checkboxContainer.innerHTML += `
        <label class="flex items-center gap-3 p-2 rounded-lg hover:bg-blue-100 cursor-pointer transition">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCorrectAnswer(${qi}, ${oi})" class="w-4 h-4">
          <span class="text-gray-700 font-medium">Option ${String.fromCharCode(65+oi)}</span>
        </label>
      `;
    });
  }

  window.toggleCorrectAnswer = function(qi, oi) {
    if (!Array.isArray(questions[qi].answer)) {
      questions[qi].answer = [];
    }
    if (questions[qi].answer.includes(oi)) {
      questions[qi].answer = questions[qi].answer.filter(idx => idx !== oi);
    } else {
      questions[qi].answer.push(oi);
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
    }
  }

  Quill.prototype.getModule('toolbar').addHandler('image', function() {
    selectLocalImage(this.quill);
  });

  async function selectLocalImage(quill) {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('https://goldlincschools.onrender.com/api/upload/image', { 
        method: 'POST', 
        body: formData,
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken') || ''}` }
      });
      const data = await res.json();
      if(data.url){
        const range = quill.getSelection();
        quill.insertEmbed(range ? range.index : 0, 'image', data.url);
      } else {
        alert('Image upload failed.');
      }
    };
  }

  function patchAllQuills() {
    document.querySelectorAll('.quill-editor').forEach(ed => {
      if (ed.__quill) {
        ed.__quill.getModule('toolbar').addHandler('image', function() {
          selectLocalImage(ed.__quill)
        });
      }
    });
  }

  const observer = new MutationObserver(() => { patchAllQuills(); });
  observer.observe(document.body, { childList: true, subtree: true });

  attachUploadFormHandler();
  renderQuestions();

  function attachUploadFormHandler() {
    const uploadForm = document.getElementById('uploadExamForm');
    if (!uploadForm) return;

    uploadForm.onsubmit = async function(e) {
      e.preventDefault();

      const fd = new FormData(this);
      const title = fd.get('title');
      const classId = fd.get('class');
      const subjectId = fd.get('subject');
      const duration = Number(fd.get('duration'));

      if (!title || !classId || !subjectId || !duration) {
        document.getElementById('uploadExamMsg').innerHTML =
          `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">All exam fields are required.</div>`; 
        return;
      }

      if (!questions.length) {
        document.getElementById('uploadExamMsg').innerHTML =
          `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Add at least one question.</div>`; 
        return;
      }

      // Validate questions
      for (let [i, q] of questions.entries()) {
        if (!q.text || !(q.options && q.options.length >= 2)) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Question ${i+1} must have text and at least 2 options.</div>`; 
          return;
        }
        for (let [j, o] of (q.options || []).entries()) {
          if (!o.value) {
            document.getElementById('uploadExamMsg').innerHTML =
              `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Question ${i+1} Option ${String.fromCharCode(65+j)} cannot be empty.</div>`; 
            return;
          }
        }
        if (!Array.isArray(q.answer) || q.answer.length === 0) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Select at least one correct answer for Question ${i+1}.</div>`; 
          return;
        }
        for (let ans of q.answer) {
          if (typeof ans !== 'number' || ans < 0 || ans >= q.options.length) {
            document.getElementById('uploadExamMsg').innerHTML =
              `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Invalid correct answer selection for Question ${i+1}.</div>`; 
              return;
          }
        }
      }

      const payload = {
        title,
        class: classId,
        subject: subjectId,
        duration,
        questions: questions.map(q => ({
          text: q.text,
          options: q.options,
          answer: Number(q.answer[0]),
          score: q.score || 1
        }))
      };

      const submitBtn = uploadForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      document.getElementById('uploadExamMsg').innerHTML =
        `<div class="p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg flex items-center gap-2"><i class="fa fa-spinner fa-spin"></i> Uploading...</div>`;

      try {
        const res = await fetch('https://goldlincschools.onrender.com/api/exam', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.error) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">${data.error}</div>`;
        } else {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg font-semibold">✅ Exam uploaded successfully.</div>`;

          uploadForm.reset();
          questions = [];
          setTimeout(showExams, 1200);
        }
      } catch (err) {
        console.error(err);
        document.getElementById('uploadExamMsg').innerHTML =
          `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Network or server error.</div>`;
      } finally {
        submitBtn.disabled = false;
      }
    };
  }
}

// 3. Schedule Exam - WITH EXAM CODE GENERATION & CHECKBOX SELECTION
async function showScheduleExam() {
    setActiveCBTTab('schedule');
  document.getElementById('pageTitle').textContent = 'Schedule & Merge Exams';
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Schedule & Merge Exams</h2>
    <div class="flex items-center justify-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-[#d4e0f1]">
      <div class="text-center">
        <i class="fa fa-spinner fa-spin fa-3x text-[#2647a6] mb-4"></i>
        <p class="text-[#2647a6] font-semibold text-lg">Loading exams...</p>
      </div>
    </div>
  `;

  const exams = await fetch('https://goldlincschools.onrender.com/api/exam', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);

  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Schedule & Merge Exams</h2>
    <form id="mergeScheduleExamForm" class="space-y-6 max-w-4xl">
      <div class="form-group">
        <label class="block text-gray-700 font-semibold mb-3">Select Exams to Merge <span class="text-red-500">*</span></label>
        <div id="examsCheckboxContainer" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-6 bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg border-2 border-gray-200 max-h-72 overflow-y-auto">
          <!-- Checkboxes will be populated here -->
        </div>
        <small class="block mt-3 text-gray-600"><i class="fa fa-info-circle mr-1"></i>Select two or more exams to merge their questions.</small>
      </div>
      <div id="mergedQuestionsPreview" class="mt-6"></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="form-group">
          <label class="block text-gray-700 font-semibold mb-2">New Exam Title <span class="text-red-500">*</span></label>
          <input type="text" name="mergedTitle" id="mergedTitle" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Enter merged exam title"/>
        </div>
        <div class="form-group">
          <label class="block text-gray-700 font-semibold mb-2">Duration (minutes) <span class="text-red-500">*</span></label>
          <input type="number" name="duration" id="mergedDuration" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" placeholder="Total duration"/>
        </div>
      </div>
      <div class="form-group">
        <label class="block text-gray-700 font-semibold mb-2">Schedule Date & Time <span class="text-red-500">*</span></label>
        <input name="scheduledFor" type="datetime-local" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"/>
      </div>
      <div class="form-group p-6 bg-blue-50 border-2 border-blue-200 rounded-lg">
        <label class="block text-gray-800 font-semibold mb-3">Exam Code <span class="text-gray-500 font-normal">(Auto-generated)</span></label>
        <div class="flex items-center gap-3">
          <code id="generatedExamCode" class="flex-1 bg-white px-4 py-2 rounded-lg font-bold text-blue-700 border border-blue-300">
            -
          </code>
          <button type="button" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition" onclick="copyToClipboard(document.getElementById('generatedExamCode').textContent)">
            <i class="fa fa-copy mr-2"></i> Copy
          </button>
        </div>
        <small class="block mt-3 text-gray-600"><i class="fa fa-lightbulb mr-1"></i>This code will be generated when you schedule the exam.</small>
      </div>
      <button type="submit" id="schedule-submit-btn" class="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-lg transition-all flex items-center justify-center">
        <i class="fa fa-calendar mr-2"></i> <span>Schedule Merged Exam</span>
        <span id="schedule-submit-spinner" style="display:none;" class="ml-2"><i class="fa fa-spinner fa-spin"></i></span>
      </button>
    </form>
    <div id="mergeExamMsg" class="mt-6"></div>
  `;

  // Populate checkboxes
  const checkboxContainer = document.getElementById('examsCheckboxContainer');
  if (Array.isArray(exams) && exams.length > 0) {
    checkboxContainer.innerHTML = exams.map(exam => `
      <label class="flex items-start gap-3 p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-sm cursor-pointer transition">
        <input type="checkbox" name="examIds" value="${exam._id}" class="exam-checkbox w-5 h-5 mt-1" data-title="${exam.title}">
        <div class="flex-1">
          <div class="font-semibold text-gray-900">${exam.title}</div>
          <div class="text-sm text-gray-600">${exam.className} - ${exam.subjectName || 'N/A'}</div>
        </div>
      </label>
    `).join('');
  } else {
    checkboxContainer.innerHTML = `<div class="col-span-full text-center py-6 text-gray-500"><i class="fa fa-inbox mb-2 text-2xl"></i><p>No exams available to merge.</p></div>`;
  }

  let mergedQuestions = [];

  // Track checkbox changes and update preview
  document.querySelectorAll('.exam-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateMergedPreview);
  });

  async function updateMergedPreview() {
    const selected = Array.from(document.querySelectorAll('.exam-checkbox:checked')).map(cb => cb.value);
    const previewDiv = document.getElementById('mergedQuestionsPreview');
    
    if (selected.length < 1) {
      previewDiv.innerHTML = "<div class='text-center py-8 text-gray-500'><i class='fa fa-search text-2xl mb-2'></i><p>Select two or more exams to see merged preview.</p></div>";
      mergedQuestions = [];
      return;
    }

    previewDiv.innerHTML = `<div class="flex items-center text-blue-600 font-semibold py-6"><i class="fa fa-spinner fa-spin mr-2"></i> Merging questions...</div>`;

    const questionSets = await Promise.all(selected.map(id =>
      fetch(`https://goldlincschools.onrender.com/api/exam/${id}`, {
        headers: getAuthHeaders()
      }).then(r => r.json())
    ));

    mergedQuestions = [];
    questionSets.forEach(exam => {
      (exam.questions || []).forEach(q => {
        mergedQuestions.push({ ...q, sourceExamTitle: exam.title });
      });
    });

    previewDiv.innerHTML = `
      <div class="mt-6">
        <div class="font-bold text-lg text-[#22305a] mb-4"><i class="fa fa-list mr-2"></i>Merged Questions Preview (${mergedQuestions.length} questions)</div>
        ${mergedQuestions.map((q, idx) => `
          <div class="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 flex items-start gap-4">
            <div class="text-gray-600 font-bold min-w-8">${idx + 1}.</div>
            <div class="flex-1">
              <div class="font-semibold text-[#22305a] mb-1">Source: <span class="text-blue-600">${q.sourceExamTitle}</span></div>
              <div class="mb-3 text-gray-800">${q.text}</div>
              <ol class="list-decimal ml-5 text-sm space-y-1">${(q.options || []).map((o, oi) => `<li class="text-gray-700">${o.value || o}</li>`).join('')}</ol>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.getElementById('mergeScheduleExamForm').onsubmit = async function (e) {
    e.preventDefault();
    const selected = Array.from(document.querySelectorAll('.exam-checkbox:checked')).map(cb => cb.value);
    
    if (selected.length < 1) {
      document.getElementById('mergeExamMsg').innerHTML = `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Please select at least 2 exams to merge.</div>`;
      return;
    }

    const mergedTitle = document.getElementById('mergedTitle').value;
    const duration = Number(document.getElementById('mergedDuration').value);
    const scheduledFor = document.querySelector('[name="scheduledFor"]').value;

    if (!mergedTitle || !duration || !scheduledFor) {
      document.getElementById('mergeExamMsg').innerHTML = `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Please fill in all required fields.</div>`;
      return;
    }

    const firstExam = await fetch(`https://goldlincschools.onrender.com/api/exam/${selected[0]}`, {
      headers: getAuthHeaders()
    }).then(r => r.json());
    const classId = firstExam.class || firstExam.classId;
    const subjectId = firstExam.subject || firstExam.subjectId;

    const submitBtn = document.getElementById('schedule-submit-btn');
    const spinner = document.getElementById('schedule-submit-spinner');
    submitBtn.disabled = true;
    spinner.style.display = '';

    const payload = {
      examIds: selected,
      title: mergedTitle,
      class: classId,
      subject: subjectId,
      duration,
      scheduledFor
    };
    
    try {
      const res = await fetch('https://goldlincschools.onrender.com/api/exam/merge', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      submitBtn.disabled = false;
      spinner.style.display = 'none';

      if (data.success) {
        if (data.examCode) {
          document.getElementById('generatedExamCode').textContent = data.examCode;
          document.getElementById('mergeExamMsg').innerHTML = `
            <div class="p-4 bg-green-50 border border-green-300 text-green-800 rounded-lg">
              <div class="font-bold mb-2">✅ Merged exam scheduled successfully!</div>
              <div><strong>Exam Code:</strong> <code class="bg-white px-2 py-1 rounded text-green-700 font-bold">${data.examCode}</code></div>
            </div>
          `;
        } else {
          document.getElementById('mergeExamMsg').innerHTML = `<div class="p-4 bg-green-50 border border-green-300 text-green-800 rounded-lg font-semibold">✅ Merged exam scheduled!</div>`;
        }
        setTimeout(showExams, 1500);
      } else {
        document.getElementById('mergeExamMsg').innerHTML = `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">${data.error || 'Failed to merge exams.'}</div>`;
      }
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      spinner.style.display = 'none';
      document.getElementById('mergeExamMsg').innerHTML = `<div class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">Network error.</div>`;
    }
  };
}

// 4. Results with filtering, search, date range, and PDF export
async function showResults() {
  document.getElementById('pageTitle').textContent = 'Student CBT Results';
  document.getElementById('contentArea').innerHTML = `
    <div class="flex items-center justify-between mb-7">
      <h2 class="text-2xl font-bold text-[#22305a]">Student Results</h2>
    </div>
    <div id="resultsLoading" class="flex items-center justify-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-[#d4e0f1]">
      <div class="text-center">
        <i class="fa fa-spinner fa-spin fa-3x text-[#2647a6] mb-4"></i>
        <p class="text-[#2647a6] font-semibold text-lg">Loading results...</p>
        <p class="text-gray-500 text-sm mt-2">Please wait while we fetch your results</p>
      </div>
    </div>
    <div id="resultsContainer" style="display: none;">
      <div class="filters-section mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <input type="text" id="searchInput" placeholder="🔍 Search by student..." class="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
        <select id="classFilter" class="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Classes</option>
        </select>
        <select id="subjectFilter" class="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Subjects</option>
        </select>
        <input type="date" id="dateFromFilter" class="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
        <input type="date" id="dateToFilter" class="px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
      </div>
      <div class="flex gap-3 mb-6 flex-wrap">
        <button class="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition" onclick="resetResultsFilters()"><i class="fa fa-redo mr-2"></i> Reset Filters</button>
        <button class="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition" onclick="exportResultsToPDF()"><i class="fa fa-file-pdf mr-2"></i> Export PDF</button>
      </div>
      <div id="resultsInfo" class="mb-4 text-sm font-semibold text-gray-700"></div>
      <div id="resultsTable" class="overflow-auto"></div>
      <div id="pdfContent" style="display: none;"></div>
    </div>
  `;

  const results = await fetch('https://goldlincschools.onrender.com/api/result', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);
  
  const loader = document.getElementById('resultsLoading');
  const container = document.getElementById('resultsContainer');
  if (loader) loader.style.display = 'none';
  if (container) container.style.display = 'block';

  if (!Array.isArray(results) || results.length === 0) {
    document.getElementById('resultsTable').innerHTML = `
      <div class="text-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-dashed border-[#cbd5e1]">
        <i class="fa fa-inbox fa-3x text-gray-400 mb-4"></i>
        <p class="text-gray-600 font-semibold text-lg">No results found</p>
      </div>
    `;
    return;
  }

  const classes = [...new Set(results.map(r => r.className).filter(Boolean))];
  const subjects = [...new Set(results.map(r => r.subjectName).filter(Boolean))];
  
  const classFilter = document.getElementById('classFilter');
  const subjectFilter = document.getElementById('subjectFilter');
  
  classes.forEach(cls => {
    const option = document.createElement('option');
    option.value = cls;
    option.textContent = cls;
    classFilter.appendChild(option);
  });
  
  subjects.forEach(subj => {
    const option = document.createElement('option');
    option.value = subj;
    option.textContent = subj;
    subjectFilter.appendChild(option);
  });

  let filteredResults = [...results];

  function generatePDFContent(dataToRender) {
    const classFilter = document.getElementById('classFilter').value || 'All Classes';
    const subjectFilter = document.getElementById('subjectFilter').value || 'All Subjects';
    const dateFrom = document.getElementById('dateFromFilter').value || 'All';
    const dateTo = document.getElementById('dateToFilter').value || 'All';
    const currentDate = new Date().toLocaleString();

    if (dataToRender.length === 0) {
      return `
        <div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">
          <h2>No Results Available</h2>
          <p>The current filter combination returned no results.</p>
        </div>
      `;
    }

    const avgScore = (dataToRender.reduce((sum, r) => sum + (r.score || 0), 0) / dataToRender.length).toFixed(2);
    const maxScore = Math.max(...dataToRender.map(r => r.score || 0));
    const minScore = Math.min(...dataToRender.map(r => r.score || 0));
    const totalScore = dataToRender.length > 0 ? dataToRender[0].total : 0;

    let pdfHtml = `
      <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e40af; padding-bottom: 15px;">
          <h1 style="color: #0f172a; margin: 0; font-size: 24px; font-weight: bold;">ExamGuard International School</h1>
          <p style="color: #6b7280; margin: 5px 0; font-size: 14px;">Student Results Report</p>
          <p style="color: #6b7280; margin: 5px 0; font-size: 12px;">Generated on: ${currentDate}</p>
        </div>

        <!-- Filter Summary -->
        <div style="margin-bottom: 20px; background: #f3f4f6; padding: 12px; border-radius: 6px;">
          <p style="margin: 5px 0; font-size: 13px;"><strong>Class Filter:</strong> ${classFilter}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Subject Filter:</strong> ${subjectFilter}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Date Range:</strong> ${dateFrom} to ${dateTo}</p>
          <p style="margin: 5px 0; font-size: 13px;"><strong>Total Results:</strong> ${dataToRender.length}</p>
        </div>

        <!-- Results Table -->
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px;">
          <thead>
            <tr style="background-color: #f3f8ff; border-bottom: 2px solid #1e40af;">
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">#</th>
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Student Name</th>
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Class</th>
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Subject</th>
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Exam</th>
              <th style="padding: 10px; text-align: center; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Score</th>
              <th style="padding: 10px; text-align: left; color: #0f172a; font-weight: bold; border: 1px solid #ddeaff;">Date</th>
            </tr>
          </thead>
          <tbody>
            ${dataToRender.map((r, idx) => `
              <tr style="border-bottom: 1px solid #eef3ff;">
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #1e40af; font-weight: bold;">${idx + 1}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #374151;">${r.studentName || 'N/A'}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #374151;">${r.className || 'N/A'}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #374151;">${r.subjectName || 'N/A'}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #374151;">${r.examTitle || 'N/A'}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; text-align: center; color: #16a34a; font-weight: bold;">${r.score || 0}/${totalScore}</td>
                <td style="padding: 8px; border: 1px solid #eef3ff; color: #374151; font-size: 11px;">${r.finishedAt ? new Date(r.finishedAt).toLocaleDateString() : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Summary Stats -->
        <div style="margin-top: 30px; padding: 15px; background: #f0f4ff; border-radius: 6px; border-left: 4px solid #1e40af;">
          <p style="margin: 8px 0; color: #0f172a; font-size: 13px;">
            <strong>Total Results:</strong> ${dataToRender.length}
          </p>
          <p style="margin: 8px 0; color: #0f172a; font-size: 13px;">
            <strong>Average Score:</strong> ${avgScore} / ${totalScore}
          </p>
          <p style="margin: 8px 0; color: #0f172a; font-size: 13px;">
            <strong>Highest Score:</strong> ${maxScore} / ${totalScore}
          </p>
          <p style="margin: 8px 0; color: #0f172a; font-size: 13px;">
            <strong>Lowest Score:</strong> ${minScore} / ${totalScore}
          </p>
        </div>

        <!-- Footer -->
        <div style="margin-top: 40px; padding-top: 15px; border-top: 1px solid #ddeaff; text-align: center; color: #9ca3af; font-size: 11px;">
          <p>This is an automatically generated report from ExamGuard CBT System</p>
        </div>
      </div>
    `;
    return pdfHtml;
  }

  function renderResultsTable(dataToRender) {
    const table = document.getElementById('resultsTable');
    const info = document.getElementById('resultsInfo');
    
    if (dataToRender.length === 0) {
      table.innerHTML = `
        <div class="text-center py-12 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-lg border border-dashed border-[#cbd5e1]">
          <i class="fa fa-search text-2xl text-gray-400 mb-2"></i>
          <p class="text-gray-600">No results match your filters.</p>
        </div>
      `;
      info.innerHTML = `<span class="text-gray-600">Showing 0 results</span>`;
      document.getElementById('pdfContent').innerHTML = generatePDFContent([]);
      return;
    }

    info.innerHTML = `<span class="text-gray-700"><i class="fa fa-check-circle text-green-600 mr-2"></i> Showing ${dataToRender.length} result(s)</span>`;

    let html = `<div class="overflow-x-auto rounded-lg border border-[#e2e8f0] shadow-sm">
      <table class="w-full text-left text-sm">
        <thead class="bg-gradient-to-r from-[#2647a6] to-[#1d35a0] text-white font-semibold">
          <tr>
            <th class="px-4 py-3">#</th>
            <th class="px-4 py-3">Student</th>
            <th class="px-4 py-3">Class</th>
            <th class="px-4 py-3">Subject</th>
            <th class="px-4 py-3">Exam Title</th>
            <th class="px-4 py-3">Score</th>
            <th class="px-4 py-3">Started</th>
            <th class="px-4 py-3">Finished</th>
            <th class="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-[#e2e8f0]">`;
    
    dataToRender.forEach((r, idx) => {
      html += `<tr class="hover:bg-[#f8f9fc] transition-colors">
        <td class="px-4 py-3 font-bold text-[#2647a6]">${idx + 1}</td>
        <td class="px-4 py-3 font-medium text-gray-900">${r.studentName || 'N/A'}</td>
        <td class="px-4 py-3 text-gray-700">${r.className || 'N/A'}</td>
        <td class="px-4 py-3 text-gray-700">${r.subjectName || 'N/A'}</td>
        <td class="px-4 py-3 text-gray-700">${r.examTitle || 'N/A'}</td>
        <td class="px-4 py-3 font-bold text-green-600">${r.score || 0} / ${r.total || 0}</td>
        <td class="px-4 py-3 text-xs text-gray-600">${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
        <td class="px-4 py-3 text-xs text-gray-600">${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</td>
        <td class="px-4 py-3 flex gap-2">
          <button class="text-blue-600 hover:bg-blue-50 p-2 rounded transition" title="View Details" onclick="viewResult('${r._id}')"><i class="fa fa-eye"></i></button>
          <button class="text-red-600 hover:bg-red-50 p-2 rounded transition" title="Delete" onclick="deleteResult('${r._id}')"><i class="fa fa-trash"></i></button>
        </td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
    table.innerHTML = html;

    document.getElementById('pdfContent').innerHTML = generatePDFContent(dataToRender);
  }

  function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const classValue = document.getElementById('classFilter').value;
    const subjectValue = document.getElementById('subjectFilter').value;
    const dateFrom = document.getElementById('dateFromFilter').value;
    const dateTo = document.getElementById('dateToFilter').value;

    filteredResults = results.filter(r => {
      const matchesSearch = !searchTerm || 
        r.studentName.toLowerCase().includes(searchTerm) || 
        r.examTitle.toLowerCase().includes(searchTerm);
      const matchesClass = !classValue || r.className === classValue;
      const matchesSubject = !subjectValue || r.subjectName === subjectValue;
      const matchesDate = isDateInRange(r.finishedAt || r.startedAt, dateFrom, dateTo);
      
      return matchesSearch && matchesClass && matchesSubject && matchesDate;
    });

    renderResultsTable(filteredResults);
  }

  window.resetResultsFilters = function() {
    document.getElementById('searchInput').value = '';
    document.getElementById('classFilter').value = '';
    document.getElementById('subjectFilter').value = '';
    document.getElementById('dateFromFilter').value = '';
    document.getElementById('dateToFilter').value = '';
    filteredResults = [...results];
    renderResultsTable(filteredResults);
  }

  window.exportResultsToPDF = async function() {
    const pdfContent = document.getElementById('pdfContent').innerHTML;
    
    if (!pdfContent || pdfContent.trim() === '') {
      alert('No results to export. Please check your filters.');
      return;
    }

    try {
      const exportBtn = event.target.closest('button');
      const originalHTML = exportBtn.innerHTML;
      exportBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-2"></i> Generating...';
      exportBtn.disabled = true;

      const element = document.createElement('div');
      element.innerHTML = pdfContent;
      element.style.padding = '20px';
      element.style.backgroundColor = '#ffffff';

      const opt = {
        margin: [10, 10, 10, 10],
        filename: `exam-results-${new Date().toISOString().split('T')[0]}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        },
        jsPDF: { 
          orientation: 'portrait', 
          unit: 'mm', 
          format: 'a4',
          compress: true
        }
      };

      await html2pdf().set(opt).from(element).save();

      exportBtn.innerHTML = originalHTML;
      exportBtn.disabled = false;
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF: ' + err.message);
      const exportBtn = event.target.closest('button');
      exportBtn.innerHTML = '<i class="fa fa-file-pdf mr-2"></i> Export PDF';
      exportBtn.disabled = false;
    }
  }

  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('classFilter').addEventListener('change', applyFilters);
  document.getElementById('subjectFilter').addEventListener('change', applyFilters);
  document.getElementById('dateFromFilter').addEventListener('change', applyFilters);
  document.getElementById('dateToFilter').addEventListener('change', applyFilters);

  renderResultsTable(filteredResults);
}

// 5. Student Activity
async function showStudentActivity() {
  document.getElementById('pageTitle').textContent = 'Student Activity';
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Student Activity</h2>
    <div class="flex items-center justify-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-[#d4e0f1]">
      <div class="text-center">
        <i class="fa fa-spinner fa-spin fa-3x text-[#2647a6] mb-4"></i>
        <p class="text-[#2647a6] font-semibold text-lg">Loading activity...</p>
      </div>
    </div>
  `;
  const acts = await fetch('https://goldlincschools.onrender.com/api/activity', {
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => []);
  
  if (!Array.isArray(acts) || acts.length === 0) {
    document.getElementById('contentArea').innerHTML = `
      <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Student Activity</h2>
      <div class="text-center py-16 bg-gradient-to-br from-[#f8f9fb] to-[#eef2f8] rounded-xl border border-dashed border-[#cbd5e1]">
        <i class="fa fa-inbox fa-3x text-gray-400 mb-4"></i>
        <p class="text-gray-600 font-semibold text-lg">No activity found</p>
      </div>
    `;
    return;
  }

  let html = `<div class="overflow-x-auto rounded-lg border border-[#e2e8f0] shadow-sm">
    <table class="w-full text-left text-sm">
      <thead class="bg-gradient-to-r from-[#2647a6] to-[#1d35a0] text-white font-semibold">
        <tr>
          <th class="px-4 py-3">#</th>
          <th class="px-4 py-3">Student</th>
          <th class="px-4 py-3">Class</th>
          <th class="px-4 py-3">Exam</th>
          <th class="px-4 py-3">Started</th>
          <th class="px-4 py-3">Finished</th>
          <th class="px-4 py-3">Status</th>
          <th class="px-4 py-3">Actions</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-[#e2e8f0]">`;
  
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    html += `<tr class="hover:bg-[#f8f9fc] transition-colors">
      <td class="px-4 py-3 font-bold text-[#2647a6]">${i + 1}</td>
      <td class="px-4 py-3 font-medium text-gray-900">${a.studentName}</td>
      <td class="px-4 py-3 text-gray-700">${a.className}</td>
      <td class="px-4 py-3 text-gray-700">${a.examTitle}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}</td>
      <td class="px-4 py-3 text-xs text-gray-600">${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '-'}</td>
      <td class="px-4 py-3">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${a.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
          ${a.status || 'Pending'}
        </span>
      </td>
      <td class="px-4 py-3">
        <button class="text-blue-600 hover:bg-blue-50 p-2 rounded transition" title="View" onclick="viewActivity('${a._id}')"><i class="fa fa-eye"></i></button>
      </td>
    </tr>`;
  }
  html += `</tbody></table></div>`;
  
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-6 text-[#22305a]">Student Activity</h2>
    ${html}
  `;
}

// ============ ACTION HANDLERS ============

window.viewExam = async function(id) {
  const ex = await fetch(`https://goldlincschools.onrender.com/api/exam/${id}`, {
    headers: getAuthHeaders()
  }).then(r=>r.json());
  if(ex.error){alert(ex.error); return;}
  
  const codeDisplay = ex.examCode 
    ? `<div class="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
         <b class="text-gray-800">Exam Code:</b> 
         <code class="ml-3 bg-white px-3 py-1 rounded text-blue-700 font-bold">
           ${ex.examCode}
         </code>
         <button class="ml-3 px-3 py-1 bg-blue-600 text-white rounded text-sm font-semibold" onclick="copyToClipboard('${ex.examCode}', this)">
           <i class="fa fa-copy mr-1"></i> Copy
         </button>
       </div>`
    : '<div class="mb-4 text-gray-500">No code generated yet.</div>';
  
  document.getElementById('contentArea').innerHTML = `
    <div class="mb-6">
      <button class="text-blue-600 hover:text-blue-800 font-semibold mb-4" onclick="showExams()"><i class="fa fa-arrow-left mr-2"></i>Back to Exams</button>
      <h2 class="text-2xl font-bold text-[#22305a]">Exam Detail</h2>
    </div>
    <div class="max-w-3xl bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><b class="text-gray-700">Title:</b> <span class="text-gray-900">${ex.title}</span></div>
        <div><b class="text-gray-700">Class:</b> <span class="text-gray-900">${ex.className}</span></div>
        <div><b class="text-gray-700">Subject:</b> <span class="text-gray-900">${ex.subjectName}</span></div>
        <div><b class="text-gray-700">Duration:</b> <span class="text-gray-900">${ex.duration} mins</span></div>
        <div><b class="text-gray-700">Status:</b> <span class="px-3 py-1 rounded-full text-xs font-semibold ${ex.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">${ex.status || 'Draft'}</span></div>
        <div><b class="text-gray-700">Scheduled:</b> <span class="text-gray-900">${ex.scheduledFor ? new Date(ex.scheduledFor).toLocaleString() : '-'}</span></div>
      </div>
      ${codeDisplay}
    </div>
    <div class="mt-8">
      <h3 class="text-xl font-bold text-[#22305a] mb-4">Questions (${Array.isArray(ex.questions) ? ex.questions.length : 0})</h3>
      ${Array.isArray(ex.questions) ? ex.questions.map((q,i) => `
        <div class="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
          <div class="font-bold text-lg text-[#22305a] mb-2">Q${i+1} <span class="text-sm font-normal text-gray-600">(${q.score||1} mark)</span></div>
          <div class="mb-3 p-3 bg-white rounded border border-gray-200">${q.text}</div>
          <div class="ml-4">
            <div class="font-semibold text-gray-700 mb-2">Options:</div>
            <ol class="list-decimal ml-5 space-y-1">
            ${(q.options||[]).map((o,oi)=>`<li class="${(Array.isArray(q.answer) ? q.answer.includes(oi) : oi==q.answer)?'text-green-700 font-bold bg-green-50 px-2 py-1 rounded':''}">${o.value || o}</li>`).join('')}
            </ol>
          </div>
          <div class="ml-4 mt-3 text-sm"><span class="font-semibold text-gray-700">Correct:</span> <b class="text-green-600">${Array.isArray(q.answer) ? q.answer.map(idx => String.fromCharCode(65 + idx)).join(', ') : String.fromCharCode(65 + (q.answer || 0))}</b></div>
        </div>
      `).join('') : ''}
    </div>
  `;
}

window.editExam = async function(id) {
  const ex = await fetch(`https://goldlincschools.onrender.com/api/exam/${id}`, {
    headers: getAuthHeaders()
  }).then(r=>r.json());
  if(ex.error){alert(ex.error); return;}
  alert('Edit Exam is not implemented for advanced question editor. Please delete and re-upload for now.');
  showExams();
}

window.deleteExam = async function(id) {
  if (!confirm('Delete this exam?')) return;
  const res = await fetch(`https://goldlincschools.onrender.com/api/exam/${id}`, {
    method:'DELETE',
    headers: getAuthHeaders()
  }).then(r=>r.json());
  if(res.error){alert(res.error);} else {showExams();}
}

window.stopExam = async function(id) {
  if (!confirm('Stop this exam for all students?')) return;
  await fetch(`https://goldlincschools.onrender.com/api/exam/${id}/stop`, {
    method:'POST',
    headers: getAuthHeaders()
  });
  showExams();
}

window.viewResult = async function(id) {
  const r = await fetch(`https://goldlincschools.onrender.com/api/result/${id}`, {
    headers: getAuthHeaders()
  }).then(r=>r.json());
  if(r.error){alert(r.error); return;}
  document.getElementById('contentArea').innerHTML = `
    <div class="mb-6">
      <button class="text-blue-600 hover:text-blue-800 font-semibold mb-4" onclick="showResults()"><i class="fa fa-arrow-left mr-2"></i>Back to Results</button>
      <h2 class="text-2xl font-bold text-[#22305a]">Result Detail</h2>
    </div>
    <div class="max-w-3xl bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><b class="text-gray-700">Student:</b> <span class="text-gray-900">${r.studentName}</span></div>
        <div><b class="text-gray-700">Class:</b> <span class="text-gray-900">${r.className}</span></div>
        <div><b class="text-gray-700">Subject:</b> <span class="text-gray-900">${r.subjectName}</span></div>
        <div><b class="text-gray-700">Exam Title:</b> <span class="text-gray-900">${r.examTitle}</span></div>
        <div><b class="text-gray-700">Started:</b> <span class="text-gray-900 text-sm">${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</span></div>
        <div><b class="text-gray-700">Finished:</b> <span class="text-gray-900 text-sm">${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</span></div>
      </div>
      <div class="pt-4 border-t border-gray-200">
        <div class="text-lg"><b class="text-gray-700">Score:</b> <span class="text-green-600 font-bold text-2xl">${r.score} / ${r.total}</span></div>
      </div>
    </div>
    <div class="mt-8">
      <h3 class="text-xl font-bold text-[#22305a] mb-4">Student Answers</h3>
      <pre class="bg-gray-100 rounded-lg p-6 overflow-auto text-sm text-gray-800 border border-gray-300">${JSON.stringify(r.answers, null, 2)}</pre>
    </div>
  `;
}

window.deleteResult = async function(id) {
  if (!confirm('Delete this result?')) return;
  const res = await fetch(`https://goldlincschools.onrender.com/api/result/${id}`, { 
    method: 'DELETE',
    headers: getAuthHeaders()
  }).then(r => r.json()).catch(() => ({}));
  if (res.error) {
    alert(res.error);
  } else {
    showResults();
  }
}

window.viewActivity = async function(id) {
  const a = await fetch(`https://goldlincschools.onrender.com/api/activity/${id}`, {
    headers: getAuthHeaders()
  }).then(r=>r.json());
  if(a.error){alert(a.error); return;}
  document.getElementById('contentArea').innerHTML = `
    <div class="mb-6">
      <button class="text-blue-600 hover:text-blue-800 font-semibold mb-4" onclick="showStudentActivity()"><i class="fa fa-arrow-left mr-2"></i>Back to Activity</button>
      <h2 class="text-2xl font-bold text-[#22305a]">Student Activity Detail</h2>
    </div>
    <div class="max-w-3xl bg-white rounded-lg border border-gray-200 p-6 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><b class="text-gray-700">Student:</b> <span class="text-gray-900">${a.studentName}</span></div>
        <div><b class="text-gray-700">Class:</b> <span class="text-gray-900">${a.className}</span></div>
        <div><b class="text-gray-700">Exam:</b> <span class="text-gray-900">${a.examTitle}</span></div>
        <div><b class="text-gray-700">Status:</b> <span class="px-3 py-1 rounded-full text-xs font-semibold ${a.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">${a.status || 'Pending'}</span></div>
        <div><b class="text-gray-700">Started:</b> <span class="text-gray-900 text-sm">${a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}</span></div>
        <div><b class="text-gray-700">Finished:</b> <span class="text-gray-900 text-sm">${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '-'}</span></div>
      </div>
    </div>
    <div class="mt-8">
      <h3 class="text-xl font-bold text-[#22305a] mb-4">Activity Log</h3>
      <pre class="bg-gray-100 rounded-lg p-6 overflow-auto text-sm text-gray-800 border border-gray-300">${JSON.stringify(a.activityLog, null, 2)}</pre>
    </div>
  `;
}

// ============ INITIALIZE ============
showExams();

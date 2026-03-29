// ============ PAGE INITIALIZATION & UI LOGIC ============

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

// ============ DYNAMIC CONTENT LOADERS ============

// 1. Exams List - WITH EXAM CODES
function showExams() {
  document.getElementById('pageTitle').textContent = 'All Exams';
  document.getElementById('contentArea').innerHTML = `
    <div class="flex items-center justify-between mb-7">
      <h2 class="text-2xl font-bold text-[#22305a]">All Exams</h2>
      <button class="cbt-btn" onclick="showUploadExam()"><i class="fa fa-plus mr-1"></i> Upload Exam</button>
    </div>
    <div id="examsTable" class="overflow-auto"></div>
  `;
  loadExamsTable();
}

async function loadExamsTable() {
  const exams = await fetch('https://examguard-8rxe.onrender.com/api/exam').then(r => r.json()).catch(() => []);
  const table = document.getElementById('examsTable');
  if (!Array.isArray(exams) || exams.length === 0) {
    table.innerHTML = `<div class="text-center text-gray-500 mt-12">No exams found.</div>`; 
    return;
  }
  let html = `<table class="min-w-full border text-left">
    <thead class="bg-[#f6f8fa] text-[#2647a6]">
      <tr>
        <th class="p-3">#</th>
        <th class="p-3">Title</th>
        <th class="p-3">Class</th>
        <th class="p-3">Subject</th>
        <th class="p-3">Exam Code</th>
        <th class="p-3">Scheduled</th>
        <th class="p-3">Status</th>
        <th class="p-3">Actions</th>
      </tr>
    </thead>
    <tbody>`;
  for (let i = 0; i < exams.length; i++) {
    const ex = exams[i];
    // ✅ Display exam code with copy button
    const codeDisplay = ex.examCode 
      ? `<div class="flex items-center gap-2">
           <code style="background:#e3f2fd; padding:4px 8px; border-radius:4px; font-weight:bold; color:#2647a6;">
             ${ex.examCode}
           </code>
           <button class="text-blue-500 hover:text-blue-700" title="Copy Code" onclick="copyToClipboard('${ex.examCode}', this)">
             <i class="fa fa-copy"></i>
           </button>
         </div>`
      : '<span class="text-gray-400">No Code</span>';
    
    html += `<tr class="border-b hover:bg-[#e9f0fe]">
      <td class="p-3 font-bold text-[#2647a6]">${i + 1}</td>
      <td class="p-3 font-semibold">${ex.title}</td>
      <td class="p-3">${ex.className || ''}</td>
      <td class="p-3">${ex.subjectName || ''}</td>
      <td class="p-3">${codeDisplay}</td>
      <td class="p-3">${ex.scheduledFor ? new Date(ex.scheduledFor).toLocaleString() : '-'}</td>
      <td class="p-3">
        <span style="background:${ex.status === 'Active' ? '#d4edda' : '#fff3e0'}; 
                     color:${ex.status === 'Active' ? '#155724' : '#e65100'};
                     padding:4px 8px; border-radius:4px; font-weight:bold;">
          ${ex.status || 'Draft'}
        </span>
      </td>
      <td class="p-3 flex gap-1 flex-wrap">
        <button title="View" class="text-blue-700" onclick="viewExam('${ex._id}')"><i class="fa fa-eye"></i></button>
        <button title="Edit" class="text-green-600" onclick="editExam('${ex._id}')"><i class="fa fa-edit"></i></button>
        <button title="Delete" class="text-red-600" onclick="deleteExam('${ex._id}')"><i class="fa fa-trash"></i></button>
        <button title="Stop" class="text-yellow-600" onclick="stopExam('${ex._id}')"><i class="fa fa-stop"></i></button>
      </td>
    </tr>`;
  }
  html += `</tbody></table>`;
  table.innerHTML = html;
}

window.showUploadExam = showUploadExam;
window.showScheduleExam = showScheduleExam;

// 2. Upload Exam
async function showUploadExam() {
  document.getElementById('pageTitle').textContent = 'Upload New Exam';
  const classes = await fetch('https://examguard-8rxe.onrender.com/api/classes').then(r => r.json()).catch(() => []);
  const subjects = await fetch('https://examguard-8rxe.onrender.com/api/subjects').then(r => r.json()).catch(() => []);
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Upload New Exam</h2>
    <form id="uploadExamForm" class="space-y-6 max-w-2xl">
      <div class="form-group">
        <label>Title <span class="text-red-500">*</span></label>
        <input name="title" required class="block w-full rounded border px-3 py-2 mt-1"/>
      </div>
      <div class="form-group">
        <label>Class <span class="text-red-500">*</span></label>
        <select name="class" required class="block w-full rounded border px-3 py-2 mt-1">
          <option value="">Select Class</option>
          ${classes.map(c => `<option value="${c._id}">${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Subject <span class="text-red-500">*</span></label>
        <select name="subject" required class="block w-full rounded border px-3 py-2 mt-1">
          <option value="">Select Subject</option>
          ${subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Duration (minutes) <span class="text-red-500">*</span></label>
        <input name="duration" type="number" min="1" required class="block w-full rounded border px-3 py-2 mt-1"/>
      </div>
      <div class="form-group">
        <label>Questions <span class="text-red-500">*</span></label>
        <div id="questionsList"></div>
        <button type="button" class="cbt-btn mt-2" id="addQuestionBtn"><i class="fa fa-plus mr-1"></i> Add Question</button>
      </div>
      <button type="submit" class="cbt-btn mt-2"><i class="fa fa-upload mr-1"></i> Upload Exam</button>
    </form>
    <div id="uploadExamMsg" class="mt-4"></div>
  `;

  let questions = [];

  function renderQuestions() {
    const qlist = document.getElementById('questionsList');
    if (!qlist) return;
    qlist.innerHTML = '';
    questions.forEach((q, qi) => {
      qlist.innerHTML += `
      <div class="border rounded-xl bg-[#f9fafd] p-4 mb-5" data-question-idx="${qi}">
        <div class="flex items-center justify-between mb-2">
          <div class="font-semibold text-lg text-[#2647a6]">Question ${qi + 1}</div>
          <button type="button" class="text-red-600" onclick="removeQuestion(${qi})"><i class="fa fa-trash"></i></button>
        </div>
        <label>Question Text:</label>
        <div id="qtext-quill-${qi}" class="quill-editor mb-2"></div>
        <label>Score: </label>
        <input type="number" min="1" value="${q.score || 1}" class="score-input block w-24 mb-3 border rounded px-2 py-1" placeholder="Score" />
        <label>Options:</label>
        <div id="optionsList-${qi}" class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 mb-2"></div>
        <button type="button" class="cbt-btn" onclick="addOption(${qi})"><i class="fa fa-plus mr-1"></i> Add Option</button>
        <div class="mt-4 p-3 bg-white rounded border">
          <label style="margin-bottom: 12px;">Select Correct Answer(s) <span class="text-red-500">*</span></label>
          <div id="correctAnswersCheckboxes-${qi}" class="flex flex-col gap-2"></div>
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
        <div class="border rounded p-2 mb-1 bg-white flex flex-col gap-1 relative" data-option-idx="${oi}">
          <div class="flex items-center justify-between mb-1">
            <span class="font-bold">Option ${String.fromCharCode(65+oi)}</span>
            <button type="button" class="text-red-600" onclick="removeOption(${qi},${oi})"><i class="fa fa-trash"></i></button>
          </div>
          <div id="q${qi}-opt-quill-${oi}" class="quill-editor"></div>
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
        <label class="option-checkbox">
          <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleCorrectAnswer(${qi}, ${oi})">
          <span>Option ${String.fromCharCode(65+oi)}</span>
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
      const res = await fetch('https://examguard-8rxe.onrender.com/api/upload/image', { method: 'POST', body: formData });
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
          `<div class="text-red-600">All exam fields are required.</div>`; 
        return;
      }

      if (!questions.length) {
        document.getElementById('uploadExamMsg').innerHTML =
          `<div class="text-red-600">Add at least one question.</div>`; 
        return;
      }

      // Validate questions
      for (let [i, q] of questions.entries()) {
        if (!q.text || !(q.options && q.options.length >= 2)) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="text-red-600">Question ${i+1} must have text and at least 2 options.</div>`; 
          return;
        }
        for (let [j, o] of (q.options || []).entries()) {
          if (!o.value) {
            document.getElementById('uploadExamMsg').innerHTML =
              `<div class="text-red-600">Question ${i+1} Option ${String.fromCharCode(65+j)} cannot be empty.</div>`; 
            return;
          }
        }
        if (!Array.isArray(q.answer) || q.answer.length === 0) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="text-red-600">Select at least one correct answer for Question ${i+1}.</div>`; 
          return;
        }
        for (let ans of q.answer) {
          if (typeof ans !== 'number' || ans < 0 || ans >= q.options.length) {
            document.getElementById('uploadExamMsg').innerHTML =
              `<div class="text-red-600">Invalid correct answer selection for Question ${i+1}.</div>`; 
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
        `<div class="text-blue-600">Uploading...</div>`;

      try {
        const res = await fetch('https://examguard-8rxe.onrender.com/api/exam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (data.error) {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="text-red-600">${data.error}</div>`;
        } else {
          document.getElementById('uploadExamMsg').innerHTML =
            `<div class="text-green-600">✅ Exam uploaded successfully.</div>`;

          uploadForm.reset();
          questions = [];
          setTimeout(showExams, 1200);
        }
      } catch (err) {
        console.error(err);
        document.getElementById('uploadExamMsg').innerHTML =
          `<div class="text-red-600">Network or server error.</div>`;
      } finally {
        submitBtn.disabled = false;
      }
    };
  }
}

// 3. Schedule Exam - WITH EXAM CODE GENERATION & CHECKBOX SELECTION
async function showScheduleExam() {
  document.getElementById('pageTitle').textContent = 'Schedule & Merge Exams';
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Schedule & Merge Exams</h2>
    <div id="schedule-loader" class="flex items-center justify-center py-10">
      <i class="fa fa-spinner fa-spin fa-2x text-blue-400"></i>
      <span class="ml-3 text-blue-700 font-bold">Loading exams...</span>
    </div>
  `;

  const exams = await fetch('https://examguard-8rxe.onrender.com/api/exam').then(r => r.json()).catch(() => []);

  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Schedule & Merge Exams</h2>
    <form id="mergeScheduleExamForm" class="space-y-4 max-w-4xl">
      <div class="form-group">
        <label>Select Exams to Merge <span class="text-red-500">*</span></label>
        <div id="examsCheckboxContainer" class="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <!-- Checkboxes will be populated here -->
        </div>
        <small class="block mt-2 text-gray-600">Select two or more exams to merge their questions.</small>
      </div>
      <div id="mergedQuestionsPreview" class="mt-4"></div>
      <div class="form-group mt-4">
        <label>New Exam Title <span class="text-red-500">*</span></label>
        <input type="text" name="mergedTitle" id="mergedTitle" class="block w-full rounded border px-3 py-2 mt-1" required />
      </div>
      <div class="form-group mt-4">
        <label>Duration (minutes) <span class="text-red-500">*</span></label>
        <input type="number" name="duration" id="mergedDuration" class="block w-full rounded border px-3 py-2 mt-1" min="1" required />
      </div>
      <div class="form-group mt-4">
        <label>Schedule Date & Time <span class="text-red-500">*</span></label>
        <input name="scheduledFor" type="datetime-local" required class="block w-full rounded border px-3 py-2 mt-1"/>
      </div>
      <!-- ✅ EXAM CODE DISPLAY -->
      <div class="form-group mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
        <label>Exam Code <span class="text-gray-500">(Auto-generated)</span></label>
        <div class="flex items-center gap-2 mt-2">
          <code id="generatedExamCode" style="background:#fff; padding:8px 12px; border-radius:4px; font-weight:bold; color:#2647a6; flex:1;">
            -
          </code>
          <button type="button" class="px-3 py-2 bg-blue-600 text-white rounded text-sm" onclick="copyToClipboard(document.getElementById('generatedExamCode').textContent, this)">
            <i class="fa fa-copy"></i> Copy
          </button>
        </div>
        <small style="display:block; margin-top:8px; color:#666;">This code will be generated when you schedule the exam.</small>
      </div>
      <button type="submit" class="cbt-btn mt-2 flex items-center" id="schedule-submit-btn">
        <span><i class="fa fa-calendar mr-1"></i> Schedule Merged Exam</span>
        <span id="schedule-submit-spinner" style="display:none;" class="ml-2"><i class="fa fa-spinner fa-spin"></i></span>
      </button>
    </form>
    <div id="mergeExamMsg" class="mt-4"></div>
  `;

  // Populate checkboxes
  const checkboxContainer = document.getElementById('examsCheckboxContainer');
  if (Array.isArray(exams) && exams.length > 0) {
    checkboxContainer.innerHTML = exams.map(exam => `
      <label class="option-checkbox">
        <input type="checkbox" name="examIds" value="${exam._id}" class="exam-checkbox" data-title="${exam.title}">
        <span class="font-medium">${exam.title}</span>
        <div class="text-sm text-gray-600">${exam.className} - ${exam.subjectName || 'N/A'}</div>
      </label>
    `).join('');
  } else {
    checkboxContainer.innerHTML = `<div class="text-gray-500 col-span-full">No exams available to merge.</div>`;
  }

  let mergedQuestions = [];

  // Track checkbox changes and update preview
  document.querySelectorAll('.exam-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateMergedPreview);
  });

  async function updateMergedPreview() {
    const selected = Array.from(document.querySelectorAll('.exam-checkbox:checked')).map(cb => cb.value);
    const previewDiv = document.getElementById('mergedQuestionsPreview');
    
    if (selected.length < 2) {
      previewDiv.innerHTML = "<div class='text-gray-500 p-4'>Select two or more exams to see merged preview.</div>";
      mergedQuestions = [];
      return;
    }

    previewDiv.innerHTML = `<div class="flex items-center text-blue-600 font-semibold py-4"><i class="fa fa-spinner fa-spin"></i> Merging questions...</div>`;

    const questionSets = await Promise.all(selected.map(id =>
      fetch(`https://examguard-8rxe.onrender.com/api/exam/${id}`).then(r => r.json())
    ));

    mergedQuestions = [];
    questionSets.forEach(exam => {
      (exam.questions || []).forEach(q => {
        mergedQuestions.push({ ...q, sourceExamTitle: exam.title });
      });
    });

    previewDiv.innerHTML = `
      <div class="mt-4">
        <div class="font-semibold text-[#22305a] mb-3">📋 Merged Questions Preview (${mergedQuestions.length} questions)</div>
        ${mergedQuestions.map((q, idx) => `
          <div class="mb-2 p-3 bg-[#f8fafc] rounded border flex items-start gap-3">
            <div class="text-gray-500 font-bold mt-1">${idx + 1}.</div>
            <div class="flex-1">
              <div class="font-semibold text-[#22305a]">From: <span class="text-blue-700">${q.sourceExamTitle}</span></div>
              <div class="mb-2 text-gray-800">${q.text}</div>
              <ol class="list-decimal ml-5 text-sm">${(q.options || []).map((o, oi) => `<li class="text-gray-700">${o.value || o}</li>`).join('')}</ol>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  document.getElementById('mergeScheduleExamForm').onsubmit = async function (e) {
    e.preventDefault();
    const selected = Array.from(document.querySelectorAll('.exam-checkbox:checked')).map(cb => cb.value);
    
    if (selected.length < 2) {
      document.getElementById('mergeExamMsg').innerHTML = `<div class="text-red-600">Please select at least 2 exams to merge.</div>`;
      return;
    }

    const mergedTitle = document.getElementById('mergedTitle').value;
    const duration = Number(document.getElementById('mergedDuration').value);
    const scheduledFor = document.querySelector('[name="scheduledFor"]').value;

    if (!mergedTitle || !duration || !scheduledFor) {
      document.getElementById('mergeExamMsg').innerHTML = `<div class="text-red-600">Please fill in all required fields.</div>`;
      return;
    }

    const firstExam = await fetch(`https://examguard-8rxe.onrender.com/api/exam/${selected[0]}`).then(r => r.json());
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
      const res = await fetch('https://examguard-8rxe.onrender.com/api/exam/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      submitBtn.disabled = false;
      spinner.style.display = 'none';

      if (data.success) {
        // ✅ Display generated exam code
        if (data.examCode) {
          document.getElementById('generatedExamCode').textContent = data.examCode;
          document.getElementById('mergeExamMsg').innerHTML = `
            <div class="text-green-600 p-3 bg-green-50 rounded border border-green-200">
              ✅ Merged exam scheduled successfully!<br>
              <strong>Exam Code:</strong> <code style="background:#fff; padding:4px 8px; border-radius:3px; color:#2647a6; font-weight:bold;">${data.examCode}</code>
            </div>
          `;
        } else {
          document.getElementById('mergeExamMsg').innerHTML = `<div class="text-green-600">✅ Merged exam scheduled!</div>`;
        }
        setTimeout(showExams, 1500);
      } else {
        document.getElementById('mergeExamMsg').innerHTML = `<div class="text-red-600">${data.error || 'Failed to merge exams.'}</div>`;
      }
    } catch (err) {
      console.error(err);
      submitBtn.disabled = false;
      spinner.style.display = 'none';
      document.getElementById('mergeExamMsg').innerHTML = `<div class="text-red-600">Network error.</div>`;
    }
  };
}

// 4. Results with filtering, search, and PDF export
async function showResults() {
  document.getElementById('pageTitle').textContent = 'Student Results';
  document.getElementById('contentArea').innerHTML = `
    <div class="flex items-center justify-between mb-7">
      <h2 class="text-2xl font-bold text-[#22305a]">Student Results</h2>
    </div>
    <div id="resultsLoading" class="results-loader">
      <i class="fa fa-spinner fa-spin fa-2x text-blue-400"></i>
      <span class="text-blue-700 font-bold">Loading results...</span>
    </div>
    <div id="resultsContainer" style="display: none;">
      <div class="filters-section mb-6">
        <div class="filter-input">
          <input type="text" id="searchInput" placeholder="🔍 Search by student name or exam..." class="block w-full rounded border px-3 py-2">
        </div>
        <div class="filter-select">
          <select id="classFilter" class="block w-full rounded border px-3 py-2">
            <option value="">All Classes</option>
          </select>
        </div>
        <div class="filter-select">
          <select id="subjectFilter" class="block w-full rounded border px-3 py-2">
            <option value="">All Subjects</option>
          </select>
        </div>
        <button class="cbt-btn" onclick="resetResultsFilters()"><i class="fa fa-redo mr-1"></i> Reset</button>
        <button class="cbt-btn" style="background: #28a745;" onclick="exportResultsToPDF()"><i class="fa fa-file-pdf mr-1"></i> Export PDF</button>
      </div>
      <div id="resultsInfo" class="results-info"></div>
      <div id="resultsTable" class="table-wrapper"></div>
      <!-- Hidden PDF content -->
      <div id="pdfContent" style="display: none;"></div>
    </div>
  `;

  const results = await fetch('https://examguard-8rxe.onrender.com/api/result').then(r => r.json()).catch(() => []);
  
  const loader = document.getElementById('resultsLoading');
  const container = document.getElementById('resultsContainer');
  if (loader) loader.style.display = 'none';
  if (container) container.style.display = 'block';

  if (!Array.isArray(results) || results.length === 0) {
    document.getElementById('resultsTable').innerHTML = `<div class="text-center text-gray-500 mt-12">No results found.</div>`; 
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
      table.innerHTML = `<div class="text-center text-gray-500 mt-12">No results match your filters.</div>`;
      info.innerHTML = `<span>Showing 0 results</span>`;
      document.getElementById('pdfContent').innerHTML = generatePDFContent([]);
      return;
    }

    info.innerHTML = `<span><i class="fa fa-info-circle"></i> Showing ${dataToRender.length} result(s)</span>`;

    let html = `<table class="min-w-full border text-left">
      <thead class="bg-[#f6f8fa] text-[#2647a6]">
        <tr>
          <th class="p-3">#</th>
          <th class="p-3">Student</th>
          <th class="p-3">Class</th>
          <th class="p-3">Subject</th>
          <th class="p-3">Exam Title</th>
          <th class="p-3">Score</th>
          <th class="p-3">Started</th>
          <th class="p-3">Finished</th>
          <th class="p-3">Details</th>
          <th class="p-3">Delete</th>
        </tr>
      </thead>
      <tbody>`;
    
    dataToRender.forEach((r, idx) => {
      html += `<tr class="border-b hover:bg-[#f9fafc]">
        <td class="p-3 font-bold text-[#2647a6]">${idx + 1}</td>
        <td class="p-3">${r.studentName || 'N/A'}</td>
        <td class="p-3">${r.className || 'N/A'}</td>
        <td class="p-3">${r.subjectName || 'N/A'}</td>
        <td class="p-3">${r.examTitle || 'N/A'}</td>
        <td class="p-3 font-semibold text-green-600">${r.score || 0} / ${r.total || 0}</td>
        <td class="p-3 text-sm">${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</td>
        <td class="p-3 text-sm">${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</td>
        <td class="p-3"><button class="text-blue-700" onclick="viewResult('${r._id}')"><i class="fa fa-eye"></i></button></td>
        <td class="p-3"><button class="text-red-600" title="Delete Result" onclick="deleteResult('${r._id}')"><i class="fa fa-trash"></i></button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    table.innerHTML = html;

    // Update PDF content
    document.getElementById('pdfContent').innerHTML = generatePDFContent(dataToRender);
  }

  function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const classValue = document.getElementById('classFilter').value;
    const subjectValue = document.getElementById('subjectFilter').value;

    filteredResults = results.filter(r => {
      const matchesSearch = !searchTerm || 
        r.studentName.toLowerCase().includes(searchTerm) || 
        r.examTitle.toLowerCase().includes(searchTerm);
      const matchesClass = !classValue || r.className === classValue;
      const matchesSubject = !subjectValue || r.subjectName === subjectValue;
      
      return matchesSearch && matchesClass && matchesSubject;
    });

    renderResultsTable(filteredResults);
  }

  window.resetResultsFilters = function() {
    document.getElementById('searchInput').value = '';
    document.getElementById('classFilter').value = '';
    document.getElementById('subjectFilter').value = '';
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
      // Show loading state
      const exportBtn = event.target.closest('button');
      const originalHTML = exportBtn.innerHTML;
      exportBtn.innerHTML = '<i class="fa fa-spinner fa-spin mr-1"></i> Generating PDF...';
      exportBtn.disabled = true;

      // Create container for html2pdf
      const element = document.createElement('div');
      element.innerHTML = pdfContent;
      element.style.padding = '20px';
      element.style.backgroundColor = '#ffffff';

      // Configure html2pdf options
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

      // Generate and download PDF
      await html2pdf().set(opt).from(element).save();

      // Restore button
      exportBtn.innerHTML = originalHTML;
      exportBtn.disabled = false;
    } catch (err) {
      console.error('PDF generation error:', err);
      alert('Error generating PDF: ' + err.message);
      const exportBtn = event.target.closest('button');
      exportBtn.innerHTML = '<i class="fa fa-file-pdf mr-1"></i> Export PDF';
      exportBtn.disabled = false;
    }
  }

  document.getElementById('searchInput').addEventListener('input', applyFilters);
  document.getElementById('classFilter').addEventListener('change', applyFilters);
  document.getElementById('subjectFilter').addEventListener('change', applyFilters);

  // Initial render
  renderResultsTable(filteredResults);
}

// 5. Student Activity
async function showStudentActivity() {
  document.getElementById('pageTitle').textContent = 'Student Activity';
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Student Activity</h2>
    <div id="activityTable" class="overflow-auto"></div>
  `;
  const acts = await fetch('https://examguard-8rxe.onrender.com/api/activity').then(r => r.json()).catch(() => []);
  const table = document.getElementById('activityTable');
  if (!Array.isArray(acts) || acts.length === 0) {
    table.innerHTML = `<div class="text-center text-gray-500 mt-12">No activity found.</div>`; 
    return;
  }
  let html = `<table class="min-w-full border text-left">
    <thead class="bg-[#f6f8fa] text-[#2647a6]">
      <tr>
        <th class="p-3">#</th>
        <th class="p-3">Student</th>
        <th class="p-3">Class</th>
        <th class="p-3">Exam</th>
        <th class="p-3">Started</th>
        <th class="p-3">Finished</th>
        <th class="p-3">Status</th>
        <th class="p-3">Actions</th>
      </tr>
    </thead>
    <tbody>`;
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    html += `<tr class="border-b">
      <td class="p-3 font-bold text-[#2647a6]">${i + 1}</td>
      <td class="p-3">${a.studentName}</td>
      <td class="p-3">${a.className}</td>
      <td class="p-3">${a.examTitle}</td>
      <td class="p-3">${a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}</td>
      <td class="p-3">${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '-'}</td>
      <td class="p-3">${a.status || ''}</td>
      <td class="p-3">
        <button title="View" class="text-blue-700" onclick="viewActivity('${a._id}')"><i class="fa fa-eye"></i></button>
      </td>
    </tr>`;
  }
  html += `</tbody></table>`;
  table.innerHTML = html;
}

// ============ ACTION HANDLERS ============

window.viewExam = async function(id) {
  const ex = await fetch(`https://examguard-8rxe.onrender.com/api/exam/${id}`).then(r=>r.json());
  if(ex.error){alert(ex.error); return;}
  
  // ✅ Display exam code in detail view
  const codeDisplay = ex.examCode 
    ? `<div class="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
         <b>Exam Code:</b> 
         <code style="background:#fff; padding:4px 8px; border-radius:3px; color:#2647a6; font-weight:bold; margin-left:8px;">
           ${ex.examCode}
         </code>
         <button class="ml-2 px-2 py-1 bg-blue-600 text-white rounded text-xs" onclick="copyToClipboard('${ex.examCode}', this)">
           <i class="fa fa-copy"></i> Copy
         </button>
       </div>`
    : '<div class="mb-3 text-gray-500">No code generated yet.</div>';
  
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Exam Detail</h2>
    <div class="mb-3"><b>Title:</b> ${ex.title}</div>
    <div class="mb-3"><b>Class:</b> ${ex.className}</div>
    <div class="mb-3"><b>Subject:</b> ${ex.subjectName}</div>
    <div class="mb-3"><b>Duration:</b> ${ex.duration} mins</div>
    <div class="mb-3"><b>Status:</b> ${ex.status}</div>
    <div class="mb-3"><b>Scheduled:</b> ${ex.scheduledFor ? new Date(ex.scheduledFor).toLocaleString() : '-'}</div>
    ${codeDisplay}
    <div class="mb-3"><b>Questions:</b>${Array.isArray(ex.questions) ? ex.questions.map((q,i) => `
      <div class="mb-2">
        <b>Q${i+1} (${q.score||1} mark):</b> <div class="border rounded p-2 mb-1 bg-[#f9fafd]">${q.text}</div>
        <div class="ml-3">Options:
          <ol class="list-decimal ml-4">
          ${(q.options||[]).map((o,oi)=>`<li class="${(Array.isArray(q.answer) ? q.answer.includes(oi) : oi==q.answer)?'text-green-700 font-bold':''}">${o.value || o}</li>`).join('')}
          </ol>
        </div>
        <div class="ml-3">Correct: <b>${Array.isArray(q.answer) ? q.answer.map(idx => String.fromCharCode(65 + idx)).join(', ') : String.fromCharCode(65 + (q.answer||0))}</b></div>
      </div>
    `).join('') : ''}
    </div>
    <button class="cbt-btn" onclick="showExams()"><i class="fa fa-arrow-left mr-1"></i> Back to Exams</button>
  `;
}

window.editExam = async function(id) {
  const ex = await fetch(`https://examguard-8rxe.onrender.com/api/exam/${id}`).then(r=>r.json());
  if(ex.error){alert(ex.error); return;}
  alert('Edit Exam is not implemented for advanced question editor. Please delete and re-upload for now.');
  showExams();
}

window.deleteExam = async function(id) {
  if (!confirm('Delete this exam?')) return;
  const res = await fetch(`https://examguard-8rxe.onrender.com/api/exam/${id}`,{method:'DELETE'}).then(r=>r.json());
  if(res.error){alert(res.error);} else {showExams();}
}

window.stopExam = async function(id) {
  if (!confirm('Stop this exam for all students?')) return;
  await fetch(`https://examguard-8rxe.onrender.com/api/exam/${id}/stop`,{method:'POST'});
  showExams();
}

window.viewResult = async function(id) {
  const r = await fetch(`https://examguard-8rxe.onrender.com/api/result/${id}`).then(r=>r.json());
  if(r.error){alert(r.error); return;}
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Result Detail</h2>
    <div class="mb-3"><b>Student:</b> ${r.studentName}</div>
    <div class="mb-3"><b>Class:</b> ${r.className}</div>
    <div class="mb-3"><b>Subject:</b> ${r.subjectName}</div>
    <div class="mb-3"><b>Exam Title:</b> ${r.examTitle}</div>
    <div class="mb-3"><b>Score:</b> <span class="text-green-600 font-bold">${r.score} / ${r.total}</span></div>
    <div class="mb-3"><b>Started:</b> ${r.startedAt ? new Date(r.startedAt).toLocaleString() : '-'}</div>
    <div class="mb-3"><b>Finished:</b> ${r.finishedAt ? new Date(r.finishedAt).toLocaleString() : '-'}</div>
    <div class="mb-3"><b>Answers:</b><pre class="bg-[#f8fafc] rounded p-3 text-sm overflow-auto">${JSON.stringify(r.answers, null, 2)}</pre></div>
    <button class="cbt-btn" onclick="showResults()"><i class="fa fa-arrow-left mr-1"></i> Back to Results</button>
  `;
}

window.deleteResult = async function(id) {
  if (!confirm('Delete this result?')) return;
  const res = await fetch(`https://examguard-8rxe.onrender.com/api/result/${id}`, { method: 'DELETE' }).then(r => r.json()).catch(() => ({}));
  if (res.error) {
    alert(res.error);
  } else {
    showResults();
  }
}

window.viewActivity = async function(id) {
  const a = await fetch(`https://examguard-8rxe.onrender.com/api/activity/${id}`).then(r=>r.json());
  if(a.error){alert(a.error); return;}
  document.getElementById('contentArea').innerHTML = `
    <h2 class="text-2xl font-bold mb-5 text-[#22305a]">Student Activity Detail</h2>
    <div class="mb-3"><b>Student:</b> ${a.studentName}</div>
    <div class="mb-3"><b>Class:</b> ${a.className}</div>
    <div class="mb-3"><b>Exam:</b> ${a.examTitle}</div>
    <div class="mb-3"><b>Started:</b> ${a.startedAt ? new Date(a.startedAt).toLocaleString() : '-'}</div>
    <div class="mb-3"><b>Finished:</b> ${a.finishedAt ? new Date(a.finishedAt).toLocaleString() : '-'}</div>
    <div class="mb-3"><b>Status:</b> ${a.status}</div>
    <div class="mb-3"><b>Activity Log:</b><pre class="bg-[#f8fafc] rounded p-3 text-sm overflow-auto">${JSON.stringify(a.activityLog, null, 2)}</pre></div>
    <button class="cbt-btn" onclick="showStudentActivity()"><i class="fa fa-arrow-left mr-1"></i> Back to Activity</button>
  `;
}

// ============ INITIALIZE ============
showExams();

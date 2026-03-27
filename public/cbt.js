// ============ CONFIGURATION ============
const API_BASE_URL = "https://examguard-8rxe.onrender.com";
const token = localStorage.getItem('student_token') || localStorage.getItem('studentToken') || localStorage.getItem('token');

// ============ STATE MANAGEMENT ============
let student = { name: '', class: '', subject: '', avatar: '', _id: '', email: '' };
let exam = null;
let startedAt = new Date().toISOString();
let questions = [];
let answers = [];
let currentQ = 0;
let timerSeconds = 0;
let timerInterval = null;
let examAttempted = false;

// ============ ACTIVITY LOGGING ============
async function logStudentActivity(action, extra = {}) {
  if (!exam || !student._id) return;
  
  const payload = {
    student: student._id,
    exam: exam._id,
    action: action,
    timestamp: new Date().toISOString(),
    ...extra
  };

  try {
    await fetch(API_BASE_URL + '/api/activity', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Activity logging failed:', e);
  }
}

// ============ INITIALIZATION ============
async function fetchStudentAndExam() {
  try {
    // Fetch student data
    let studentRes = await fetch(API_BASE_URL + '/api/student/me', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });

    if (!studentRes.ok) {
      showError('Failed to load student data. Please login again.');
      setTimeout(() => window.location.href = '/cbt-login.html', 2000);
      return;
    }

    const studentJson = await studentRes.json();
    student.name = studentJson.name || 
      `${studentJson.first_name || ''} ${studentJson.last_name || ''}`.trim() || "Student";
    student.class = (typeof studentJson.class === 'object' && studentJson.class?.name) ? 
      studentJson.class.name : (typeof studentJson.class === 'string' ? studentJson.class : '-');
    student.email = studentJson.email || '-';
    student.avatar = studentJson.photo_url || '';
    student._id = studentJson._id;

    // Fetch scheduled exams
    let scheduledRes = await fetch(
      API_BASE_URL + '/api/exam/student?status=Scheduled,Started',
      { headers: token ? { 'Authorization': 'Bearer ' + token } : {} }
    );

    let scheduled = [];
    if (scheduledRes.ok) {
      scheduled = await scheduledRes.json();
    }

    if (!Array.isArray(scheduled) || !scheduled.length) {
      showNoExam();
      return;
    }

    // ✅ Check if student has already attempted this exam
    const examCode = localStorage.getItem('examCode');
    const completedExams = JSON.parse(localStorage.getItem('completedExams') || '[]');
    
    if (completedExams.some(ex => ex.code === examCode)) {
      showExamAlreadyAttempted();
      return;
    }

    exam = scheduled[0];
    questions = Array.isArray(exam.questions) ? exam.questions : [];
    answers = Array(questions.length).fill(null);
    timerSeconds = (exam.duration || 15) * 60;
    currentQ = 0;

    // Hide loader, show exam
    hideElement('cbtExamLoader');
    showElement('cbtExamArea');
    
    fillStudentSidebar();
    renderQuestion();
    startTimer();
    logStudentActivity('started');

  } catch (error) {
    console.error('Error fetching exam:', error);
    showError('Network error. Please refresh the page.');
    showNoExam();
  }
}

function showNoExam() {
  hideElement('cbtExamLoader');
  showElement('cbtNoExamArea');
  document.getElementById('cbtNoExamArea').innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <i class="fa fa-inbox" style="font-size: 48px; color: #cbd5e1; margin-bottom: 20px; display: block;"></i>
      <h3 style="color: #1a2b4b; margin-bottom: 10px;">No Exam Available</h3>
      <p style="color: #6b7280; margin-bottom: 20px;">No CBT exam is currently scheduled for you.</p>
      <p style="color: #9ca3af; font-size: 0.9rem;">If you believe this is an error, please contact your teacher.</p>
    </div>
  `;
}

// ✅ NEW: Show exam already attempted message
function showExamAlreadyAttempted() {
  hideElement('cbtExamLoader');
  showElement('cbtNoExamArea');
  document.getElementById('cbtNoExamArea').innerHTML = `
    <div style="text-align: center; padding: 40px;">
      <div style="background: #fef3c7; border: 2px solid #fcd34d; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <i class="fa fa-check-circle" style="font-size: 48px; color: #d97706; margin-bottom: 16px; display: block;"></i>
        <h3 style="color: #92400e; margin-bottom: 10px; font-size: 1.3rem;">Exam Already Completed</h3>
        <p style="color: #b45309; margin-bottom: 8px;">You have already taken this exam.</p>
        <p style="color: #92400e; font-size: 0.9rem;">Each student can only attempt an exam once.</p>
      </div>
      <button class="cbt-btn cbt-btn-primary" onclick="logout()" style="margin-top: 20px;">
        <i class="fa fa-sign-out-alt mr-2"></i> Go Back to Login
      </button>
    </div>
  `;
}

// ============ UI HELPERS ============
function showElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = '';
}

function hideElement(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

function showError(message) {
  const loader = document.getElementById('cbtExamLoader');
  if (loader) {
    loader.innerHTML = `
      <div style="text-align: center;">
        <i class="fa fa-exclamation-circle" style="font-size: 48px; color: #ef4444; margin-bottom: 16px; display: block;"></i>
        <p style="color: #ef4444; font-weight: 600;">${message}</p>
      </div>
    `;
  }
}

// ============ SIDEBAR & NAVIGATION ============
function fillStudentSidebar() {
  document.getElementById('studentName').textContent = student.name || 'Student';
  document.getElementById('studentClass').textContent = "Class: " + (student.class || '-');
  document.getElementById('studentEmail').textContent = student.email || '-';
  document.getElementById('headerStudentName').textContent = student.name.split(' ')[0] || 'Student';
  document.getElementById('headerSubject').textContent = "Subject: " + (exam?.subjectName || exam?.subject?.name || '-');
  
  document.getElementById('cbtTotalQuestions').textContent = questions.length;
  const answered = answers.filter(a => a !== null).length;
  document.getElementById('cbtTotalAnswered').textContent = answered;
  document.getElementById('cbtTotalLeft').textContent = questions.length - answered;
  
  const progress = questions.length > 0 ? Math.round((answered / questions.length) * 100) : 0;
  document.getElementById('progressPercent').textContent = progress + '%';
  document.getElementById('navQCount').textContent = (currentQ + 1) + '/' + questions.length;

  // Question navigation buttons
  let navHtml = "";
  for (let i = 0; i < questions.length; i++) {
    let btnClass = "cbt-nav-btn";
    if (i === currentQ) btnClass += " current";
    else if (answers[i] !== null) btnClass += " answered";
    navHtml += `<button type="button" class="${btnClass}" onclick="gotoQuestion(${i})" title="Question ${i + 1}">${i + 1}</button>`;
  }
  document.getElementById('cbtQuestionNav').innerHTML = navHtml;
}

// ============ QUESTION RENDERING ============
function renderQuestion() {
  const q = questions[currentQ];
  
  document.getElementById('cbtTestTitle').textContent = exam?.title || 'Exam';
  document.getElementById('cbtQuestionNumber').textContent = `Question ${currentQ + 1} of ${questions.length}`;
  
  document.getElementById('cbtQuestionText').innerHTML = 
    `<div style="overflow-x:auto;max-width:100%;" class="cbt-question">${q.text || 'Question not loaded'}</div>`;

  const progress = ((currentQ + 1) / questions.length) * 100;
  document.getElementById('progressBar').style.width = progress + '%';

  // Render options
  let optsHtml = "";
  (q.options || []).forEach((opt, idx) => {
    let selected = answers[currentQ] === idx ? "selected" : "";
    let optValue = typeof opt === 'string' ? opt : (opt.value || '');
    optsHtml += `
      <div class="cbt-option ${selected}" onclick="selectAnswer(${idx})">
        <div class="cbt-option-label">${String.fromCharCode(65 + idx)}</div>
        <div class="cbt-option-content">
          <div class="cbt-option-text">${optValue}</div>
        </div>
      </div>
    `;
  });
  document.getElementById('cbtOptions').innerHTML = optsHtml;

  // Update button states
  const prevBtn = document.getElementById('cbtPrevBtn');
  const nextBtn = document.getElementById('cbtNextBtn');
  const submitBtn = document.getElementById('cbtSubmitBtn');

  prevBtn.disabled = currentQ === 0;
  nextBtn.disabled = currentQ === questions.length - 1;
  submitBtn.disabled = answers.filter(a => a !== null).length !== questions.length;

  prevBtn.onclick = () => {
    if (currentQ > 0) {
      currentQ--;
      renderQuestion();
    }
  };

  nextBtn.onclick = () => {
    if (currentQ < questions.length - 1) {
      currentQ++;
      renderQuestion();
    }
  };

  submitBtn.onclick = submitBtnHandler;

  fillStudentSidebar();
}

// ============ QUESTION NAVIGATION ============
window.gotoQuestion = function(qIdx) {
  currentQ = qIdx;
  renderQuestion();
  logStudentActivity('navigated', { questionIndex: qIdx });
};

window.selectAnswer = function(idx) {
  answers[currentQ] = idx;
  renderQuestion();
  logStudentActivity('answered', { questionIndex: currentQ, answer: idx });
};

// ============ TIMER LOGIC ============
function formatTimer(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function startTimer() {
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timerSeconds--;
    updateTimerDisplay();
    
    if (timerSeconds <= 0) {
      clearInterval(timerInterval);
      showNotification('Time is up! Submitting your exam...', 'warning', 2000);
      setTimeout(() => submitExam(), 500);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const timerEl = document.getElementById('cbtTimer');
  if (!timerEl) return;
  
  timerEl.textContent = formatTimer(timerSeconds);
  timerEl.classList.remove('danger', 'warning');
  
  if (timerSeconds <= 60) {
    timerEl.classList.add('danger');
  } else if (timerSeconds <= 300) {
    timerEl.classList.add('warning');
  }
}

// ============ SUBMISSION LOGIC ============
async function submitBtnHandler() {
  if (!exam || !student) return;
  
  if (confirm("Are you sure you want to submit? You cannot change your answers after submission.")) {
    clearInterval(timerInterval);
    await submitExam();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const submitBtn = document.getElementById('cbtSubmitBtn');
  if (submitBtn) {
    submitBtn.onclick = submitBtnHandler;
  }
});

async function submitExam() {
  if (examAttempted) {
    showNotification('Exam is already being submitted...', 'info');
    return;
  }

  examAttempted = true;

  // Hide exam, show submission status
  hideElement('cbtExamArea');
  showElement('cbtResultArea');

  document.getElementById('cbtResultArea').innerHTML = `
    <div style="text-align: center; padding: 60px 20px;">
      <div class="cbt-spinner" style="margin: 0 auto 20px;"></div>
      <p style="color: #6b7280; font-weight: 500; font-size: 1.1rem;">Submitting your exam...</p>
      <p style="color: #9ca3af; font-size: 0.9rem; margin-top: 8px;">Please wait, this may take a few seconds</p>
    </div>
  `;

  const payload = {
    exam: exam._id,
    answers,
    student: student._id,
    startedAt: startedAt,
    finishedAt: new Date().toISOString()
  };

  try {
    const res = await fetch(API_BASE_URL + '/api/result', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': 'Bearer ' + token } : {})
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Submission failed');
    }

    const result = await res.json();
    logStudentActivity('submitted', { answers });

    // ✅ Mark exam as completed
    const examCode = localStorage.getItem('examCode');
    const completedExams = JSON.parse(localStorage.getItem('completedExams') || '[]');
    completedExams.push({
      code: examCode,
      examId: exam._id,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('completedExams', JSON.stringify(completedExams));

    // Show success notification
    showSubmissionSuccess();

  } catch (error) {
    console.error('Submission error:', error);
    showSubmissionError();
  }
}

// ============ NOTIFICATIONS ============
function showNotification(message, type = 'info', duration = 3000) {
  const notification = document.createElement('div');
  notification.className = `cbt-notification cbt-notification-${type}`;
  notification.innerHTML = `
    <div class="cbt-notification-content">
      <i class="fa fa-${getIconForType(type)}"></i>
      <span>${message}</span>
    </div>
  `;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('show');
  }, 10);

  if (duration > 0) {
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, duration);
  }

  return notification;
}

function getIconForType(type) {
  switch(type) {
    case 'success': return 'check-circle';
    case 'error': return 'exclamation-circle';
    case 'warning': return 'exclamation-triangle';
    default: return 'info-circle';
  }
}

// ✅ NEW: Submission Success Notification
function showSubmissionSuccess() {
  const resultArea = document.getElementById('cbtResultArea');
  
  resultArea.innerHTML = `
    <div style="text-align: center; padding: 80px 20px;">
      <div style="animation: scaleIn 0.6s ease-out;">
        <div style="font-size: 80px; color: #10b981; margin-bottom: 20px;">
          <i class="fa fa-check-circle"></i>
        </div>
        <h2 style="color: #1a2b4b; font-size: 2rem; font-weight: 800; margin-bottom: 12px;">
          Exam Submitted Successfully
        </h2>
        <p style="color: #6b7280; font-size: 1.1rem; margin-bottom: 32px;">
          Thank you, <strong>${student.name}</strong>. Your answers have been received.
        </p>

        <div style="background: linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border: 2px solid #6ee7b7; border-radius: 12px; padding: 24px; margin-bottom: 32px; max-width: 500px; margin-left: auto; margin-right: auto;">
          <p style="color: #065f46; font-size: 0.95rem; margin: 0;">
            <i class="fa fa-info-circle mr-2"></i>
            Your exam has been successfully submitted. You will not be able to retake this exam.
          </p>
        </div>

        <button class="cbt-btn cbt-btn-primary" onclick="logout()" style="margin-top: 12px;">
          <i class="fa fa-sign-out-alt mr-2"></i> Return to Login
        </button>
      </div>
    </div>
  `;

  showNotification('Exam submitted successfully!', 'success', 4000);
}

// ✅ NEW: Submission Error Notification
function showSubmissionError() {
  const resultArea = document.getElementById('cbtResultArea');
  
  resultArea.innerHTML = `
    <div style="text-align: center; padding: 80px 20px;">
      <div style="animation: slideDown 0.6s ease-out;">
        <div style="font-size: 80px; color: #ef4444; margin-bottom: 20px;">
          <i class="fa fa-exclamation-circle"></i>
        </div>
        <h2 style="color: #1a2b4b; font-size: 2rem; font-weight: 800; margin-bottom: 12px;">
          Submission Failed
        </h2>
        <p style="color: #6b7280; font-size: 1.1rem; margin-bottom: 32px;">
          We couldn't submit your exam. Please try again.
        </p>

        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #fca5a5; border-radius: 12px; padding: 24px; margin-bottom: 32px; max-width: 500px; margin-left: auto; margin-right: auto;">
          <p style="color: #991b1b; font-size: 0.95rem; margin: 0;">
            <i class="fa fa-exclamation-triangle mr-2"></i>
            If the problem persists, please take a screenshot and contact your teacher immediately.
          </p>
        </div>

        <div style="display: flex; gap: 12px; justify-content: center;">
          <button class="cbt-btn cbt-btn-secondary" onclick="location.reload()" style="margin-top: 12px;">
            <i class="fa fa-redo mr-2"></i> Try Again
          </button>
          <button class="cbt-btn cbt-btn-primary" onclick="logout()" style="margin-top: 12px;">
            <i class="fa fa-sign-out-alt mr-2"></i> Log Out
          </button>
        </div>
      </div>
    </div>
  `;

  showNotification('Failed to submit exam. Please try again.', 'error', 5000);
}

// ============ LOGOUT ============
window.logout = function() {
  localStorage.removeItem('student_token');
  localStorage.removeItem('studentToken');
  localStorage.removeItem('token');
  localStorage.removeItem('studentId');
  localStorage.removeItem('studentClass');
  localStorage.removeItem('examCode');
  window.location.href = '/cbt-login.html';
};

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
  fetchStudentAndExam();
});

// Prevent accidental navigation away during exam
window.addEventListener('beforeunload', (e) => {
  if (exam && !examAttempted && timerInterval) {
    e.preventDefault();
    e.returnValue = '';
  }
});
   

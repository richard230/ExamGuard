// ============ CONFIGURATION ============
const API_BASE_URL = "https://goldlincschools.onrender.com";
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
let currentExamCode = null;

// ============ INITIALIZATION ============
window.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in
  if (!token) {
    window.location.href = 'cbt-login.html';
    return;
  }
  
  // Show code modal first
  const codeModal = document.getElementById('examCodeModal');
  if (codeModal) {
    codeModal.classList.remove('hidden');
    const codeInput = document.getElementById('examCodeInput');
    if (codeInput) codeInput.focus();
    setupCodeModalHandlers();
  } else {
    console.warn('Code modal not found in HTML');
  }
});

// ============ CODE MODAL HANDLERS ============
function setupCodeModalHandlers() {
  const codeForm = document.getElementById('examCodeForm');
  const codeLogoutBtn = document.getElementById('codeLogoutBtn');
  
  if (codeLogoutBtn) {
    codeLogoutBtn.addEventListener('click', () => {
      logout();
    });
  }

  if (codeForm) {
    codeForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCodeSubmission();
    });
  }
}

async function handleCodeSubmission() {
  const examCodeInput = document.getElementById('examCodeInput');
  if (!examCodeInput) return;

  const examCode = examCodeInput.value.trim().toUpperCase();
  const codeSubmitBtn = document.getElementById('codeSubmitBtn');
  const codeSpinner = document.getElementById('codeSpinner');
  const codeSubmitText = document.getElementById('codeSubmitText');
  const codeErrorMsg = document.getElementById('codeErrorMsg');
  const codeSuccessMsg = document.getElementById('codeSuccessMsg');

  if (!examCode) {
    showCodeError('Please enter an exam code');
    return;
  }

  if (examCode.length < 5) {
    showCodeError('Exam code must be at least 5 characters');
    return;
  }

  codeSubmitBtn.disabled = true;
  codeSpinner.style.display = 'inline-block';
  codeSubmitText.textContent = 'Verifying...';
  codeErrorMsg.classList.remove('show');
  codeSuccessMsg.classList.remove('show');

  try {
    // Fetch student first to get their ID and class
    const studentRes = await fetch(API_BASE_URL + '/api/student/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });

    if (!studentRes.ok) {
      showCodeError('Failed to load student data');
      codeSubmitBtn.disabled = false;
      codeSpinner.style.display = 'none';
      codeSubmitText.textContent = 'Verify Code';
      return;
    }

    const studentJson = await studentRes.json();
    const studentId = studentJson._id;
    const studentClass = studentJson.class?._id || studentJson.classId;

    if (!studentClass) {
      showCodeError('Could not determine your class. Please contact support.');
      codeSubmitBtn.disabled = false;
      codeSpinner.style.display = 'none';
      codeSubmitText.textContent = 'Verify Code';
      return;
    }

    // ✅ Check if THIS student has already attempted THIS exam code
    const attemptKey = `exam_attempt_${studentId}_${examCode}`;
    if (localStorage.getItem(attemptKey)) {
      showCodeError('You have already completed this exam. Each student can only attempt an exam once.');
      codeSubmitBtn.disabled = false;
      codeSpinner.style.display = 'none';
      codeSubmitText.textContent = 'Verify Code';
      return;
    }

    // Validate exam code with backend
    const validateRes = await fetch(API_BASE_URL + '/api/exam/validate-code', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({
        examCode: examCode,
        classId: studentClass
      })
    });

    const validateData = await validateRes.json();

    if (!validateRes.ok) {
      showCodeError(validateData.error || 'Invalid exam code for your class');
      codeSubmitBtn.disabled = false;
      codeSpinner.style.display = 'none';
      codeSubmitText.textContent = 'Verify Code';
      return;
    }

    // ✅ Code is valid - store it and load exam
    currentExamCode = examCode;
    localStorage.setItem('currentExamCode', examCode);
    showCodeSuccess('✓ Code verified! Loading exam...');
    
    setTimeout(() => {
      const modal = document.getElementById('examCodeModal');
      if (modal) modal.classList.add('hidden');
      loadExamWithCode(validateData.exam, studentJson);
    }, 800);

  } catch (err) {
    console.error('Code validation error:', err);
    showCodeError('Network error. Please try again.');
    codeSubmitBtn.disabled = false;
    codeSpinner.style.display = 'none';
    codeSubmitText.textContent = 'Verify Code';
  }
}

function showCodeError(message) {
  const codeErrorMsg = document.getElementById('codeErrorMsg');
  if (codeErrorMsg) {
    codeErrorMsg.textContent = '✕ ' + message;
    codeErrorMsg.classList.add('show');
  }
  
  const codeSuccessMsg = document.getElementById('codeSuccessMsg');
  if (codeSuccessMsg) codeSuccessMsg.classList.remove('show');
  
  const codeInput = document.getElementById('examCodeInput');
  if (codeInput) codeInput.focus();
}

function showCodeSuccess(message) {
  const codeSuccessMsg = document.getElementById('codeSuccessMsg');
  if (codeSuccessMsg) {
    codeSuccessMsg.textContent = message;
    codeSuccessMsg.classList.add('show');
  }
  
  const codeErrorMsg = document.getElementById('codeErrorMsg');
  if (codeErrorMsg) codeErrorMsg.classList.remove('show');
}

// ============ LOAD EXAM AFTER CODE VERIFICATION ============
async function loadExamWithCode(verifiedExam, studentData) {
  try {
    // Set student data
    student.name = studentData.name || 
      `${studentData.first_name || ''} ${studentData.last_name || ''}`.trim() || 'Student';
    student.class = studentData.class?.name || studentData.class || 'N/A';
    student.email = studentData.email || '-';
    student.avatar = studentData.photo_url || '';
    student._id = studentData._id;

    // ✅ Store attempt immediately (student-specific + exam-specific)
    const attemptKey = `exam_attempt_${student._id}_${currentExamCode}`;
    localStorage.setItem(attemptKey, JSON.stringify({
      examCode: currentExamCode,
      examId: verifiedExam._id,
      studentId: student._id,
      timestamp: new Date().toISOString()
    }));

    // Set exam data
    exam = verifiedExam;
    questions = Array.isArray(exam.questions) ? exam.questions : [];
    answers = Array(questions.length).fill(null);
    timerSeconds = (exam.duration || 15) * 60;
    currentQ = 0;

    // Show main content
    const mainContent = document.getElementById('cbtMainContent');
    if (mainContent) mainContent.style.display = '';
    
    hideElement('cbtExamLoader');
    showElement('cbtExamArea');
    
    fillStudentSidebar();
    renderQuestion();
    startTimer();
    logStudentActivity('started');

  } catch (err) {
    console.error('Error loading exam:', err);
    showCodeError('Failed to load exam. Please try again.');
  }
}

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
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.warn('Activity logging failed:', e);
  }
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
  const nameEl = document.getElementById('studentName');
  const classEl = document.getElementById('studentClass');
  const emailEl = document.getElementById('studentEmail');
  const subjectEl = document.getElementById('headerSubject');
  const questionsEl = document.getElementById('cbtTotalQuestions');
  const answeredEl = document.getElementById('cbtTotalAnswered');
  const leftEl = document.getElementById('cbtTotalLeft');

  if (nameEl) nameEl.textContent = student.name || 'Student';
  if (classEl) classEl.textContent = "Class: " + (student.class || '-');
  if (emailEl) emailEl.textContent = student.email || '-';
  if (subjectEl) subjectEl.textContent = "Subject: " + (exam?.title || '-');
  
  if (questionsEl) questionsEl.textContent = questions.length;
  const answered = answers.filter(a => a !== null).length;
  if (answeredEl) answeredEl.textContent = answered;
  if (leftEl) leftEl.textContent = questions.length - answered;

  // Question navigation buttons
  let navHtml = "";
  for (let i = 0; i < questions.length; i++) {
    let btnClass = "cbt-nav-btn";
    if (i === currentQ) btnClass += " current";
    else if (answers[i] !== null) btnClass += " answered";
    navHtml += `<button type="button" class="${btnClass}" onclick="gotoQuestion(${i})" title="Question ${i + 1}">${i + 1}</button>`;
  }
  
  const navEl = document.getElementById('cbtQuestionNav');
  if (navEl) navEl.innerHTML = navHtml;
}

// ============ QUESTION RENDERING ============
function renderQuestion() {
  const q = questions[currentQ];
  
  const titleEl = document.getElementById('cbtTestTitle');
  if (titleEl) titleEl.textContent = exam?.title || 'Exam';
  
  const questionTextEl = document.getElementById('cbtQuestionText');
  if (questionTextEl) {
    questionTextEl.innerHTML = 
      `<div style="overflow-x:auto;max-width:100%;" class="cbt-question">${q.text || 'Question not loaded'}</div>`;
  }

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
  
  const optionsEl = document.getElementById('cbtOptions');
  if (optionsEl) optionsEl.innerHTML = optsHtml;

  // Update button states
  const prevBtn = document.getElementById('cbtPrevBtn');
  const nextBtn = document.getElementById('cbtNextBtn');
  const submitBtn = document.getElementById('cbtSubmitBtn');

  if (prevBtn) {
    prevBtn.disabled = currentQ === 0;
    prevBtn.onclick = () => {
      if (currentQ > 0) {
        currentQ--;
        renderQuestion();
      }
    };
  }

  if (nextBtn) {
    nextBtn.disabled = currentQ === questions.length - 1;
    nextBtn.onclick = () => {
      if (currentQ < questions.length - 1) {
        currentQ++;
        renderQuestion();
      }
    };
  }

  if (submitBtn) {
    submitBtn.disabled = answers.filter(a => a !== null).length !== questions.length;
    submitBtn.onclick = submitBtnHandler;
  }

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

  const resultArea = document.getElementById('cbtResultArea');
  if (resultArea) {
    resultArea.innerHTML = `
      <div style="text-align: center; padding: 60px 20px;">
        <div class="cbt-spinner" style="margin: 0 auto 20px;"></div>
        <p style="color: #6b7280; font-weight: 500; font-size: 1.1rem;">Submitting your exam...</p>
        <p style="color: #9ca3af; font-size: 0.9rem; margin-top: 8px;">Please wait, this may take a few seconds</p>
      </div>
    `;
  }

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
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error('Submission failed');
    }

    logStudentActivity('submitted', { answers });
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

// ✅ SUBMISSION SUCCESS
function showSubmissionSuccess() {
  const resultArea = document.getElementById('cbtResultArea');
  
  if (resultArea) {
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

          <button class="cbt-btn" onclick="logout()" style="margin-top: 12px; background: linear-gradient(135deg, #2647a6 0%, #1e3a8a 100%); color: white; padding: 13px 28px; font-size: 1rem; border-radius: 10px;">
            <i class="fa fa-sign-out-alt mr-2"></i> Return to Login
          </button>
        </div>
      </div>
    `;
  }

  showNotification('Exam submitted successfully!', 'success', 4000);
}

// ✅ SUBMISSION ERROR
function showSubmissionError() {
  const resultArea = document.getElementById('cbtResultArea');
  
  if (resultArea) {
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
              Contact your teacher if the problem persists.
            </p>
          </div>

          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
            <button class="cbt-btn" onclick="location.reload()" style="margin-top: 12px; background: #6b7280; color: white; padding: 13px 28px; font-size: 1rem; border-radius: 10px;">
              <i class="fa fa-redo mr-2"></i> Try Again
            </button>
            <button class="cbt-btn" onclick="logout()" style="margin-top: 12px; background: linear-gradient(135deg, #2647a6 0%, #1e3a8a 100%); color: white; padding: 13px 28px; font-size: 1rem; border-radius: 10px;">
              <i class="fa fa-sign-out-alt mr-2"></i> Log Out
            </button>
          </div>
        </div>
      </div>
    `;
  }

  showNotification('Failed to submit exam. Please try again.', 'error', 5000);
}

// ============ LOGOUT ============
window.logout = function() {
  localStorage.removeItem('student_token');
  localStorage.removeItem('studentToken');
  localStorage.removeItem('token');
  localStorage.removeItem('studentId');
  localStorage.removeItem('studentClass');
  localStorage.removeItem('currentExamCode');
  window.location.href = '/cbt-login.html';
};

// Prevent accidental navigation away during exam
window.addEventListener('beforeunload', (e) => {
  if (exam && !examAttempted && timerInterval) {
    e.preventDefault();
    e.returnValue = '';
  }
});

/* ==========================================================
   MULTI-SCHOOL REPORT CONFIGURATION
   Loads the school associated with the current report and keeps
   the page tenant-safe.
   ========================================================== */
const API_ROOT = String(
  window.API_BASE_URL ||
  window.BACKEND_URL ||
  localStorage.getItem('BACKEND_URL') ||
  localStorage.getItem('API_BASE_URL') ||
  'https://examguard-8rxe.onrender.com'
).replace(/\/+$/, '');

const SCHOOL_CACHE_KEY = 'currentSchoolConfig';
const SCHOOL_ID_KEY = 'schoolId';
const SCHOOL_SUBDOMAIN_KEY = 'schoolSubdomain';

function normalizeSchoolConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const candidates = [
    raw.school,
    raw.data?.school,
    raw.data,
    raw.config,
    raw
  ];

  return candidates.find(item => {
    if (!item || typeof item !== 'object') return false;

    return (
      item._id ||
      item.id ||
      item.schoolId ||
      item.schoolCode ||
      item.subdomain ||
      item.schoolName ||
      item.name ||
      item.branding
    );
  }) || null;
}

function getTenantSubdomain() {
  const saved = localStorage.getItem(SCHOOL_SUBDOMAIN_KEY);
  if (saved && String(saved).trim()) return String(saved).trim().toLowerCase();

  const host = window.location.hostname.toLowerCase().replace(/^www\./, '');
  const baseDomain = 'goldlincschools.com.ng';

  if (host === baseDomain) return '';
  if (host.endsWith(`.${baseDomain}`)) {
    const subdomain = host.slice(0, -(baseDomain.length + 1));
    if (subdomain && !subdomain.includes('.')) return subdomain.toLowerCase();
  }

  if (host === 'localhost' || host === '127.0.0.1') {
    const query = new URLSearchParams(window.location.search);
    const school = query.get('school');
    return school ? school.trim().toLowerCase() : '';
  }

  const query = new URLSearchParams(window.location.search);
  const school = query.get('school');
  if (school) return school.trim().toLowerCase();

  return '';
}

function readCachedSchoolConfig() {
  try {
    const raw = localStorage.getItem(SCHOOL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeSchoolConfig(parsed);
  } catch (e) {
    return null;
  }
}

function writeCachedSchoolConfig(school) {
  try {
    if (!school) return;
    localStorage.setItem(SCHOOL_CACHE_KEY, JSON.stringify(school));
    const id = school._id || school.schoolId || school.id;
    if (id) localStorage.setItem(SCHOOL_ID_KEY, String(id));
    const subdomain = String(school.subdomain || getTenantSubdomain() || '').trim().toLowerCase();
    if (subdomain) localStorage.setItem(SCHOOL_SUBDOMAIN_KEY, subdomain);
  } catch (e) {
    console.warn('Unable to cache school config:', e);
  }
}

function firstConfigValue(...values) {
  return values.find(value =>
    value !== undefined && value !== null && String(value).trim() !== ''
  );
}

function setTextIfPresent(selector, value) {
  const element = document.querySelector(selector);
  if (element && value !== undefined && value !== null && String(value).trim()) {
    element.textContent = String(value);
  }
}

function setImageIfPresent(element, source, fallback) {
  if (!element) return;
  const value = firstConfigValue(source, fallback);
  if (value) {
    element.src = value;
    element.onerror = () => {
      if (fallback && element.src !== fallback) element.src = fallback;
      else element.style.display = 'none';
    };
  }
}

function getReportSchoolContext() {
  const reportData = loadReportData() || {};
  const savedSubdomain = localStorage.getItem(SCHOOL_SUBDOMAIN_KEY) || '';
  const savedSchoolId = localStorage.getItem(SCHOOL_ID_KEY) || '';

  const subdomain = (
    savedSubdomain ||
    reportData.schoolSubdomain ||
    reportData.subdomain ||
    getTenantSubdomain()
  );

  const schoolId = (
    savedSchoolId ||
    localStorage.getItem('schoolCode') ||
    localStorage.getItem('schoolId') ||
    reportData.schoolId ||
    reportData.schoolCode ||
    reportData.school?.id ||
    reportData.school?._id ||
    ''
  );

  const token = localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('accessToken') ||
    '';

  return { subdomain, schoolId, token, reportData };
}

function getSchoolAddress(school) {
  const schoolInfo = school.school || {};
  const location =
    school.location ||
    school.addressInfo ||
    schoolInfo.location ||
    {};
  const contact = school.contact || school.contactInfo || {};

  const addressLine = firstConfigValue(
    location.fullAddress,
    school.fullAddress,
    location.address,
    location.streetAddress,
    location.addressLine1,
    location.street,
    school.address,
    school.schoolAddress,
    contact.address
  );

  const parts = [
    addressLine,
    location.addressLine2,
    location.city,
    location.state,
    location.postalCode,
    location.zipCode,
    location.country
  ]
    .filter(value => value !== undefined && value !== null)
    .map(value => String(value).trim())
    .filter(Boolean);

  // Avoid repeating city/state/country when they already appear in the address.
  const uniqueParts = [];
  for (const part of parts) {
    const alreadyIncluded = uniqueParts.some(existing =>
      existing.toLowerCase() === part.toLowerCase()
    );
    if (!alreadyIncluded) uniqueParts.push(part);
  }

  return uniqueParts.join(', ');
}

function getSchoolContact(school) {
  const contact = school.contact || school.contactInfo || {};
  const email = firstConfigValue(school.email, contact.email);
  const phone = firstConfigValue(school.phone, contact.phone, contact.mobile);
  return [
    email ? `Email: ${email}` : '',
    phone ? `Phone: ${phone}` : ''
  ].filter(Boolean).join(' | ');
}

function applySchoolConfig(school) {
  if (!school) return;

  const branding = school.branding || {};
  const academic = school.academicConfig || school.academic || {};
  const contact = school.contact || school.contactInfo || {};
  const logo = firstConfigValue(
    branding.logo,
    branding.logoUrl,
    school.logo,
    school.logoUrl,
    school.schoolLogo
  );
  const watermark = firstConfigValue(
    branding.watermark,
    school.watermark,
    logo
  );
  const stamp = firstConfigValue(
    branding.schoolStamp,
    school.schoolStamp,
    school.stamp
  );

  const header = document.querySelector('.report-header');
  if (header) {
    const headerImages = header.querySelectorAll('img');
    setImageIfPresent(headerImages[0], logo, 'arm.jpg');
    setImageIfPresent(headerImages[1], logo, 'mainlogo.png');
  }

  setTextIfPresent('.school-name', firstConfigValue(
    school.schoolName,
    school.name,
    school.institutionName
  ));
  setTextIfPresent('.school-location', getSchoolAddress(school));
  setTextIfPresent('.school-contact', getSchoolContact(school));

  const motto = firstConfigValue(
    school.motto,
    school.tagline,
    school.schoolMotto
  );
  const mottoElement = document.querySelector('.motto');
  if (mottoElement && motto) mottoElement.textContent = `Motto: ${motto}`;

  const watermarkImage = document.querySelector('.watermark-img');
  if (watermarkImage && watermark) setImageIfPresent(watermarkImage, watermark);

  const sealImage = document.querySelector('.seal-image');
  if (sealImage && stamp) setImageIfPresent(sealImage, stamp, 'seal.jpg');

  const stampImage = document.querySelector('.stamp-image');
  if (stampImage && stamp) setImageIfPresent(stampImage, stamp);

  const primary = firstConfigValue(
    branding.primaryColor,
    branding.primary,
    school.primaryColor
  );
  const secondary = firstConfigValue(
    branding.secondaryColor,
    branding.secondary,
    school.secondaryColor
  );
  const accent = firstConfigValue(
    branding.accentColor,
    branding.accent,
    school.accentColor
  );

  if (primary) document.documentElement.style.setProperty('--school-primary', primary);
  if (secondary) document.documentElement.style.setProperty('--school-secondary', secondary);
  if (accent) document.documentElement.style.setProperty('--school-accent', accent);

  const reportSettings = school.reportSettings || school.reportConfig || {};
  const principal = school.principal || school.principalInfo || {};

  window.currentSchoolConfig = school;
  window.currentSchoolAcademicConfig = academic;
  window.currentSchoolReportSettings = reportSettings;
  window.currentSchoolPrincipal = principal;

  window.currentSchoolDefaults = {
    session: firstConfigValue(academic.currentSession, school.currentSession),
    term: firstConfigValue(academic.currentTerm, school.currentTerm),
    nextTermDate: firstConfigValue(
      academic.nextTermBeginDate,
      academic.nextTermDate,
      school.nextTermBeginDate,
      school.nextTermDate
    ),
    principalName: firstConfigValue(
      principal.name,
      principal.fullName,
      school.principalName,
      reportSettings.principalName
    ),
    principalSignature: firstConfigValue(
      principal.signature,
      principal.signatureUrl,
      branding.principalSignature,
      reportSettings.principalSignature
    )
  };

  writeCachedSchoolConfig(school);
}

function getConfiguredGradeFromPercentage(percentage) {
  const scale = window.currentSchoolAcademicConfig?.gradingScale;
  if (!scale) return calculateGradeFromPercentage(percentage);

  const pct = Number(percentage);
  let entries = [];

  if (Array.isArray(scale)) {
    entries = scale.map(item => ({
      grade: firstConfigValue(item.grade, item.name, item.label, item.code),
      min: Number(firstConfigValue(item.minScore, item.minimum, item.min, item.from, item.lowerBound)),
      max: Number(firstConfigValue(item.maxScore, item.maximum, item.max, item.to, item.upperBound))
    }));
  } else if (typeof scale === 'object') {
    entries = Object.entries(scale).map(([grade, value]) => {
      if (typeof value === 'number') return { grade, min: value, max: 100 };
      return {
        grade,
        min: Number(firstConfigValue(value?.minScore, value?.minimum, value?.min, value?.from, value?.lowerBound)),
        max: Number(firstConfigValue(value?.maxScore, value?.maximum, value?.max, value?.to, value?.upperBound))
      };
    });
  }

  const match = entries.find(item =>
    item.grade &&
    Number.isFinite(item.min) &&
    pct >= item.min &&
    (!Number.isFinite(item.max) || pct <= item.max)
  );

  return match?.grade || calculateGradeFromPercentage(percentage);
}

function renderConfiguredGradeScale() {
  const scale = window.currentSchoolAcademicConfig?.gradingScale;
  const table = document.getElementById('gradeScaleTable');
  if (!table || !scale) return;

  let entries = [];
  if (Array.isArray(scale)) {
    entries = scale.map(item => ({
      grade: firstConfigValue(item.grade, item.name, item.label, item.code),
      min: firstConfigValue(item.minScore, item.minimum, item.min, item.from, item.lowerBound),
      max: firstConfigValue(item.maxScore, item.maximum, item.max, item.to, item.upperBound),
      remark: firstConfigValue(item.remark, item.remarks, item.description)
    }));
  } else if (typeof scale === 'object') {
    entries = Object.entries(scale).map(([grade, value]) => ({
      grade,
      min: typeof value === 'number' ? value : firstConfigValue(value?.minScore, value?.minimum, value?.min, value?.from),
      max: typeof value === 'number' ? 100 : firstConfigValue(value?.maxScore, value?.maximum, value?.max, value?.to),
      remark: typeof value === 'object' ? firstConfigValue(value?.remark, value?.remarks, value?.description) : ''
    }));
  }

  if (!entries.length) return;

  table.innerHTML = entries.map(item => {
    const range = item.min !== undefined && item.max !== undefined
      ? `${item.min}-${item.max}%`
      : (item.min !== undefined ? `${item.min}% and above` : '-');

    const grade = String(item.grade || '-');
    return `<tr><td style="font-weight:700;">${grade}</td><td>${range}</td></tr>`;
  }).join('');
}

function clearStaticSchoolBranding() {
  const name = document.querySelector('.school-name');
  const location = document.querySelector('.school-location');
  const contact = document.querySelector('.school-contact');
  const motto = document.querySelector('.motto');

  if (name) name.textContent = 'School name unavailable';
  if (location) location.textContent = '';
  if (contact) contact.textContent = '';
  if (motto) motto.textContent = '';

  document.querySelectorAll('.report-header img, .watermark-img, .seal-image, .stamp-image')
    .forEach(img => {
      img.removeAttribute('src');
      img.style.display = 'none';
    });
}

async function fetchCurrentSchoolConfig() {
  const context = getReportSchoolContext();

  const cached = readCachedSchoolConfig();
  if (cached && !context.subdomain && !context.schoolId) {
    return cached;
  }

  const headers = { Accept: 'application/json' };
  if (context.token) headers.Authorization = `Bearer ${context.token}`;

  const attempts = [];
  const seenUrls = new Set();

  if (context.schoolId) {
    attempts.push(
      `${API_ROOT}/api/schools/config?schoolId=${encodeURIComponent(context.schoolId)}`
    );
  }

  if (context.subdomain) {
    attempts.push(
      `${API_ROOT}/api/schools/config?subdomain=${encodeURIComponent(context.subdomain)}`
    );
  }

  const possibleReportSchool = context.reportData?.school || null;
  if (possibleReportSchool && (possibleReportSchool._id || possibleReportSchool.id || possibleReportSchool.schoolId)) {
    attempts.push(
      `${API_ROOT}/api/schools/config?schoolId=${encodeURIComponent(
        possibleReportSchool._id || possibleReportSchool.id || possibleReportSchool.schoolId
      )}`
    );
  }

  for (const url of attempts) {
    if (!url || seenUrls.has(url)) continue;
    seenUrls.add(url);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        console.warn(`School config fetch failed (${response.status}) for ${url}`);
        continue;
      }

      const payload = await response.json();
      const school = normalizeSchoolConfig(payload);

      if (!school) {
        console.warn('School config response was empty:', payload);
        continue;
      }

      const expectedSchoolId =
        context.reportData?.schoolId ||
        context.reportData?.school?._id ||
        context.reportData?.school?.id ||
        context.reportData?.school?.schoolId ||
        context.schoolId;

      const returnedSchoolId = school._id || school.id || school.schoolId;

      if (expectedSchoolId && returnedSchoolId && String(expectedSchoolId) !== String(returnedSchoolId)) {
        console.warn('Returned school config does not match report context:', {
          expectedSchoolId,
          returnedSchoolId,
          subdomain: context.subdomain,
          url
        });
        continue;
      }

      writeCachedSchoolConfig(school);
      return school;
    } catch (error) {
      console.warn('School configuration could not be loaded:', error);
    }
  }

  if (cached) {
    return cached;
  }

  return null;
}

async function initializeReport() {
  const school = await fetchCurrentSchoolConfig();

  if (school) {
    applySchoolConfig(school);
    renderConfiguredGradeScale();
  } else {
    clearStaticSchoolBranding();
  }

  populateReport();
  window.reportPopulationComplete = true;
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (error) {
    return dateStr;
  }
}

function calculateAge(dobStr) {
  if (!dobStr) return '-';
  try {
    const today = new Date();
    const birthDate = new Date(dobStr);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  } catch (error) {
    return '-';
  }
}

function getGradeDistribution(results) {
  const grades = ['A', 'B', 'C', 'D', 'E', 'F'];
  const distribution = {};

  grades.forEach(grade => distribution[grade] = 0);

  results.forEach(r => {
    if (r.grade && Object.prototype.hasOwnProperty.call(distribution, r.grade)) {
      distribution[r.grade]++;
    }
  });

  return distribution;
}

function isPassingGrade(grade) {
  const passingGrades = ['A', 'B', 'C', 'D'];
  return passingGrades.includes(grade);
}

function determineAcademicStatus(percentage, failCount) {
  if (failCount > 0) return 'At Risk';
  if (percentage >= 85) return 'Honors';
  if (percentage >= 75) return 'Excellent';
  if (percentage >= 65) return 'Good';
  if (percentage >= 50) return 'Satisfactory';
  return 'Needs Support';
}

function calculateAttendancePercentage(attendance) {
  if (!attendance || !attendance.timesPresent || !attendance.schoolOpened) {
    return 0;
  }

  const present = parseInt(attendance.timesPresent, 10) || 0;
  const total = parseInt(attendance.schoolOpened, 10) || 0;

  if (total === 0) return 0;
  return ((present / total) * 100).toFixed(1);
}

function calculateGradeFromPercentage(percentage) {
  const pct = parseFloat(percentage);

  if (pct >= 85) return 'A1';
  else if (pct >= 75) return 'B2';
  else if (pct >= 70) return 'B3';
  else if (pct >= 65) return 'C4';
  else if (pct >= 60) return 'C5';
  else if (pct >= 50) return 'C6';
  else if (pct >= 45) return 'D7';
  else if (pct >= 40) return 'E8';
  else return 'F9';
}

function extractRemark(data, fieldPath) {
  if (!data || !fieldPath) return '-';

  const paths = fieldPath.split('.');
  let value = data;

  for (const path of paths) {
    if (value && typeof value === 'object') {
      value = value[path];
    } else {
      return '-';
    }
  }

  if (typeof value === 'object' && value !== null) {
    if (value.text) return String(value.text).trim();
    if (value.content) return String(value.content).trim();
    if (value.remark) return String(value.remark).trim();
    if (value.comment) return String(value.comment).trim();
    if (value.value) return String(value.value).trim();
    return String(value).trim();
  }

  if (typeof value === 'string') return value.trim();
  return value ? String(value).trim() : '-';
}

function loadReportData() {
  try {
    const reportDataStr = sessionStorage.getItem('reportData');

    if (!reportDataStr) {
      const fallbackStr = localStorage.getItem('lastReportData');
      if (fallbackStr) {
        const data = JSON.parse(fallbackStr);
        return data;
      }
      return null;
    }

    const data = JSON.parse(reportDataStr);
    return data;
  } catch (error) {
    console.error('❌ Error loading report data:', error);
    return null;
  }
}

function applyDynamicFontSizing(resultCount) {
  const table = document.getElementById('resultsTable');

  if (!table) return;

  table.classList.remove('subjects-5', 'subjects-6-8', 'subjects-9-11', 'subjects-12', 'subjects-13-plus');

  if (resultCount <= 5) {
    table.classList.add('subjects-5');
  } else if (resultCount <= 8) {
    table.classList.add('subjects-6-8');
  } else if (resultCount <= 11) {
    table.classList.add('subjects-9-11');
  } else if (resultCount <= 12) {
    table.classList.add('subjects-12');
  } else {
    table.classList.add('subjects-13-plus');
  }
}

function generateQRCode(student, session) {
  const qrData = `
Name: ${student?.name || ''}
RegNo: ${student?.regNo || ''}
Class: ${student?.class?.name || student?.class || ''}
Session: ${session || ''}
Verify: https://verification.examguard.com.ng/verify
  `.trim();

  const container = document.getElementById('qrCode');

  if (!container || !qrData) return;

  container.innerHTML = '';

  new QRCode(container, {
    text: qrData,
    width: 70,
    height: 70
  });
}

function setSignatureImages(data) {
  const teacherSigImg = document.getElementById('teacherSigImage');
  if (data.teacherSignatureBase64) {
    teacherSigImg.src = 'data:image/jpeg;base64,' + data.teacherSignatureBase64;
  } else {
    teacherSigImg.src = 'https://signaturely.com/wp-content/uploads/2020/04/just-a-nickname-signaturely-image.svg';
  }

  const principalSigImg = document.getElementById('principalSigImage');
  if (data.principalSignatureBase64) {
    principalSigImg.src = 'data:image/jpeg;base64,' + data.principalSignatureBase64;
  } else if (data.principalSignatureUrl) {
    principalSigImg.src = data.principalSignatureUrl;
  } else {
    principalSigImg.src = 'https://signaturely.com/wp-content/uploads/2020/04/downward-angle-signaturely.svg';
  }
}

function populateReport() {
  const data = loadReportData();
  if (!data) {
    const tbody = document.getElementById('resultsTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:10px; color:red;">Error: No data available</td></tr>';
    }
    return;
  }

  const results = data.results || [];
  const student = data.student || {};
  const skills = data.skills || {};
  const attendance = data.attendance || {};
  const skillsReport = data.skillsReport || {};

  const schoolDefaults = window.currentSchoolDefaults || {};
  const reportSession = firstConfigValue(data.session, schoolDefaults.session, '-');
  const term = firstConfigValue(data.term, schoolDefaults.term, '');

  applyDynamicFontSizing(results.length);

  document.getElementById('profileName').textContent = student.name || '-';
  document.getElementById('profileAdmNo').textContent = student.regNo || '-';
  document.getElementById('profileClass').textContent = student.class?.name || student.class || '-';
  document.getElementById('profileSession').textContent = reportSession;
  document.getElementById('profileDOB').textContent = formatDate(student.DOB);
  document.getElementById('profileAge').textContent = calculateAge(student.DOB);
  document.getElementById('profileSex').textContent = student.gender || '-';
  document.getElementById('profileEmail').textContent = student.email || '-';

  const photoEl = document.getElementById('profilePhoto');
  if (student.photoBase64) {
    photoEl.src = student.photoBase64.startsWith('data:')
      ? student.photoBase64
      : `data:image/jpeg;base64,${student.photoBase64}`;
  } else {
    photoEl.src = 'avatar.jpg';
  }

  let totalScore = 0;
  let highestScore = 0;
  let lowestScore = Infinity;
  let passCount = 0;
  let failCount = 0;

  results.forEach(r => {
    const score = parseInt(r.total, 10) || 0;
    totalScore += score;
    if (score > highestScore) highestScore = score;
    if (score < lowestScore) lowestScore = score;

    if (isPassingGrade(r.grade)) {
      passCount++;
    } else {
      failCount++;
    }
  });

  if (lowestScore === Infinity) lowestScore = 0;

  const totalObtainable = results.length * 100;
  const percentage = totalObtainable > 0 ? ((totalScore / totalObtainable) * 100).toFixed(2) : 0;

  const attendancePercentage = calculateAttendancePercentage(attendance);
  const academicStatus = determineAcademicStatus(percentage, failCount);
  const overallGrade = getConfiguredGradeFromPercentage(percentage);

  document.getElementById('reportTitleEl').textContent = `${term || 'TERM'} STUDENT'S PERFORMANCE REPORT`;
  document.getElementById('termLabelProfile').textContent = term || 'TERM';

  const tbody = document.getElementById('resultsTableBody');
  tbody.innerHTML = '';

  results.forEach(r => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:left;">${r.subject || '-'}</td>
      <td class="tc">${r.ca1_score || '-'}</td>
      <td class="tc">${r.ca2_score || '-'}</td>
      <td class="tc">${r.exam_score || '-'}</td>
      <td class="tc" style="font-weight:700;">${r.total || 0}</td>
      <td class="tc" style="font-weight:700;">${r.grade || '-'}</td>
      <td class="tc">${r.remarks || '-'}</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById('totalPassed').textContent = passCount;
  document.getElementById('totalFailed').textContent = failCount;

  let statusElement = document.getElementById('overallStatus');
  let statusText = '';
  let statusClass = '';

  if (failCount > 0) {
    statusText = 'FAILED';
    statusClass = 'failed';
  } else if (term && term.toUpperCase().includes('TERM 3') && student.class) {
    const classNameLower = (student.class?.name || student.class || '').toLowerCase();
    const isBeforeSS3 = !classNameLower.includes('ss3') && !classNameLower.includes('form 3');

    if (isBeforeSS3) {
      statusText = 'PROMOTED';
      statusClass = 'promoted';
    } else {
      statusText = 'PASSED';
      statusClass = 'passed';
    }
  } else {
    statusText = 'PASSED';
    statusClass = 'passed';
  }

  statusElement.textContent = statusText;
  statusElement.className = `pass-status ${statusClass}`;

  document.getElementById('overallPercentage').textContent = percentage + '%';
  document.getElementById('overallGrade').textContent = overallGrade;
  document.getElementById('attendanceRate').textContent = attendancePercentage + '%';
  document.getElementById('academicStatus').textContent = academicStatus;

  document.getElementById('totalObtained').textContent = totalScore.toFixed(1);
  document.getElementById('totalObtainable').textContent = totalObtainable;
  document.getElementById('totalSubjectsPerf').textContent = results.length;
  document.getElementById('percentagePerf').textContent = percentage + '%';
  document.getElementById('gradePerf').textContent = overallGrade;

  const position = data.studentPosition ? `${data.studentPosition}` : '-';
  document.getElementById('positionPerf').textContent = position;

  const distribution = getGradeDistribution(results);
  const grades = ['A', 'B', 'C', 'D', 'E', 'F'];

  let gradeCountsRow = '<tr>';
  let gradeValuesRow = '<tr>';

  grades.forEach(grade => {
    gradeCountsRow += `<td class="tc" style="border:1px solid #000; font-weight:700; padding:1px;">${grade}</td>`;
    gradeValuesRow += `<td class="tc" style="border:1px solid #000; padding:1px;">${distribution[grade]}</td>`;
  });

  gradeCountsRow += '</tr>';
  gradeValuesRow += '</tr>';

  document.getElementById('gradeCountsRow').innerHTML = gradeCountsRow;
  document.getElementById('gradeValuesRow').innerHTML = gradeValuesRow;

  const affectiveTable = document.getElementById('affectiveTable');
  const affectiveMap = {
    'attentiveness': 'Attentiveness',
    'honesty': 'Honesty',
    'neatness': 'Neatness',
    'politeness': 'Politeness',
    'punctuality': 'Punctuality / Assembly',
    'selfControl': 'Self Control / Calmness'
  };

  for (const [key, label] of Object.entries(affectiveMap)) {
    const value = skills[key] || 0;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:left;">${label}</td>
      <td class="tc">${value === 5 ? '✓' : ''}</td>
      <td class="tc">${value === 4 ? '✓' : ''}</td>
      <td class="tc">${value === 3 ? '✓' : ''}</td>
      <td class="tc">${value === 2 ? '✓' : ''}</td>
      <td class="tc">${value === 1 ? '✓' : ''}</td>
    `;
    affectiveTable.appendChild(row);
  }

  const psychomotorTable = document.getElementById('psychomotorTable');
  const psychomotorMap = {
    'handling': 'Handling Of Tools',
    'drawing': 'Drawing / Painting',
    'handwriting': 'Handwriting',
    'speaking': 'Public Speaking',
    'fluency': 'Speech Fluency'
  };

  for (const [key, label] of Object.entries(psychomotorMap)) {
    const value = skills[key] || 0;

    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:left;">${label}</td>
      <td class="tc">${value === 5 ? '✓' : ''}</td>
      <td class="tc">${value === 4 ? '✓' : ''}</td>
      <td class="tc">${value === 3 ? '✓' : ''}</td>
      <td class="tc">${value === 2 ? '✓' : ''}</td>
      <td class="tc">${value === 1 ? '✓' : ''}</td>
    `;
    psychomotorTable.appendChild(row);
  }

  console.log('📍 Processing Attendance:', attendance);
  document.getElementById('schoolOpened').textContent = attendance.schoolOpened || '-';
  document.getElementById('timesPresent').textContent = attendance.timesPresent || '-';
  document.getElementById('timesAbsent').textContent = attendance.timesAbsent || '-';

  console.log('💬 Processing remarks...');

  let teacherRemarkValue = extractRemark(data, 'teacherComment') ||
    extractRemark(data, 'teacherRemark') ||
    extractRemark(skillsReport, 'teacherRemark') ||
    'No remark';

  let principalRemarkValue = extractRemark(data, 'principalComment') ||
    extractRemark(data, 'principalRemark') ||
    extractRemark(skillsReport, 'principalComment') ||
    extractRemark(skillsReport, 'comment') ||
    'No remark';

  document.getElementById('teacherRemark').textContent = teacherRemarkValue;
  document.getElementById('principalRemark').textContent = principalRemarkValue;

  document.getElementById('teacherName').textContent = data.teacherName || 'Teacher';
  document.getElementById('principalName').textContent = data.principalName || schoolDefaults.principalName || 'Principal';

  setSignatureImages({ ...data, principalSignatureUrl: data.principalSignatureUrl || schoolDefaults.principalSignature });

  try {
    generateQRCode(student, reportSession);
  } catch (error) {
    console.warn('⚠️ QR code generation failed:', error);
  }

  document.getElementById('nextTermDate').textContent = formatDate(firstConfigValue(data.nextTermDate, schoolDefaults.nextTermDate)) || '-';
  document.getElementById('dateIssued').textContent = formatDate(data.dateIssued) || formatDate(new Date().toISOString());

  console.log('✅ Report population completed successfully!');
}

document.addEventListener('DOMContentLoaded', initializeReport);

window.addEventListener('load', () => {
  const waitForReport = () => {
    if (window.reportPopulationComplete) {
      setTimeout(() => window.print(), 500);
    } else {
      setTimeout(waitForReport, 100);
    }
  };
  waitForReport();
});

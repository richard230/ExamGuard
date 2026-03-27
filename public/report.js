
    // Helper: Format date
    function formatDate(dateStr) {
      if (!dateStr) return '-';
      try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
      } catch (e) {
        return dateStr;
      }
    }

    // Helper: Calculate age from DOB
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
      } catch (e) {
        return '-';
      }
    }

    // Get grade distribution
    function getGradeDistribution(results) {
      const grades = ['A', 'B', 'C', 'D', 'E', 'F'];
      const distribution = {};
      
      grades.forEach(grade => distribution[grade] = 0);
      
      results.forEach(r => {
        if (r.grade && distribution.hasOwnProperty(r.grade)) {
          distribution[r.grade]++;
        }
      });

      return distribution;
    }

    // Check if grade is passing
    function isPassingGrade(grade) {
      const passingGrades = ['A', 'B', 'C', 'D'];
      return passingGrades.includes(grade);
    }

    // Load report data from sessionStorage
    function loadReportData() {
      try {
        const reportDataStr = sessionStorage.getItem('reportData');
        console.log('SessionStorage data:', reportDataStr);
        
        if (!reportDataStr) {
          console.error('No report data found in sessionStorage');
          return null;
        }

        const data = JSON.parse(reportDataStr);
        console.log('Parsed data:', data);
        return data;
      } catch (error) {
        console.error('Error loading report data:', error);
        return null;
      }
    }

    // Apply dynamic font sizing based on number of subjects
    function applyDynamicFontSizing(resultCount) {
      const table = document.getElementById('resultsTable');
      table.classList.remove('subjects-5', 'subjects-6-8', 'subjects-9-12', 'subjects-13-plus');
      
      if (resultCount <= 5) {
        table.classList.add('subjects-5');
      } else if (resultCount <= 8) {
        table.classList.add('subjects-6-8');
      } else if (resultCount <= 12) {
        table.classList.add('subjects-9-12');
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

  const container = document.getElementById("qrCode");

  if (!container || !qrData) return;

  container.innerHTML = ""; // clear previous

  new QRCode(container, {
    text: qrData,
    width: 70,
    height: 70
  });
}
    // Set signature images with fallback to static seal
    function setSignatureImages(data) {
      // Teacher signature
      const teacherSigImg = document.getElementById('teacherSigImage');
      if (data.teacherSignatureBase64) {
        teacherSigImg.src = 'data:image/jpeg;base64,' + data.teacherSignatureBase64;
      } else {
        // Keep default seal.jpg for fallback
        teacherSigImg.src = 'https://signaturely.com/wp-content/uploads/2020/04/downward-angle-signaturely.svg';
      }

      // Principal signature
      const principalSigImg = document.getElementById('principalSigImage');
      if (data.principalSignatureBase64) {
        principalSigImg.src = 'data:image/jpeg;base64,' + data.principalSignatureBase64;
      } else {
        // Keep default seal.jpg for fallback
        principalSigImg.src = 'https://signaturely.com/wp-content/uploads/2020/04/just-a-nickname-signaturely.svg';
      }
    }

    // Populate report
    function populateReport() {
      const data = loadReportData();
      if (!data) {
        document.getElementById('resultsTableBody').innerHTML = '<tr><td colspan="9" style="text-align:center; padding:10px; color:red;">Error: No data available</td></tr>';
        return;
      }

      const results = data.results || [];
      const student = data.student || {};
      const skillsReport = data.skillsReport || {};
      const classSize = data.classSize || 0;
      const term = data.term || '';

      console.log('Populating with results:', results);
      console.log('Student:', student);
      console.log('Skills:', skillsReport);

      // Apply dynamic sizing based on number of results
      applyDynamicFontSizing(results.length);

      // Populate profile
      document.getElementById('profileName').textContent = student.name || '-';
      document.getElementById('profileAdmNo').textContent = student.regNo || '-';
      document.getElementById('profileClass').textContent = student.class?.name || student.class || '-';
      document.getElementById('profileSession').textContent = data.session || '-';
      document.getElementById('profileDOB').textContent = formatDate(student.DOB);
      document.getElementById('profileAge').textContent = calculateAge(student.DOB);
      document.getElementById('profileSex').textContent = student.gender || '-';
      document.getElementById('profileEmail').textContent = student.email || '-';
      document.getElementById('classSize').textContent = classSize;

 const photoEl = document.getElementById('profilePhoto');

if (student.photoBase64) {
  photoEl.src = student.photoBase64.startsWith('data:')
    ? student.photoBase64
    : `data:image/jpeg;base64,${student.photoBase64}`;
} else {
  photoEl.src = 'avatar.jpg';
}
      // Calculate statistics
      let totalScore = 0, highestScore = 0, lowestScore = Infinity;
      let passCount = 0, failCount = 0;

      results.forEach(r => {
        const score = parseInt(r.total) || 0;
        totalScore += score;
        if (score > highestScore) highestScore = score;
        if (score < lowestScore) lowestScore = score;

        // Count pass/fail
        if (isPassingGrade(r.grade)) {
          passCount++;
        } else {
          failCount++;
        }
      });

      if (lowestScore === Infinity) lowestScore = 0;

      const totalObtainable = results.length * 100;
      const percentage = totalObtainable > 0 ? ((totalScore / totalObtainable) * 100).toFixed(2) : 0;

      // Populate term info
      document.getElementById('reportTitleEl').textContent = `${data.term || 'TERM'} STUDENT'S PERFORMANCE REPORT`;
      document.getElementById('termLabelProfile').textContent = data.term || 'TERM';

      // Populate results table
      const tbody = document.getElementById('resultsTableBody');
      tbody.innerHTML = '';

      results.forEach(r => {
        const row = document.createElement('tr');
        row.innerHTML = `
          <td style="text-align:left;">${r.subject || '-'}</td>
          <td class="tc">${r.ca1_score || '-'}</td>
          <td class="tc">${r.ca2_score || '-'}</td>
          <td class="tc">${r.midterm_score || '-'}</td>
          <td class="tc">${r.exam_score || '-'}</td>
          <td class="tc" style="font-weight:700;">${r.total || 0}</td>
          <td class="tc" style="font-weight:700;">${r.grade || '-'}</td>
          <td class="tc">${r.remarks || '-'}</td>
        `;
        tbody.appendChild(row);
      });

      // Populate pass/fail summary
      document.getElementById('totalPassed').textContent = passCount;
      document.getElementById('totalFailed').textContent = failCount;

      // Determine overall status
      let statusElement = document.getElementById('overallStatus');
      let statusText = '';
      let statusClass = '';

      if (failCount > 0) {
        statusText = 'FAILED';
        statusClass = 'failed';
      } else if (term && term.toUpperCase().includes('TERM 3') && student.class) {
        // Check if it's term 3 and below SS3
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

      // Populate performance summary
      document.getElementById('totalObtained').textContent = totalScore.toFixed(1);
      document.getElementById('totalObtainable').textContent = totalObtainable;
      document.getElementById('totalSubjectsPerf').textContent = results.length;
      document.getElementById('percentagePerf').textContent = percentage + '%';
      document.getElementById('overallPercentage').textContent = percentage + '%';

      // Get overall grade
      const overallGrade = results.length > 0 ? results[0].grade : '-';
      document.getElementById('gradePerf').textContent = overallGrade;
      document.getElementById('overallGrade').textContent = overallGrade;

      // Position
      const position = data.studentPosition ? `${data.studentPosition} of ${classSize}` : `-`;
      document.getElementById('positionPerf').textContent = position;
      document.getElementById('overallPosition').textContent = data.studentPosition || '-';

      // Grade analysis
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

      // Populate skills - Handle multiple data structure formats
      let affSkills = {};
      let psychSkills = {};
      let attendance = {};

      // Try nested structure first
      if (skillsReport.skills) {
        affSkills = skillsReport.skills.affective || {};
        psychSkills = skillsReport.skills.psychomotor || {};
      }
      
      // Fallback to flat structure
      if (Object.keys(affSkills).length === 0 && skillsReport.affectiveSkills) {
        affSkills = skillsReport.affectiveSkills;
      }
      if (Object.keys(psychSkills).length === 0 && skillsReport.psychomotorSkills) {
        psychSkills = skillsReport.psychomotorSkills;
      }

      // Get attendance
      attendance = skillsReport.attendance || data.attendance || {};

      // Affective Domain
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
        const value = affSkills[key] || 0;
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

      // Psychomotor Skills - Show ALL items
      const psychomotorTable = document.getElementById('psychomotorTable');
      const psychomotorMap = {
        'handling': 'Handling Of Tools',
        'drawing': 'Drawing / Painting',
        'handwriting': 'Handwriting',
        'speaking': 'Public Speaking',
        'fluency': 'Speech Fluency'
      };

      for (const [key, label] of Object.entries(psychomotorMap)) {
        const value = psychSkills[key] || 0;
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

      // Attendance
      document.getElementById('schoolOpened').textContent = attendance.schoolOpened || '-';
      document.getElementById('timesPresent').textContent = attendance.timesPresent || '-';
      document.getElementById('timesAbsent').textContent = attendance.timesAbsent || '-';

      // Remarks - Check both locations
      const teacherRemarkValue = skillsReport.teacherRemark || data.teacherRemark || 'No remark';
      const principalRemarkValue = skillsReport.comment || skillsReport.principalComment || data.principalComment || data.principalRemark || 'No remark';
      
      document.getElementById('teacherRemark').textContent = teacherRemarkValue;
      document.getElementById('principalRemark').textContent = principalRemarkValue;
      
      // Set names
      document.getElementById('teacherName').textContent = data.teacherName || 'Teacher';
      document.getElementById('principalName').textContent = data.principalName || 'Principal';
      
      // Set signature images with fallback to static seal.jpg
      setSignatureImages(data);
      generateQRCode(student, data.session);
      // Dates
      document.getElementById('nextTermDate').textContent = formatDate(data.nextTermDate) || '-';
      document.getElementById('dateIssued').textContent = formatDate(data.dateIssued) || formatDate(new Date().toISOString());
    }
document.addEventListener("DOMContentLoaded", () => {
  generateQRCode(student, data.session);
});
    // Initialize on page load
    document.addEventListener('DOMContentLoaded', populateReport);

    // Auto-print after a short delay
    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 500);
    });

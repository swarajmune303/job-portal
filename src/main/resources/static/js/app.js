const API_BASE = 'http://localhost:8085/api';

// Utility to handle JSON fetching
async function fetchJson(url, options = {}) {
    options.headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    // Prevent caching to ensure metrics are updated immediately
    options.cache = 'no-store';
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
    }
    return await response.json();
}

// --- Auth logic ---
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
            const user = await fetchJson(`${API_BASE}/auth/login`, {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            localStorage.setItem('user', JSON.stringify(user));
            if (user.role === 'SEEKER') window.location.href = 'seeker.html';
            else window.location.href = 'company.html';
        } catch (error) {
            alert('Login failed. Please check your credentials.');
        }
    });
}

const regRole = document.getElementById('regRole');
const seekerFields = document.getElementById('seekerFields');
if (regRole && seekerFields) {
    regRole.addEventListener('change', (e) => {
        if (e.target.value === 'SEEKER') {
            seekerFields.style.display = 'block';
        } else {
            seekerFields.style.display = 'none';
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const user = {
            name: document.getElementById('regName').value,
            email: document.getElementById('regEmail').value,
            password: document.getElementById('regPassword').value,
            role: document.getElementById('regRole').value,
            skills: document.getElementById('regRole').value === 'SEEKER' ? document.getElementById('regSkills').value : null
        };
        try {
            await fetchJson(`${API_BASE}/auth/register`, {
                method: 'POST',
                body: JSON.stringify(user)
            });
            alert('Registration successful! Please login.');
            const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
            modal.hide();
        } catch (error) {
            alert('Registration failed.');
        }
    });
}

// --- Forgot Password logic ---
const forgotPasswordForm = document.getElementById('forgotPasswordForm');
if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value;
        // Mocking the reset functionality since there's no backend endpoint
        alert(`A password reset link has been sent to ${email} (Mock)`);
        const modal = bootstrap.Modal.getInstance(document.getElementById('forgotPasswordModal'));
        modal.hide();
        forgotPasswordForm.reset();
    });
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

function setGreetingAndAvatar(user) {
    const greetingEl = document.getElementById('userGreeting');
    const avatarEl = document.getElementById('userAvatar');
    if (greetingEl) greetingEl.innerText = user.name;
    if (avatarEl && user.name) {
        avatarEl.innerText = user.name.charAt(0).toUpperCase();
    }
}

// --- Seeker logic ---
async function initSeekerDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'SEEKER') {
        logout(); return;
    }
    setGreetingAndAvatar(user);
    
    // Initialize saved jobs in localStorage if not present
    if (!localStorage.getItem(`savedJobs_${user.id}`)) {
        localStorage.setItem(`savedJobs_${user.id}`, JSON.stringify([]));
    }
    
    await loadJobs();
    await loadSeekerApplications(user.id);
    updateSeekerMetrics();
}

function createJobCardHTML(job) {
    const user = JSON.parse(localStorage.getItem('user'));
    const savedJobs = JSON.parse(localStorage.getItem(`savedJobs_${user.id}`)) || [];
    const isSaved = savedJobs.includes(job.id);
    
    const companyName = job.company ? job.company.name : 'Unknown Company';
    const logoChar = companyName.charAt(0).toUpperCase();
    
    const saveIcon = isSaved ? 'fas fa-heart text-danger' : 'far fa-heart text-muted';
    
    return `
        <div class="job-card" data-job-id="${job.id}">
            <div class="d-flex justify-content-between">
                <div class="job-company-logo">
                    ${logoChar}
                </div>
                <button class="btn btn-light rounded-circle p-2 shadow-sm border-0" onclick="toggleSaveJob(${job.id})" style="width: 40px; height: 40px;">
                    <i class="${saveIcon}" id="save-icon-${job.id}"></i>
                </button>
            </div>
            <h5 class="job-title">${job.title}</h5>
            <div class="company-name"><i class="fas fa-building me-1"></i> ${companyName}</div>
            <p class="job-desc">${job.description.length > 100 ? job.description.substring(0, 100) + '...' : job.description}</p>
            <div class="d-flex flex-wrap gap-2 mb-3">
                ${job.requiredSkills.split(',').map(skill => `<span class="badge-modern badge-gray">${skill.trim()}</span>`).join('')}
            </div>
            <div class="job-card-footer">
                <span class="text-muted small"><i class="fas fa-clock me-1"></i> Full Time</span>
                <button class="btn btn-modern btn-primary-custom btn-sm px-4" onclick="applyJob(${job.id})">Apply</button>
            </div>
        </div>
    `;
}

function toggleSaveJob(jobId) {
    const user = JSON.parse(localStorage.getItem('user'));
    let savedJobs = JSON.parse(localStorage.getItem(`savedJobs_${user.id}`)) || [];
    
    const icon = document.getElementById(`save-icon-${jobId}`);
    
    if (savedJobs.includes(jobId)) {
        savedJobs = savedJobs.filter(id => id !== jobId);
        if (icon) {
            icon.className = 'far fa-heart text-muted';
        }
    } else {
        savedJobs.push(jobId);
        if (icon) {
            icon.className = 'fas fa-heart text-danger';
        }
    }
    
    localStorage.setItem(`savedJobs_${user.id}`, JSON.stringify(savedJobs));
    updateSeekerMetrics();
    
    // If currently viewing saved jobs, re-render
    if (window.currentSeekerTab === 'saved') {
        showSavedJobs();
    }
}

async function loadJobs() {
    try {
        const jobs = await fetchJson(`${API_BASE}/jobs`);
        window.allJobs = jobs; // Cache jobs
        renderJobs(jobs);
    } catch (error) {
        console.error("Error loading jobs", error);
    }
}

function renderJobs(jobsArray) {
    const jobsList = document.getElementById('jobsList');
    jobsList.innerHTML = '';
    if (jobsArray.length === 0) {
        jobsList.innerHTML = '<div class="col-12"><p class="text-muted">No jobs found.</p></div>';
        return;
    }
    jobsArray.forEach(job => {
        jobsList.innerHTML += createJobCardHTML(job);
    });
}

async function searchJobs() {
    const query = document.getElementById('jobSearchInput').value;
    if (!query) {
        renderJobs(window.allJobs || []);
        return;
    }
    try {
        const jobs = await fetchJson(`${API_BASE}/jobs/search?query=${encodeURIComponent(query)}`);
        renderJobs(jobs);
    } catch (error) {
        console.error("Error searching jobs", error);
    }
}

async function applyJob(jobId) {
    const user = JSON.parse(localStorage.getItem('user'));
    try {
        await fetchJson(`${API_BASE}/applications?userId=${user.id}&jobId=${jobId}`, {
            method: 'POST'
        });
        alert('Applied successfully!');
        await loadSeekerApplications(user.id);
        updateSeekerMetrics();
    } catch (error) {
        alert('Application failed. You might have already applied or an error occurred.');
    }
}

async function loadSeekerApplications(userId) {
    try {
        const apps = await fetchJson(`${API_BASE}/applications/user/${userId}`);
        window.allApplications = apps; // Cache applications
        
        const appsList = document.getElementById('applicationsList');
        appsList.innerHTML = '';
        if (apps.length === 0) {
            appsList.innerHTML = '<p class="text-muted small">No applications yet.</p>';
            return;
        }
        apps.forEach(app => {
            let badgeClass = 'badge-gray';
            if (app.status === 'SCREENING') badgeClass = 'badge-blue';
            if (app.status === 'ASSESSMENT') badgeClass = 'badge-yellow';
            if (app.status === 'INTERVIEW') badgeClass = 'badge-purple';
            if (app.status === 'OFFER') badgeClass = 'badge-green';
            if (app.status === 'REJECTED') badgeClass = 'badge-red';

            const companyName = app.job.company ? app.job.company.name : '';
            appsList.innerHTML += `
                <div class="d-flex justify-content-between align-items-center p-3 border rounded-3 bg-white shadow-sm">
                    <div>
                        <h6 class="fw-bold mb-1">${app.job.title}</h6>
                        <p class="text-muted small mb-0"><i class="fas fa-building me-1"></i> ${companyName}</p>
                    </div>
                    <span class="badge-modern ${badgeClass}">${app.status}</span>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading applications", error);
    }
}

function updateSeekerMetrics() {
    const user = JSON.parse(localStorage.getItem('user'));
    const savedJobs = JSON.parse(localStorage.getItem(`savedJobs_${user.id}`)) || [];
    const apps = window.allApplications || [];
    
    const appliedCount = apps.length;
    const offerCount = apps.filter(app => app.status === 'OFFER').length;
    const savedCount = savedJobs.length;
    
    const appliedEl = document.getElementById('metric-applied');
    const savedEl = document.getElementById('metric-saved');
    const offersEl = document.getElementById('metric-offers');
    
    if (appliedEl) appliedEl.innerText = appliedCount;
    if (savedEl) savedEl.innerText = savedCount;
    if (offersEl) offersEl.innerText = offerCount;
}

// Sidebar Navigation Logic
function switchSeekerTab(tabName, event) {
    if (event) {
        event.preventDefault();
        // Update active class
        document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }
    
    window.currentSeekerTab = tabName;
    const mainTitle = document.getElementById('mainJobGridTitle');
    
    if (tabName === 'dashboard' || tabName === 'find') {
        mainTitle.innerText = tabName === 'dashboard' ? 'Recommended For You' : 'All Available Jobs';
        renderJobs(window.allJobs || []);
        document.getElementById('profileAndAppsSection').style.display = 'block';
    } 
    else if (tabName === 'saved') {
        mainTitle.innerText = 'Your Saved Jobs';
        showSavedJobs();
        document.getElementById('profileAndAppsSection').style.display = 'none';
    }
    else if (tabName === 'applications') {
        // Scroll to applications
        document.getElementById('profileAndAppsSection').style.display = 'block';
        document.getElementById('applicationsList').scrollIntoView({ behavior: 'smooth' });
    }
}

function showSavedJobs() {
    const user = JSON.parse(localStorage.getItem('user'));
    const savedJobsIds = JSON.parse(localStorage.getItem(`savedJobs_${user.id}`)) || [];
    const savedJobsData = (window.allJobs || []).filter(job => savedJobsIds.includes(job.id));
    renderJobs(savedJobsData);
}

async function uploadResume() {
    const fileInput = document.getElementById('resumeFile');
    if (fileInput.files.length === 0) {
        return;
    }
    const file = fileInput.files[0];
    const user = JSON.parse(localStorage.getItem('user'));
    
    const formData = new FormData();
    formData.append('file', file);
    
    // Change upload area to show loading
    const uploadArea = document.querySelector('.upload-area');
    const originalHTML = uploadArea.innerHTML;
    uploadArea.innerHTML = `<div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2 text-muted">Uploading...</p>`;
    
    try {
        const response = await fetch(`${API_BASE}/users/${user.id}/resume`, {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            alert('Resume uploaded successfully!');
        } else {
            alert('Resume upload failed.');
        }
    } catch (error) {
        console.error("Error uploading resume", error);
        alert('Resume upload failed.');
    } finally {
        fileInput.value = '';
        uploadArea.innerHTML = originalHTML;
    }
}

// --- Company logic ---
async function initCompanyDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'COMPANY') {
        logout(); return;
    }
    setGreetingAndAvatar(user);
    
    // Initialize current tab
    window.currentCompanyTab = 'dashboard';
    
    await loadCompanyJobs(user.id);
    await updateCompanyMetrics(user.id);
    
    // Auto-refresh metrics every 5 seconds to keep counts live
    setInterval(() => {
        if (window.currentCompanyTab === 'dashboard') {
            updateCompanyMetrics(user.id);
        }
    }, 5000);

    const postJobForm = document.getElementById('postJobForm');
    if (postJobForm) {
        postJobForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const job = {
                title: document.getElementById('jobTitle').value,
                description: document.getElementById('jobDesc').value,
                requiredSkills: document.getElementById('reqSkills').value
            };
            try {
                await fetchJson(`${API_BASE}/jobs?companyId=${user.id}`, {
                    method: 'POST',
                    body: JSON.stringify(job)
                });
                alert('Job posted!');
                const modal = bootstrap.Modal.getInstance(document.getElementById('postJobModal'));
                modal.hide();
                postJobForm.reset();
                await loadCompanyJobs(user.id);
                updateCompanyMetrics(user.id);
            } catch (error) {
                alert('Posting job failed.');
            }
        });
    }
}

async function updateCompanyMetrics(companyId) {
    try {
        const jobs = window.companyJobs || [];
        let allApps = [];
        for (let job of jobs) {
            const apps = await fetchJson(`${API_BASE}/applications/job/${job.id}`);
            allApps = allApps.concat(apps);
        }
        
        // Total candidates should reflect unique candidates who applied for the company's jobs
        const uniqueCandidates = new Set(allApps.map(app => app.applicant.id));
        const totalCandidates = uniqueCandidates.size;
        
        const newCandidates = allApps.filter(app => app.status === 'APPLIED').length;
        const upcomingInterviews = allApps.filter(app => app.status === 'INTERVIEW').length;
        const hiredCandidates = allApps.filter(app => app.status === 'OFFER').length;
        
        const elTotal = document.getElementById('metric-total-candidates');
        const elNew = document.getElementById('metric-new-candidates');
        const elInterviews = document.getElementById('metric-interviews');
        const elHired = document.getElementById('metric-hired');
        
        if (elTotal) elTotal.innerText = totalCandidates;
        if (elNew) elNew.innerText = newCandidates;
        if (elInterviews) elInterviews.innerText = upcomingInterviews;
        if (elHired) elHired.innerText = hiredCandidates;
    } catch (error) {
        console.error("Error updating Company metrics", error);
    }
}

function switchCompanyTab(tabName, event) {
    if (event) {
        event.preventDefault();
        document.querySelectorAll('.sidebar-nav a').forEach(el => el.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }
    
    window.currentCompanyTab = tabName;
    const atsCol = document.getElementById('companyAtsCol');
    const jobsCol = document.getElementById('companyJobsCol');
    const atsTitle = document.getElementById('atsTitle');
    const atsDesc = document.getElementById('atsDesc');
    
    // Reset view initially
    if (atsCol) atsCol.style.display = 'block';
    if (jobsCol) jobsCol.style.display = 'block';
    
    if (tabName === 'dashboard') {
        // Show everything side-by-side
        if (jobsCol) jobsCol.className = 'col-xl-4 col-lg-5';
        if (atsCol) atsCol.className = 'col-xl-8 col-lg-7';
        atsTitle.innerText = 'Applicant Tracking System';
        if (atsDesc) atsDesc.innerText = 'Select a job to view applicants.';
    } 
    else if (tabName === 'candidates') {
        // Hide jobs list, make ATS full width to show all candidates
        if (jobsCol) jobsCol.style.display = 'none';
        if (atsCol) atsCol.className = 'col-12';
        
        atsTitle.innerText = 'All Applicants (Across All Jobs)';
        if (atsDesc) atsDesc.innerText = 'Review all candidates who have applied to your jobs.';
        
        loadAtsForAllJobs();
    }
    else if (tabName === 'jobs') {
        // Hide ATS, show jobs full width
        if (atsCol) atsCol.style.display = 'none';
        if (jobsCol) jobsCol.className = 'col-12';
    }
    else if (tabName === 'schedule') {
        // Show only candidates with INTERVIEW status across all jobs
        if (jobsCol) jobsCol.style.display = 'none';
        if (atsCol) atsCol.className = 'col-12';
        atsTitle.innerText = 'Upcoming Interviews Schedule';
        if (atsDesc) atsDesc.innerText = 'Candidates currently in the Interview stage.';
        loadAtsForInterviews();
    }
}

async function loadAtsForAllJobs(query = '') {
    const jobs = window.companyJobs || [];
    let allApps = [];
    for (let job of jobs) {
        const apps = await fetchJson(`${API_BASE}/applications/job/${job.id}`);
        apps.forEach(app => app.jobTitle = job.title); // attach job info
        allApps = allApps.concat(apps);
    }
    
    if (query) {
        const q = query.toLowerCase();
        allApps = allApps.filter(app => {
            const nameMatch = app.applicant && app.applicant.name && app.applicant.name.toLowerCase().includes(q);
            const skillMatch = app.applicant && app.applicant.skills && app.applicant.skills.toLowerCase().includes(q);
            return nameMatch || skillMatch;
        });
    }
    
    const tbody = document.getElementById('atsTableBody');
    tbody.innerHTML = '';
    
    // Sort by match score descending safely
    allApps.sort((a, b) => {
        const scoreA = a.resumeMatchScore != null ? a.resumeMatchScore : 0;
        const scoreB = b.resumeMatchScore != null ? b.resumeMatchScore : 0;
        return scoreB - scoreA;
    });
    
    if (allApps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-users fs-1 mb-3 text-light"></i><p>No applied candidates found.</p></td></tr>`;
        return;
    }
    
    renderAtsRows(allApps, tbody, true);
}

async function loadAtsForInterviews(query = '') {
    const jobs = window.companyJobs || [];
    let allApps = [];
    for (let job of jobs) {
        const apps = await fetchJson(`${API_BASE}/applications/job/${job.id}`);
        apps.forEach(app => app.jobTitle = job.title); // attach job info
        allApps = allApps.concat(apps);
    }
    
    // Filter to only INTERVIEW
    let interviewApps = allApps.filter(app => app.status === 'INTERVIEW');
    
    if (query) {
        const q = query.toLowerCase();
        interviewApps = interviewApps.filter(app => {
            const nameMatch = app.applicant && app.applicant.name && app.applicant.name.toLowerCase().includes(q);
            const skillMatch = app.applicant && app.applicant.skills && app.applicant.skills.toLowerCase().includes(q);
            return nameMatch || skillMatch;
        });
    }
    
    // Sort safely by match score
    interviewApps.sort((a, b) => {
        const scoreA = a.resumeMatchScore != null ? a.resumeMatchScore : 0;
        const scoreB = b.resumeMatchScore != null ? b.resumeMatchScore : 0;
        return scoreB - scoreA;
    });
    
    const tbody = document.getElementById('atsTableBody');
    tbody.innerHTML = '';
    
    if (interviewApps.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-calendar fs-1 mb-3 text-light"></i><p>No upcoming interviews scheduled.</p></td></tr>`;
        return;
    }
    
    renderAtsRows(interviewApps, tbody, true);
}

function handleCompanySearch() {
    const query = document.getElementById('globalCandidateSearchInput').value;
    
    if (window.currentCompanyTab === 'dashboard' && window.currentAtsJobId) {
        // Filter current ATS list for the selected job
        loadAts(window.currentAtsJobId, window.currentAtsJobTitle, query);
    } else if (window.currentCompanyTab === 'schedule') {
        // Filter the interview schedule list
        loadAtsForInterviews(query);
    } else {
        // For 'candidates', 'jobs', or dashboard without selection: search ALL applicants
        // We will switch to candidates tab to display the results clearly
        switchCompanyTab('candidates');
        document.getElementById('globalCandidateSearchInput').value = query; // keep input text
        loadAtsForAllJobs(query);
    }
}

async function loadCompanyJobs(companyId) {
    try {
        const jobs = await fetchJson(`${API_BASE}/jobs/company/${companyId}`);
        window.companyJobs = jobs; // Cache it
        const list = document.getElementById('companyJobsList');
        list.innerHTML = '';
        if (jobs.length === 0) {
            list.innerHTML = '<p class="text-muted small p-3 text-center border rounded-3 bg-white">No jobs posted yet.</p>';
            return;
        }
        jobs.forEach(job => {
            const safeTitle = job.title.replace(/'/g, "\\'");
            list.innerHTML += `
                <div class="p-3 border rounded-3 bg-white shadow-sm d-flex flex-column gap-2 cursor-pointer border-start border-4 border-primary" onclick="loadAts(${job.id}, '${safeTitle}')" style="transition: all 0.2s;">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-dark">${job.title}</h6>
                        <span class="badge-modern badge-green small">Active</span>
                    </div>
                    <p class="text-muted small mb-0 text-truncate" title="${job.requiredSkills}">Skills: ${job.requiredSkills}</p>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading Company jobs", error);
    }
}

async function loadAts(jobId, jobTitle, query = '') {
    window.currentAtsJobId = jobId;
    window.currentAtsJobTitle = jobTitle;
    
    document.getElementById('atsTitle').innerText = `${jobTitle}` + (query ? ` (Search: ${query})` : '');
    document.getElementById('atsDesc').innerText = 'Review candidates and update their status.';
    try {
        const apps = await fetchJson(`${API_BASE}/applications/job/${jobId}`);
        const tbody = document.getElementById('atsTableBody');
        tbody.innerHTML = '';

        let filteredApps = apps;
        if (query) {
            const q = query.toLowerCase();
            filteredApps = apps.filter(app => {
                const nameMatch = app.applicant && app.applicant.name && app.applicant.name.toLowerCase().includes(q);
                const skillMatch = app.applicant && app.applicant.skills && app.applicant.skills.toLowerCase().includes(q);
                return nameMatch || skillMatch;
            });
        }

        // Sort by match score descending SAFELY
        filteredApps.sort((a, b) => {
            const scoreA = a.resumeMatchScore != null ? a.resumeMatchScore : 0;
            const scoreB = b.resumeMatchScore != null ? b.resumeMatchScore : 0;
            return scoreB - scoreA;
        });

        if (filteredApps.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted"><i class="fas fa-folder-open fs-1 mb-3 text-light"></i><p>No applicants found.</p></td></tr>`;
            return;
        }

        renderAtsRows(filteredApps, tbody, false);
    } catch (error) {
        console.error("Error loading ATS", error);
    }
}

function renderAtsRows(apps, tbody, showJobTitle) {
    apps.forEach(app => {
        const matchScore = app.resumeMatchScore != null ? app.resumeMatchScore : 0;
        
        let scoreClass = 'score-high';
        let scoreBadge = 'badge-green';
        if (matchScore < 70) { scoreClass = 'score-med'; scoreBadge = 'badge-yellow'; }
        if (matchScore < 40) { scoreClass = 'score-low'; scoreBadge = 'badge-red'; }
        
        const applicantName = (app.applicant && app.applicant.name) ? app.applicant.name : 'Unknown';
        const applicantEmail = (app.applicant && app.applicant.email) ? app.applicant.email : '';
        const applicantSkills = (app.applicant && app.applicant.skills) ? app.applicant.skills : '';
        const applicantId = (app.applicant && app.applicant.id) ? app.applicant.id : '';
        
        const avatarChar = applicantName.charAt(0).toUpperCase();
        
        const jobInfo = showJobTitle && app.jobTitle ? `<div class="small text-primary fw-bold mt-1">For: ${app.jobTitle}</div>` : '';

        tbody.innerHTML += `
            <tr>
                <td>
                    <div class="candidate-name-cell">
                        <div class="avatar" style="width: 36px; height: 36px; font-size: 0.9rem;">${avatarChar}</div>
                        <div>
                            <div class="fw-bold text-dark">${applicantName}</div>
                            <div class="small text-muted">${applicantEmail}</div>
                            ${jobInfo}
                        </div>
                    </div>
                </td>
                <td>
                    <span class="fw-bold">${matchScore.toFixed(0)}%</span> Match
                    <div class="score-container">
                        <div class="score-bar ${scoreClass}" style="width: ${matchScore.toFixed(0)}%"></div>
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-wrap gap-1">
                        ${applicantSkills ? applicantSkills.split(',').slice(0,3).map(s => `<span class="badge-modern badge-gray" style="font-size: 0.65rem; padding: 0.2rem 0.5rem;">${s.trim()}</span>`).join('') : '<span class="text-muted small">N/A</span>'}
                    </div>
                </td>
                <td>
                    <select class="form-select form-select-sm border-0 bg-light" style="font-weight: 500; cursor: pointer;" onchange="updateAppStatus(${app.id}, this.value)">
                        <option value="APPLIED" ${app.status === 'APPLIED' ? 'selected' : ''}>Applied</option>
                        <option value="SCREENING" ${app.status === 'SCREENING' ? 'selected' : ''}>Screening</option>
                        <option value="ASSESSMENT" ${app.status === 'ASSESSMENT' ? 'selected' : ''}>Assessment</option>
                        <option value="INTERVIEW" ${app.status === 'INTERVIEW' ? 'selected' : ''}>Interview</option>
                        <option value="OFFER" ${app.status === 'OFFER' ? 'selected' : ''}>Offer</option>
                        <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
                    </select>
                </td>
                <td>
                    <button class="btn btn-resume" onclick="window.open('${API_BASE}/users/${applicantId}/resume', '_blank')">
                        <i class="fas fa-file-pdf me-1"></i> View Resume
                    </button>
                </td>
            </tr>
        `;
    });
}

async function updateAppStatus(appId, status) {
    try {
        await fetch(`${API_BASE}/applications/${appId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        
        const user = JSON.parse(localStorage.getItem('user'));
        updateCompanyMetrics(user.id);
    } catch (error) {
        alert("Failed to update status");
    }
}

function openFindCandidatesModal(jobId, jobTitle, skills) {
    document.getElementById('findCandidatesModalTitle').innerText = `Find Candidates for: ${jobTitle}`;
    document.getElementById('modalCandidateSearchInput').value = skills;

    const modal = new bootstrap.Modal(document.getElementById('findCandidatesModal'));
    modal.show();

    // Automatically perform search based on the required skills
    executeGlobalCandidateSearch();
}

async function executeGlobalCandidateSearch() {
    const query = document.getElementById('modalCandidateSearchInput').value;
    try {
        const seekers = await fetchJson(`${API_BASE}/users/seekers/search?query=${encodeURIComponent(query)}`);
        const tbody = document.getElementById('globalCandidateSearchResults');
        tbody.innerHTML = '';
        if (seekers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-muted">No candidates found matching the query.</td></tr>';
            return;
        }
        seekers.forEach(seeker => {
            const avatarChar = seeker.name.charAt(0).toUpperCase();
            tbody.innerHTML += `
                <tr>
                    <td>
                        <div class="candidate-name-cell">
                            <div class="avatar" style="width: 36px; height: 36px; font-size: 0.9rem;">${avatarChar}</div>
                            <div class="fw-bold text-dark">${seeker.name}</div>
                        </div>
                    </td>
                    <td class="text-muted">${seeker.email}</td>
                    <td>
                        <div class="d-flex flex-wrap gap-1">
                            ${seeker.skills ? seeker.skills.split(',').slice(0,3).map(s => `<span class="badge-modern badge-gray" style="font-size: 0.65rem; padding: 0.2rem 0.5rem;">${s.trim()}</span>`).join('') : '<span class="text-muted small">N/A</span>'}
                        </div>
                    </td>
                    <td>
                        <button class="btn btn-resume" onclick="window.open('${API_BASE}/users/${seeker.id}/resume', '_blank')">
                            <i class="fas fa-file-pdf me-1"></i> View Resume
                        </button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error searching global candidates", error);
    }
}

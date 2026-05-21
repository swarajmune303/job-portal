const API_BASE = 'http://localhost:5051/api';

// Utility to handle JSON fetching
async function fetchJson(url, options = {}) {
    options.headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
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
            else window.location.href = 'hr.html';
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

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'index.html';
}

// --- Seeker logic ---
async function initSeekerDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'SEEKER') {
        logout(); return;
    }
    document.getElementById('userGreeting').innerText = `Welcome, ${user.name}`;
    loadJobs();
    loadSeekerApplications(user.id);
}

async function loadJobs() {
    try {
        const jobs = await fetchJson(`${API_BASE}/jobs`);
        const jobsList = document.getElementById('jobsList');
        jobsList.innerHTML = '';
        jobs.forEach(job => {
            jobsList.innerHTML += `
                <div class="col-md-6">
                    <div class="card h-100 shadow-sm border-0 job-card">
                        <div class="card-body">
                            <h5 class="card-title fw-bold text-primary">${job.title}</h5>
                            <h6 class="card-subtitle mb-2 text-muted">${job.company ? job.company.name : 'Unknown Company'}</h6>
                            <p class="card-text">${job.description}</p>
                            <p class="text-secondary small"><strong>Required:</strong> ${job.requiredSkills}</p>
                            <button class="btn btn-outline-primary btn-sm rounded-pill" onclick="applyJob(${job.id})">Apply Now</button>
                        </div>
                    </div>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading jobs", error);
    }
}

async function applyJob(jobId) {
    const user = JSON.parse(localStorage.getItem('user'));
    try {
        await fetch(`${API_BASE}/applications?userId=${user.id}&jobId=${jobId}`, {
            method: 'POST'
        });
        alert('Applied successfully!');
        loadSeekerApplications(user.id);
    } catch (error) {
        alert('Application failed.');
    }
}

async function loadSeekerApplications(userId) {
    try {
        const apps = await fetchJson(`${API_BASE}/applications/user/${userId}`);
        const appsList = document.getElementById('applicationsList');
        appsList.innerHTML = '';
        apps.forEach(app => {
            let badgeColor = 'secondary';
            if (app.status === 'SCREENING') badgeColor = 'info';
            if (app.status === 'ASSESSMENT') badgeColor = 'warning';
            if (app.status === 'INTERVIEW') badgeColor = 'primary';
            if (app.status === 'OFFER') badgeColor = 'success';
            if (app.status === 'REJECTED') badgeColor = 'danger';

            appsList.innerHTML += `
                <div class="border-bottom py-3">
                    <h6 class="fw-bold mb-1">${app.job.title}</h6>
                    <p class="text-muted small mb-2">${app.job.company ? app.job.company.name : ''}</p>
                    <span class="badge bg-${badgeColor}">${app.status}</span>
                </div>
            `;
        });
    } catch (error) {
        console.error("Error loading applications", error);
    }
}

// --- HR logic ---
async function initHrDashboard() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user || (user.role !== 'HR' && user.role !== 'COMPANY')) {
        logout(); return;
    }
    document.getElementById('userGreeting').innerText = `Welcome, ${user.name}`;
    loadHrJobs(user.id);

    const postJobForm = document.getElementById('postJobForm');
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
            loadHrJobs(user.id);
        } catch (error) {
            alert('Posting job failed.');
        }
    });
}

async function loadHrJobs(companyId) {
    try {
        const jobs = await fetchJson(`${API_BASE}/jobs/company/${companyId}`);
        const list = document.getElementById('hrJobsList');
        list.innerHTML = '';
        jobs.forEach(job => {
            list.innerHTML += `
                <button type="button" class="list-group-item list-group-item-action py-3" onclick="loadAts(${job.id}, '${job.title}')">
                    <div class="d-flex w-100 justify-content-between">
                      <h5 class="mb-1">${job.title}</h5>
                      <small class="badge bg-success">${job.status}</small>
                    </div>
                    <small class="text-muted">Skills: ${job.requiredSkills}</small>
                </button>
            `;
        });
    } catch (error) {
        console.error("Error loading HR jobs", error);
    }
}

async function loadAts(jobId, jobTitle) {
    document.getElementById('atsTitle').innerText = `ATS Pipeline: ${jobTitle}`;
    document.getElementById('atsDesc').innerText = 'Review candidates and update their status.';
    try {
        const apps = await fetchJson(`${API_BASE}/applications/job/${jobId}`);
        const tbody = document.getElementById('atsTableBody');
        tbody.innerHTML = '';
        
        // Sort by match score descending
        apps.sort((a, b) => b.resumeMatchScore - a.resumeMatchScore);
        
        apps.forEach(app => {
            let scoreColor = 'success';
            if (app.resumeMatchScore < 70) scoreColor = 'warning';
            if (app.resumeMatchScore < 40) scoreColor = 'danger';

            tbody.innerHTML += `
                <tr>
                    <td class="fw-bold">${app.applicant.name}</td>
                    <td><span class="badge bg-${scoreColor}">${app.resumeMatchScore.toFixed(0)}%</span></td>
                    <td class="small">${app.applicant.skills}</td>
                    <td>
                        <select class="form-select form-select-sm" onchange="updateAppStatus(${app.id}, this.value)">
                            <option value="APPLIED" ${app.status === 'APPLIED' ? 'selected' : ''}>Applied</option>
                            <option value="SCREENING" ${app.status === 'SCREENING' ? 'selected' : ''}>Screening</option>
                            <option value="ASSESSMENT" ${app.status === 'ASSESSMENT' ? 'selected' : ''}>Assessment</option>
                            <option value="INTERVIEW" ${app.status === 'INTERVIEW' ? 'selected' : ''}>Interview</option>
                            <option value="OFFER" ${app.status === 'OFFER' ? 'selected' : ''}>Offer</option>
                            <option value="REJECTED" ${app.status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
                        </select>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-outline-info">View Resume</button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error("Error loading ATS", error);
    }
}

async function updateAppStatus(appId, status) {
    try {
        await fetch(`${API_BASE}/applications/${appId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        // Success
    } catch (error) {
        alert("Failed to update status");
    }
}

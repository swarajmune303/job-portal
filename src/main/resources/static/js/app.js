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

// Local match score calculator helper
function calculateLocalMatchScore(userSkills, jobSkills) {
    if (!userSkills || !jobSkills) return 0;
    const required = jobSkills.toLowerCase().split(',');
    const userSkillsLower = userSkills.toLowerCase();
    let matchCount = 0;
    required.forEach(req => {
        if (userSkillsLower.includes(req.trim())) matchCount++;
    });
    return (matchCount / required.length) * 100;
}

// Update application status in local storage cache
function updateLocalAppStatus(appId, status) {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localApps_')) {
            let list = JSON.parse(localStorage.getItem(key)) || [];
            let updated = false;
            list.forEach(app => {
                if (app.id == appId) {
                    app.status = status;
                    updated = true;
                }
            });
            if (updated) {
                localStorage.setItem(key, JSON.stringify(list));
            }
        }
    }
}

// Helper to update user in localUsers list
function updateLocalUser(updatedUser) {
    let localUsers = JSON.parse(localStorage.getItem('localUsers')) || [];
    localUsers = localUsers.map(u => u.email === updatedUser.email ? { ...u, ...updatedUser } : u);
    localStorage.setItem('localUsers', JSON.stringify(localUsers));
}

// Migrate local data keys from old ID to new ID after backend registration
function migrateLocalDataKeys(oldId, newId) {
    console.log(`Migrating local keys from ${oldId} to ${newId}`);
    
    // 1. Migrate savedJobs_${oldId} -> savedJobs_${newId}
    const savedJobs = localStorage.getItem(`savedJobs_${oldId}`);
    if (savedJobs) {
        localStorage.setItem(`savedJobs_${newId}`, savedJobs);
        localStorage.removeItem(`savedJobs_${oldId}`);
    }
    
    // 2. Migrate localApps_${oldId} -> localApps_${newId}
    const localApps = localStorage.getItem(`localApps_${oldId}`);
    if (localApps) {
        const apps = JSON.parse(localApps) || [];
        apps.forEach(app => {
            if (app.applicant) app.applicant.id = newId;
        });
        localStorage.setItem(`localApps_${newId}`, JSON.stringify(apps));
        localStorage.removeItem(`localApps_${oldId}`);
    }
    
    // 3. Migrate localJobs_${oldId} -> localJobs_${newId}
    const localJobs = localStorage.getItem(`localJobs_${oldId}`);
    if (localJobs) {
        const jobs = JSON.parse(localJobs) || [];
        jobs.forEach(job => {
            if (job.company) job.company.id = newId;
        });
        localStorage.setItem(`localJobs_${newId}`, JSON.stringify(jobs));
        localStorage.removeItem(`localJobs_${oldId}`);
    }
    
    // 4. Migrate notifications_${oldId} -> notifications_${newId}
    const notifications = localStorage.getItem(`notifications_${oldId}`);
    if (notifications) {
        localStorage.setItem(`notifications_${newId}`, notifications);
        localStorage.removeItem(`notifications_${oldId}`);
    }
    
    // 5. Migrate deletedJobs_${oldId} -> deletedJobs_${newId}
    const deletedJobs = localStorage.getItem(`deletedJobs_${oldId}`);
    if (deletedJobs) {
        localStorage.setItem(`deletedJobs_${newId}`, deletedJobs);
        localStorage.removeItem(`deletedJobs_${oldId}`);
    }
}

// Update job IDs across all local applications when a local job is synced to backend
function updateLocalApplicationsJobId(oldJobId, newJobId, newJob) {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localApps_')) {
            let list = JSON.parse(localStorage.getItem(key)) || [];
            let updated = false;
            list.forEach(app => {
                if (app.job && app.job.id == oldJobId) {
                    app.job.id = newJobId;
                    app.job = newJob;
                    updated = true;
                }
            });
            if (updated) {
                localStorage.setItem(key, JSON.stringify(list));
            }
        }
    }
}

// Sync local jobs/applications to backend asynchronously
async function backgroundSyncData(user) {
    if (!user) return;
    
    if (user.role === 'COMPANY') {
        const localJobs = JSON.parse(localStorage.getItem(`localJobs_${user.id}`)) || [];
        if (localJobs.length === 0) return;
        
        let backendJobs = [];
        try {
            backendJobs = await fetchJson(`${API_BASE}/jobs/company/${user.id}`);
        } catch (err) {
            console.warn("Could not fetch backend jobs during sync:", err);
            return;
        }
        
        for (let i = 0; i < localJobs.length; i++) {
            const lj = localJobs[i];
            // Local jobs have Date.now() IDs (> 100000000) or are not present on backend
            const exists = backendJobs.some(bj => bj.title === lj.title && bj.location === lj.location && bj.description === lj.description);
            if (!exists) {
                try {
                    const savedJob = await fetchJson(`${API_BASE}/jobs?companyId=${user.id}`, {
                        method: 'POST',
                        body: JSON.stringify({
                            title: lj.title,
                            location: lj.location,
                            description: lj.description,
                            requiredSkills: lj.requiredSkills
                        })
                    });
                    console.log(`Synced job "${lj.title}" to backend, new ID is ${savedJob.id}`);
                    
                    const oldJobId = lj.id;
                    lj.id = savedJob.id;
                    lj.company = user;
                    
                    localStorage.setItem(`localJobs_${user.id}`, JSON.stringify(localJobs));
                    updateLocalApplicationsJobId(oldJobId, savedJob.id, savedJob);
                } catch (err) {
                    console.error(`Failed to sync job "${lj.title}" to backend:`, err);
                }
            }
        }
    } else if (user.role === 'SEEKER') {
        const localApps = JSON.parse(localStorage.getItem(`localApps_${user.id}`)) || [];
        if (localApps.length === 0) return;
        
        let backendApps = [];
        try {
            backendApps = await fetchJson(`${API_BASE}/applications/user/${user.id}`);
        } catch (err) {
            console.warn("Could not fetch backend apps during sync:", err);
            return;
        }
        
        for (let i = 0; i < localApps.length; i++) {
            const la = localApps[i];
            let jobId = la.job.id;
            
            // If job ID is local, try to find updated job in window.allJobs or wait
            if (jobId > 1000000000) {
                const matchedJob = (window.allJobs || []).find(j => j.title === la.job.title && j.location === la.job.location && j.id < 1000000000);
                if (matchedJob) {
                    jobId = matchedJob.id;
                    la.job.id = jobId;
                    la.job = matchedJob;
                    localStorage.setItem(`localApps_${user.id}`, JSON.stringify(localApps));
                } else {
                    // Skip applying for now since job is not yet synced on backend
                    continue;
                }
            }
            
            const exists = backendApps.some(ba => ba.job && ba.job.id == jobId);
            if (!exists) {
                try {
                    const savedApp = await fetchJson(`${API_BASE}/applications?userId=${user.id}&jobId=${jobId}`, {
                        method: 'POST'
                    });
                    console.log(`Synced application for job "${la.job.title}" to backend`);
                    la.id = savedApp.id;
                    localStorage.setItem(`localApps_${user.id}`, JSON.stringify(localApps));
                } catch (err) {
                    console.error(`Failed to sync application for job ${jobId} to backend:`, err);
                }
            }
        }
    }
}

// Sync logged in user state with backend
async function syncUserWithBackend(user) {
    if (!user) return null;
    
    let backendUser = null;
    try {
        backendUser = await fetchJson(`${API_BASE}/users/${user.id}`);
    } catch (error) {
        console.warn(`User ${user.id} not found on backend (likely wiped or offline), attempting re-registration...`);
    }
    
    if (!backendUser) {
        try {
            backendUser = await fetchJson(`${API_BASE}/auth/register`, {
                method: 'POST',
                body: JSON.stringify({
                    name: user.name,
                    email: user.email,
                    password: user.password || 'password123',
                    role: user.role,
                    skills: user.skills
                })
            });
            console.log("Successfully re-created user on backend with new ID:", backendUser.id);
            
            const oldId = user.id;
            const newId = backendUser.id;
            
            if (oldId != newId) {
                const updatedUser = { ...user, id: newId, password: user.password || 'password123' };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                
                let localUsers = JSON.parse(localStorage.getItem('localUsers')) || [];
                localUsers = localUsers.map(u => u.email === user.email ? updatedUser : u);
                localStorage.setItem('localUsers', JSON.stringify(localUsers));
                
                migrateLocalDataKeys(oldId, newId);
                
                setTimeout(() => backgroundSyncData(updatedUser), 500);
                return updatedUser;
            }
        } catch (e) {
            console.error("Failed to re-create user on backend:", e);
        }
    } else {
        const updatedUser = { ...user, ...backendUser };
        localStorage.setItem('user', JSON.stringify(updatedUser));
        
        setTimeout(() => backgroundSyncData(updatedUser), 500);
        return updatedUser;
    }
    return user;
}

// Unified application retrieval helpers
async function getApplicationsForJob(jobId) {
    let apps = [];
    try {
        apps = await fetchJson(`${API_BASE}/applications/job/${jobId}`);
    } catch (error) {
        console.warn(`Failed to fetch apps for job ${jobId} from server, using local fallback:`, error);
    }
    
    // Scan all localApps_* lists in localStorage
    const allLocalApps = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localApps_')) {
            const list = JSON.parse(localStorage.getItem(key)) || [];
            allLocalApps.push(...list);
        }
    }
    
    // Filter local applications for this specific job
    const jobLocalApps = allLocalApps.filter(la => la.job && la.job.id == jobId);
    
    // Merge backend applications and local applications, avoiding duplicates by applicant ID
    const merged = [...apps];
    jobLocalApps.forEach(la => {
        if (la.applicant && !merged.some(a => a.applicant && a.applicant.id == la.applicant.id)) {
            merged.push(la);
        }
    });
    
    return merged;
}

async function getApplicationsForUser(userId) {
    let apps = [];
    try {
        apps = await fetchJson(`${API_BASE}/applications/user/${userId}`);
    } catch (error) {
        console.warn(`Failed to fetch apps for user ${userId} from server, using local fallback:`, error);
    }
    
    const localApps = JSON.parse(localStorage.getItem(`localApps_${userId}`)) || [];
    
    // Merge backend applications and local applications, avoiding duplicates by job ID
    const merged = [...apps];
    localApps.forEach(la => {
        if (la.job && !merged.some(a => a.job && a.job.id == la.job.id)) {
            merged.push(la);
        }
    });
    
    return merged;
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
            
            // Save registered password locally to support offline fallback
            user.password = password;
            localStorage.setItem('user', JSON.stringify(user));
            
            // Keep localUsers synced
            let localUsers = JSON.parse(localStorage.getItem('localUsers')) || [];
            if (!localUsers.some(u => u.email === user.email)) {
                localUsers.push(user);
                localStorage.setItem('localUsers', JSON.stringify(localUsers));
            } else {
                localUsers = localUsers.map(u => u.email === user.email ? { ...u, id: user.id, password } : u);
                localStorage.setItem('localUsers', JSON.stringify(localUsers));
            }
            
            if (user.role === 'SEEKER') window.location.href = 'seeker.html';
            else window.location.href = 'company.html';
        } catch (error) {
            console.warn("Backend login failed, attempting local fallback:", error);
            const localUsers = JSON.parse(localStorage.getItem('localUsers')) || [];
            const foundUser = localUsers.find(u => u.email === email && u.password === password);
            if (foundUser) {
                localStorage.setItem('user', JSON.stringify(foundUser));
                if (foundUser.role === 'SEEKER') window.location.href = 'seeker.html';
                else window.location.href = 'company.html';
            } else {
                alert('Login failed. Please check your credentials.');
            }
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
        
        // Always save locally first with a generated ID
        const localUsers = JSON.parse(localStorage.getItem('localUsers')) || [];
        if (localUsers.some(u => u.email === user.email)) {
            alert('Email already registered!');
            return;
        }
        
        user.id = Date.now(); // temporary local ID
        localUsers.push(user);
        localStorage.setItem('localUsers', JSON.stringify(localUsers));
        
        try {
            const registeredUser = await fetchJson(`${API_BASE}/auth/register`, {
                method: 'POST',
                body: JSON.stringify(user)
            });
            // Update local user with backend ID
            user.id = registeredUser.id;
            localStorage.setItem('localUsers', JSON.stringify(localUsers));
            alert('Registration successful! Please login.');
        } catch (error) {
            console.warn("Backend registration failed, saved locally:", error);
            alert('Registration successful (local fallback)! Please login.');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('registerModal'));
        if (modal) modal.hide();
        registerForm.reset();
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

    // Seeker Dashboard Profile Card elements
    const dashName = document.getElementById('dashboardProfileName');
    const dashEmail = document.getElementById('dashboardProfileEmail');
    const dashAvatar = document.getElementById('dashboardProfileAvatar');
    if (dashName) dashName.innerText = user.name;
    if (dashEmail) dashEmail.innerText = user.email;
    if (dashAvatar && user.name) {
        dashAvatar.innerText = user.name.charAt(0).toUpperCase();
    }
}

// --- Seeker logic ---
async function initSeekerDashboard() {
    let user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'SEEKER') {
        logout(); return;
    }
    
    // Sync user first
    user = await syncUserWithBackend(user);
    setGreetingAndAvatar(user);
    
    // Initialize saved jobs in localStorage if not present
    if (!localStorage.getItem(`savedJobs_${user.id}`)) {
        localStorage.setItem(`savedJobs_${user.id}`, JSON.stringify([]));
    }
    
    await loadJobs();
    await loadSeekerApplications(user.id);
    updateSeekerMetrics();
    renderResumeCard(user);
    initNotifications();

    const seekerProfileForm = document.getElementById('seekerProfileForm');
    if (seekerProfileForm) {
        seekerProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const updatedUser = {
                name: document.getElementById('profileName').value,
                email: document.getElementById('profileEmail').value,
                skills: document.getElementById('profileSkills').value
            };
            const pwdInput = document.getElementById('profilePassword');
            const pwd = pwdInput ? pwdInput.value : '';
            if (pwd && pwd.trim()) {
                updatedUser.password = pwd;
            }
            try {
                const result = await fetchJson(`${API_BASE}/users/${user.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedUser)
                });
                alert('Profile updated successfully!');
                localStorage.setItem('user', JSON.stringify(result));
                updateLocalUser(result);
                setGreetingAndAvatar(result);
                loadUserProfile();
            } catch (error) {
                console.warn('Backend update failed, falling back to local update:', error);
                const localUser = { ...user, ...updatedUser };
                localStorage.setItem('user', JSON.stringify(localUser));
                updateLocalUser(localUser);
                setGreetingAndAvatar(localUser);
                alert('Profile updated successfully (local fallback)!');
                loadUserProfile();
            }
        });
    }
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
            <div class="job-location text-muted small mb-2"><i class="fas fa-map-marker-alt me-1"></i> ${job.location || 'Not specified'}</div>
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
        const job = (window.allJobs || []).find(j => j.id == jobId);
        const jobTitle = job ? job.title : 'Job';
        addNotification(`Job "${jobTitle}" has been added to your Saved Jobs!`, 'SUCCESS');
    }
    
    localStorage.setItem(`savedJobs_${user.id}`, JSON.stringify(savedJobs));
    updateSeekerMetrics();
    
    // If currently viewing saved jobs, re-render
    if (window.currentSeekerTab === 'saved') {
        showSavedJobs();
    }
}

async function loadJobs() {
    let jobs = [];
    try {
        jobs = await fetchJson(`${API_BASE}/jobs`);
    } catch (error) {
        console.warn("Error loading jobs from server, using local fallback", error);
    }
    
    // Scan all localJobs_* keys in localStorage and merge
    const allLocalJobs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localJobs_')) {
            const list = JSON.parse(localStorage.getItem(key)) || [];
            allLocalJobs.push(...list);
        }
    }
    
    // Merge backend jobs and local jobs, avoiding duplicates by job ID
    const mergedJobs = [...jobs];
    allLocalJobs.forEach(lj => {
        if (!mergedJobs.some(j => j.id == lj.id)) {
            mergedJobs.push(lj);
        }
    });
    
    // Filter out deleted jobs globally (accumulated from local storage deleted lists)
    const allDeletedJobs = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('deletedJobs_')) {
            const list = JSON.parse(localStorage.getItem(key)) || [];
            allDeletedJobs.push(...list.map(id => Number(id)));
        }
    }
    
    const activeJobs = mergedJobs.filter(j => !allDeletedJobs.includes(Number(j.id)));
    window.allJobs = activeJobs; // Cache jobs
    renderJobs(activeJobs);
}

function renderJobs(jobsArray) {
    const jobsList = document.getElementById('jobsList');
    jobsList.innerHTML = '';
    if (jobsArray.length === 0) {
        jobsList.innerHTML = '<div class="col-12"><p class="text-muted">No jobs found.</p></div>';
        return;
    }
    
    // Sort jobs descending by ID so recently posted jobs display first
    let sortedJobs = [...jobsArray].sort((a, b) => Number(b.id) - Number(a.id));
    
    // Limit to recent 6 jobs on the main dashboard if not searching
    const searchInput = document.getElementById('jobSearchInput');
    const query = searchInput ? searchInput.value.trim() : '';
    if ((!window.currentSeekerTab || window.currentSeekerTab === 'dashboard') && !query) {
        sortedJobs = sortedJobs.slice(0, 6);
    }
    
    sortedJobs.forEach(job => {
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
    if (!user) {
        alert("Please login first.");
        return;
    }
    
    // Prevent duplicate applications
    const localApps = JSON.parse(localStorage.getItem(`localApps_${user.id}`)) || [];
    const alreadyAppliedLocal = localApps.some(a => a.job && a.job.id == jobId);
    const alreadyAppliedCached = (window.allApplications || []).some(a => a.job && a.job.id == jobId);
    if (alreadyAppliedLocal || alreadyAppliedCached) {
        alert("You have already applied for this job.");
        return;
    }

    const job = (window.allJobs || []).find(j => j.id == jobId);
    if (!job) {
        alert("Job details not found.");
        return;
    }
    
    let appliedApp = null;
    try {
        appliedApp = await fetchJson(`${API_BASE}/applications?userId=${user.id}&jobId=${jobId}`, {
            method: 'POST'
        });
        alert('Applied successfully!');
    } catch (error) {
        console.warn("Backend application failed, saving locally:", error);
        // Create local mock application
        appliedApp = {
            id: Date.now(),
            job: job,
            applicant: user,
            status: 'APPLIED',
            resumeMatchScore: calculateLocalMatchScore(user.skills, job.requiredSkills)
        };
        alert('Applied successfully (local fallback)!');
    }
    
    if (appliedApp) {
        // Save/update in localApps_${user.id}
        let updatedLocalApps = JSON.parse(localStorage.getItem(`localApps_${user.id}`)) || [];
        if (!updatedLocalApps.some(a => a.job && a.job.id == jobId)) {
            updatedLocalApps.push(appliedApp);
            localStorage.setItem(`localApps_${user.id}`, JSON.stringify(updatedLocalApps));
        }
        
        await loadSeekerApplications(user.id);
        updateSeekerMetrics();
        const jobTitle = job.title;
        addNotification(`Applied successfully for "${jobTitle}"!`, 'SUCCESS');
    }
}

async function loadSeekerApplications(userId) {
    try {
        const apps = await getApplicationsForUser(userId);
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
    }
    
    // Update active class in sidebar based on tabName
    document.querySelectorAll('.sidebar-nav a').forEach(el => {
        if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${tabName}'`)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    window.currentSeekerTab = tabName;
    const dashboardView = document.getElementById('seekerDashboardView');
    const profileView = document.getElementById('seekerProfileView');
    
    if (tabName === 'profile') {
        if (dashboardView) dashboardView.style.display = 'none';
        if (profileView) profileView.style.display = 'block';
        loadUserProfile();
    } else {
        if (dashboardView) dashboardView.style.display = 'block';
        if (profileView) profileView.style.display = 'none';
        
        const mainTitle = document.getElementById('mainJobGridTitle');
        if (tabName === 'dashboard' || tabName === 'find') {
            if (mainTitle) mainTitle.innerText = tabName === 'dashboard' ? 'Recommended For You' : 'All Available Jobs';
            const searchInput = document.getElementById('jobSearchInput');
            if (searchInput) searchInput.value = '';
            renderJobs(window.allJobs || []);
            const sec = document.getElementById('profileAndAppsSection');
            if (sec) sec.style.display = 'block';
        } 
        else if (tabName === 'saved') {
            if (mainTitle) mainTitle.innerText = 'Your Saved Jobs';
            showSavedJobs();
            const sec = document.getElementById('profileAndAppsSection');
            if (sec) sec.style.display = 'none';
        }
        else if (tabName === 'applications') {
            const sec = document.getElementById('profileAndAppsSection');
            if (sec) sec.style.display = 'block';
            const list = document.getElementById('applicationsList');
            if (list) list.scrollIntoView({ behavior: 'smooth' });
        }
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
    
    const container = document.getElementById('resumeCardContent');
    if (container) {
        container.innerHTML = `<div class="p-4 border rounded-3 bg-white text-center shadow-sm"><div class="spinner-border text-primary" role="status"><span class="visually-hidden">Loading...</span></div><p class="mt-2 text-muted mb-0">Uploading...</p></div>`;
    }
    
    try {
        const response = await fetch(`${API_BASE}/users/${user.id}/resume`, {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            alert('Resume uploaded successfully!');
            user.resumeFilename = file.name;
            localStorage.setItem('user', JSON.stringify(user));
            renderResumeCard(user);
            addNotification('Your resume has been uploaded successfully!', 'SUCCESS');
        } else {
            alert('Resume upload failed.');
            renderResumeCard(user);
        }
    } catch (error) {
        console.warn("Error uploading resume to backend, saving locally:", error);
        user.resumeFilename = file.name;
        localStorage.setItem('user', JSON.stringify(user));
        renderResumeCard(user);
        alert('Resume uploaded successfully (local fallback)!');
        addNotification('Your resume has been uploaded successfully (local fallback)!', 'SUCCESS');
    } finally {
        fileInput.value = '';
    }
}

// --- Company logic ---
async function initCompanyDashboard() {
    let user = JSON.parse(localStorage.getItem('user'));
    if (!user || user.role !== 'COMPANY') {
        logout(); return;
    }
    
    // Sync user first
    user = await syncUserWithBackend(user);
    setGreetingAndAvatar(user);
    initNotifications();
    
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
                location: document.getElementById('jobLocation').value,
                description: document.getElementById('jobDesc').value,
                requiredSkills: document.getElementById('reqSkills').value
            };
            
            let savedJob = null;
            try {
                savedJob = await fetchJson(`${API_BASE}/jobs?companyId=${user.id}`, {
                    method: 'POST',
                    body: JSON.stringify(job)
                });
                alert('Job posted!');
            } catch (error) {
                console.warn("Backend job posting failed, saving locally:", error);
                savedJob = {
                    id: Date.now(),
                    title: job.title,
                    location: job.location,
                    description: job.description,
                    requiredSkills: job.requiredSkills,
                    company: user
                };
                alert('Job posted (local fallback)!');
            }
            
            if (savedJob) {
                // Save locally
                let localJobs = JSON.parse(localStorage.getItem(`localJobs_${user.id}`)) || [];
                localJobs.push(savedJob);
                localStorage.setItem(`localJobs_${user.id}`, JSON.stringify(localJobs));
                
                const modal = bootstrap.Modal.getInstance(document.getElementById('postJobModal'));
                if (modal) modal.hide();
                postJobForm.reset();
                await loadCompanyJobs(user.id);
                updateCompanyMetrics(user.id);
                addNotification(`New job posting published: "${job.title}"!`, 'SUCCESS');
            }
        });
    }

    const companyProfileForm = document.getElementById('companyProfileForm');
    if (companyProfileForm) {
        companyProfileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const updatedUser = {
                name: document.getElementById('companyProfileName').value,
                email: document.getElementById('companyProfileEmail').value
            };
            const pwdInput = document.getElementById('companyProfilePassword');
            const pwd = pwdInput ? pwdInput.value : '';
            if (pwd && pwd.trim()) {
                updatedUser.password = pwd;
            }
            try {
                const result = await fetchJson(`${API_BASE}/users/${user.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedUser)
                });
                alert('Profile updated successfully!');
                localStorage.setItem('user', JSON.stringify(result));
                updateLocalUser(result);
                setGreetingAndAvatar(result);
                loadUserProfile();
            } catch (error) {
                console.warn('Backend update failed, falling back to local update:', error);
                const localUser = { ...user, ...updatedUser };
                localStorage.setItem('user', JSON.stringify(localUser));
                updateLocalUser(localUser);
                setGreetingAndAvatar(localUser);
                alert('Profile updated successfully (local fallback)!');
                loadUserProfile();
            }
        });
    }
}

async function updateCompanyMetrics(companyId) {
    try {
        const jobs = window.companyJobs || [];
        let allApps = [];
        for (let job of jobs) {
            const apps = await getApplicationsForJob(job.id);
            allApps = allApps.concat(apps);
        }
        
        // Total candidates should reflect unique candidates who applied for the company's jobs
        const uniqueCandidates = new Set(allApps.filter(app => app.applicant && app.applicant.id).map(app => app.applicant.id));
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
    }
    
    // Update active class in sidebar based on tabName
    document.querySelectorAll('.sidebar-nav a').forEach(el => {
        if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(`'${tabName}'`)) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    
    window.currentCompanyTab = tabName;
    const dashboardView = document.getElementById('companyDashboardView');
    const profileView = document.getElementById('companyProfileView');
    
    if (tabName === 'profile') {
        if (dashboardView) dashboardView.style.display = 'none';
        if (profileView) profileView.style.display = 'block';
        loadUserProfile();
    } else {
        if (dashboardView) dashboardView.style.display = 'block';
        if (profileView) profileView.style.display = 'none';
        
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
            if (atsTitle) atsTitle.innerText = 'Applicant Tracking System';
            if (atsDesc) atsDesc.innerText = 'Select a job to view applicants.';
        } 
        else if (tabName === 'candidates') {
            // Hide jobs list, make ATS full width to show all candidates
            if (jobsCol) jobsCol.style.display = 'none';
            if (atsCol) atsCol.className = 'col-12';
            
            if (atsTitle) atsTitle.innerText = 'All Applicants (Across All Jobs)';
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
            if (atsTitle) atsTitle.innerText = 'Upcoming Interviews Schedule';
            if (atsDesc) atsDesc.innerText = 'Candidates currently in the Interview stage.';
            loadAtsForInterviews();
        }
    }
}

async function loadAtsForAllJobs(query = '') {
    const jobs = window.companyJobs || [];
    let allApps = [];
    for (let job of jobs) {
        const apps = await getApplicationsForJob(job.id);
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
        const apps = await getApplicationsForJob(job.id);
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
    let jobs = [];
    try {
        jobs = await fetchJson(`${API_BASE}/jobs/company/${companyId}`);
    } catch (error) {
        console.warn("Error loading Company jobs from server, using local fallback", error);
    }
    
    // Load local jobs for this company
    const localJobs = JSON.parse(localStorage.getItem(`localJobs_${companyId}`)) || [];
    
    // Merge backend and local jobs, avoiding duplicates by job ID
    const mergedJobs = [...jobs];
    localJobs.forEach(lj => {
        if (!mergedJobs.some(j => j.id == lj.id)) {
            mergedJobs.push(lj);
        }
    });
    
    // Filter out locally deleted jobs
    const deletedJobs = JSON.parse(localStorage.getItem(`deletedJobs_${companyId}`)) || [];
    const activeJobs = mergedJobs.filter(j => !deletedJobs.includes(Number(j.id)));
    
    window.companyJobs = activeJobs; // Cache it
    const list = document.getElementById('companyJobsList');
    if (list) {
        list.innerHTML = '';
        if (activeJobs.length === 0) {
            list.innerHTML = '<p class="text-muted small p-3 text-center border rounded-3 bg-white">No jobs posted yet.</p>';
            return;
        }
        activeJobs.forEach(job => {
            const safeTitle = job.title.replace(/'/g, "\\'");
            list.innerHTML += `
                <div class="p-3 border rounded-3 bg-white shadow-sm d-flex flex-column gap-2 cursor-pointer border-start border-4 border-primary" onclick="loadAts(${job.id}, '${safeTitle}')" style="transition: all 0.2s;">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="fw-bold mb-0 text-dark">${job.title}</h6>
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge-modern badge-green small">Active</span>
                            <button class="btn btn-link text-danger p-0 border-0 lh-1" onclick="event.stopPropagation(); deleteJob(${job.id}, '${safeTitle}')" style="transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.15)'" onmouseout="this.style.transform='scale(1)'" title="Delete Job">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                    <div class="small text-muted"><i class="fas fa-map-marker-alt me-1"></i> ${job.location || 'Not specified'}</div>
                    <p class="text-muted small mb-0 text-truncate" title="${job.requiredSkills}">Skills: ${job.requiredSkills}</p>
                </div>
            `;
        });
    }
}

async function loadAts(jobId, jobTitle, query = '') {
    window.currentAtsJobId = jobId;
    window.currentAtsJobTitle = jobTitle;
    
    document.getElementById('atsTitle').innerText = `${jobTitle}` + (query ? ` (Search: ${query})` : '');
    document.getElementById('atsDesc').innerText = 'Review candidates and update their status.';
    try {
        const apps = await getApplicationsForJob(jobId);
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
                    <button class="btn btn-resume" onclick="viewResume(${applicantId})">
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
    } catch (error) {
        console.warn("Failed to update status on server, updating locally:", error);
    }
    
    // Update locally to keep dashboards consistent
    updateLocalAppStatus(appId, status);
    
    const user = JSON.parse(localStorage.getItem('user'));
    updateCompanyMetrics(user.id);
    
    let applicantId = null;
    // Scan local collections to resolve applicantId
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localApps_')) {
            const list = JSON.parse(localStorage.getItem(key)) || [];
            const found = list.find(a => a.id == appId);
            if (found && found.applicant) {
                applicantId = found.applicant.id;
                break;
            }
        }
    }
    
    // Fallback: search table rows
    if (!applicantId) {
        const tableRows = document.querySelectorAll('#atsTableBody tr');
        for (let row of tableRows) {
            const select = row.querySelector('select');
            if (select && select.getAttribute('onchange') && select.getAttribute('onchange').includes(appId)) {
                const btn = row.querySelector('.btn-resume');
                if (btn && btn.getAttribute('onclick')) {
                    const match = btn.getAttribute('onclick').match(/\d+/);
                    if (match) applicantId = match[0];
                }
                break;
            }
        }
    }
    
    if (applicantId) {
        const seekerNotificationsKey = `notifications_${applicantId}`;
        let seekerNotifications = JSON.parse(localStorage.getItem(seekerNotificationsKey)) || [];
        seekerNotifications.unshift({
            id: Date.now(),
            text: `Your application status has been updated to "${status}"!`,
            type: 'MATCH',
            timestamp: new Date().toISOString(),
            read: false
        });
        localStorage.setItem(seekerNotificationsKey, JSON.stringify(seekerNotifications));
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
                        <button class="btn btn-resume" onclick="viewResume(${seeker.id})">
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

async function loadUserProfile() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    
    try {
        const latestUser = await fetchJson(`${API_BASE}/users/${user.id}`);
        localStorage.setItem('user', JSON.stringify(latestUser));
        setGreetingAndAvatar(latestUser);
        
        if (latestUser.role === 'SEEKER') {
            renderResumeCard(latestUser);
            const nameHeader = document.getElementById('profileNameHeader');
            if (nameHeader) nameHeader.innerText = latestUser.name;
            const avatar = document.getElementById('profileAvatar');
            if (avatar) avatar.innerText = latestUser.name.charAt(0).toUpperCase();
            
            const nameInput = document.getElementById('profileName');
            if (nameInput) nameInput.value = latestUser.name;
            const emailInput = document.getElementById('profileEmail');
            if (emailInput) emailInput.value = latestUser.email;
            const pwdInput = document.getElementById('profilePassword');
            if (pwdInput) pwdInput.value = '';
            const skillsInput = document.getElementById('profileSkills');
            if (skillsInput) skillsInput.value = latestUser.skills || '';
        } else if (latestUser.role === 'COMPANY') {
            const nameHeader = document.getElementById('companyProfileNameHeader');
            if (nameHeader) nameHeader.innerText = latestUser.name;
            const avatar = document.getElementById('companyProfileAvatar');
            if (avatar) avatar.innerText = latestUser.name.charAt(0).toUpperCase();
            
            const nameInput = document.getElementById('companyProfileName');
            if (nameInput) nameInput.value = latestUser.name;
            const emailInput = document.getElementById('companyProfileEmail');
            if (emailInput) emailInput.value = latestUser.email;
            const pwdInput = document.getElementById('companyProfilePassword');
            if (pwdInput) pwdInput.value = '';
        }
    } catch (error) {
        console.error("Error loading user profile from server, falling back to local storage:", error);
        const localUser = JSON.parse(localStorage.getItem('user'));
        if (localUser) {
            setGreetingAndAvatar(localUser);
            if (localUser.role === 'SEEKER') {
                renderResumeCard(localUser);
                const nameHeader = document.getElementById('profileNameHeader');
                if (nameHeader) nameHeader.innerText = localUser.name;
                const avatar = document.getElementById('profileAvatar');
                if (avatar) avatar.innerText = localUser.name.charAt(0).toUpperCase();
                
                const nameInput = document.getElementById('profileName');
                if (nameInput) nameInput.value = localUser.name;
                const emailInput = document.getElementById('profileEmail');
                if (emailInput) emailInput.value = localUser.email;
                const pwdInput = document.getElementById('profilePassword');
                if (pwdInput) pwdInput.value = '';
                const skillsInput = document.getElementById('profileSkills');
                if (skillsInput) skillsInput.value = localUser.skills || '';
            } else if (localUser.role === 'COMPANY') {
                const nameHeader = document.getElementById('companyProfileNameHeader');
                if (nameHeader) nameHeader.innerText = localUser.name;
                const avatar = document.getElementById('companyProfileAvatar');
                if (avatar) avatar.innerText = localUser.name.charAt(0).toUpperCase();
                
                const nameInput = document.getElementById('companyProfileName');
                if (nameInput) nameInput.value = localUser.name;
                const emailInput = document.getElementById('companyProfileEmail');
                if (emailInput) emailInput.value = localUser.email;
                const pwdInput = document.getElementById('companyProfilePassword');
                if (pwdInput) pwdInput.value = '';
            }
        }
    }
}

async function viewResume(applicantId) {
    try {
        const response = await fetch(`${API_BASE}/users/${applicantId}`);
        if (!response.ok) {
            throw new Error("User not found on server");
        }
        const user = await response.json();
        
        const resumeCheck = await fetch(`${API_BASE}/users/${applicantId}/resume`, { method: 'HEAD' });
        if (resumeCheck.ok) {
            window.open(`${API_BASE}/users/${applicantId}/resume`, '_blank');
            return;
        }
        
        generateResumeFallback(user);
    } catch (error) {
        console.warn("Backend resume check failed, checking local storage:", error);
        const localUser = JSON.parse(localStorage.getItem('user'));
        if (localUser && localUser.id == applicantId) {
            generateResumeFallback(localUser);
        } else {
            let seeker = null;
            if (window.allApplications) {
                const app = window.allApplications.find(a => a.applicant && a.applicant.id == applicantId);
                if (app) seeker = app.applicant;
            }
            if (!seeker && window.companyJobs) {
                const tableRows = document.querySelectorAll('#atsTableBody tr');
                for (let row of tableRows) {
                    const btn = row.querySelector('.btn-resume');
                    if (btn && btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(applicantId)) {
                        const nameEl = row.querySelector('.fw-bold.text-dark');
                        const emailEl = row.querySelector('.small.text-muted');
                        const skillsBadges = row.querySelectorAll('.badge-modern');
                        const skills = Array.from(skillsBadges).map(b => b.innerText).join(', ');
                        seeker = {
                            id: applicantId,
                            name: nameEl ? nameEl.innerText : 'Candidate',
                            email: emailEl ? emailEl.innerText : 'candidate@example.com',
                            skills: skills || 'Java, Spring Boot, React'
                        };
                        break;
                    }
                }
            }
            if (seeker) {
                generateResumeFallback(seeker);
            } else {
                alert("Could not load candidate details.");
            }
        }
    }
}

function generateResumeFallback(user) {
    const resumeWin = window.open('', '_blank');
    if (!resumeWin) {
        alert("Please allow popups to view the resume.");
        return;
    }
    
    const initials = user.name ? user.name.charAt(0).toUpperCase() : 'C';
    const skillsList = user.skills ? user.skills.split(',').map(s => `<span class="skill-badge">${s.trim()}</span>`).join('') : '<span class="text-muted">None listed</span>';
    
    resumeWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Resume - ${user.name}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
            <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    background-color: #F3F6F9;
                    color: #374151;
                    margin: 0;
                    padding: 3rem 1rem;
                    display: flex;
                    justify-content: center;
                }
                .resume-container {
                    background: white;
                    width: 100%;
                    max-width: 800px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.05);
                    border-radius: 16px;
                    overflow: hidden;
                    border: 1px solid #E5E7EB;
                }
                .resume-header {
                    background: linear-gradient(135deg, #4F46E5, #EC4899);
                    padding: 3rem;
                    color: white;
                    display: flex;
                    align-items: center;
                    gap: 2rem;
                }
                .resume-avatar {
                    width: 80px;
                    height: 80px;
                    background: rgba(255, 255, 255, 0.2);
                    border: 2px solid white;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 2.25rem;
                    font-weight: 800;
                    font-family: 'Outfit', sans-serif;
                }
                .header-info h1 {
                    margin: 0;
                    font-size: 2.25rem;
                    font-family: 'Outfit', sans-serif;
                    font-weight: 800;
                }
                .header-info p {
                    margin: 0.5rem 0 0 0;
                    opacity: 0.9;
                    font-size: 1.1rem;
                }
                .resume-body {
                    padding: 3rem;
                }
                .resume-section {
                    margin-bottom: 2.5rem;
                }
                .resume-section:last-child {
                    margin-bottom: 0;
                }
                .section-title {
                    font-family: 'Outfit', sans-serif;
                    font-size: 1.25rem;
                    font-weight: 700;
                    color: #111827;
                    border-bottom: 2px solid #EEF2FF;
                    padding-bottom: 0.5rem;
                    margin-bottom: 1.25rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                }
                .section-title i {
                    color: #4F46E5;
                }
                .skill-badge {
                    display: inline-block;
                    background: #EEF2FF;
                    color: #4F46E5;
                    font-weight: 600;
                    padding: 0.5rem 1rem;
                    border-radius: 9999px;
                    font-size: 0.875rem;
                    margin-right: 0.5rem;
                    margin-bottom: 0.5rem;
                }
                .timeline {
                    position: relative;
                    border-left: 2px solid #E5E7EB;
                    padding-left: 2rem;
                    margin-left: 0.5rem;
                }
                .timeline-item {
                    position: relative;
                    margin-bottom: 2rem;
                }
                .timeline-item:last-child {
                    margin-bottom: 0;
                }
                .timeline-marker {
                    position: absolute;
                    left: -2.6rem;
                    background: #4F46E5;
                    border: 4px solid white;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    top: 0.25rem;
                }
                .timeline-title {
                    font-weight: 700;
                    color: #111827;
                    margin: 0;
                }
                .timeline-subtitle {
                    color: #6B7280;
                    font-size: 0.9rem;
                    margin: 0.25rem 0 0.75rem 0;
                }
                .timeline-desc {
                    margin: 0;
                    font-size: 0.95rem;
                    line-height: 1.5;
                }
                .no-print {
                    display: flex;
                    justify-content: center;
                    gap: 1rem;
                    margin-top: 2rem;
                }
                .btn-print {
                    background: #4F46E5;
                    color: white;
                    border: none;
                    padding: 0.75rem 2rem;
                    font-weight: 600;
                    border-radius: 9999px;
                    font-family: 'Outfit', sans-serif;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.2);
                    transition: all 0.2s;
                }
                .btn-print:hover {
                    background: #3730A3;
                    transform: translateY(-2px);
                }
                @media print {
                    body {
                        background: white;
                        padding: 0;
                    }
                    .resume-container {
                        box-shadow: none;
                        border: none;
                    }
                    .no-print {
                        display: none;
                    }
                }
            </style>
        </head>
        <body>
            <div>
                <div class="resume-container">
                    <div class="resume-header">
                        <div class="resume-avatar">${initials}</div>
                        <div class="header-info">
                            <h1>${user.name}</h1>
                            <p><i class="far fa-envelope me-2"></i> ${user.email} &nbsp;&bull;&nbsp; <i class="fas fa-briefcase me-2"></i> Job Seeker</p>
                        </div>
                    </div>
                    <div class="resume-body">
                        <div class="resume-section">
                            <div class="section-title"><i class="fas fa-user"></i> Professional Profile</div>
                            <p style="line-height: 1.6; margin: 0;">Highly motivated and detail-oriented professional with specialized experience in target technologies. Eager to contribute key skills to innovative teams, build high-performance applications, and solve complex problems in dynamic software environments.</p>
                        </div>
                        
                        <div class="resume-section">
                            <div class="section-title"><i class="fas fa-tools"></i> Core Technical Skills</div>
                            <div style="display: flex; flex-wrap: wrap;">
                                ${skillsList}
                            </div>
                        </div>
                        
                        <div class="resume-section">
                            <div class="section-title"><i class="fas fa-history"></i> Experience History</div>
                            <div class="timeline">
                                <div class="timeline-item">
                                    <div class="timeline-marker"></div>
                                    <h4 class="timeline-title">Software Developer</h4>
                                    <div class="timeline-subtitle">Tech Solutions Inc. &bull; 2024 - Present</div>
                                    <p class="timeline-desc">Designed and implemented high-volume web systems using core frameworks. Collaborated with cross-functional development groups to deploy modern, secure interfaces.</p>
                                </div>
                                <div class="timeline-item">
                                    <div class="timeline-marker"></div>
                                    <h4 class="timeline-title">Junior Developer</h4>
                                    <div class="timeline-subtitle">Innovation Systems Lab &bull; 2022 - 2024</div>
                                    <p class="timeline-desc">Assisted in engineering responsive web features and robust database configurations. Performed unit testing and code optimizations.</p>
                                </div>
                            </div>
                        </div>

                        <div class="resume-section">
                            <div class="section-title"><i class="fas fa-graduation-cap"></i> Education & Credentials</div>
                            <div class="timeline">
                                <div class="timeline-item" style="margin-bottom: 0;">
                                    <div class="timeline-marker"></div>
                                    <h4 class="timeline-title">Bachelor of Science in Computer Science</h4>
                                    <div class="timeline-subtitle">State Tech University &bull; Graduated 2022</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="no-print">
                    <button class="btn-print" onclick="window.print()"><i class="fas fa-print"></i> Print / Download PDF</button>
                    <button class="btn-print" style="background: #374151;" onclick="window.close()"><i class="fas fa-times"></i> Close Viewer</button>
                </div>
            </div>
        </body>
        </html>
    `);
    resumeWin.document.close();
}

async function deleteJob(jobId, jobTitle) {
    if (!confirm(`Are you sure you want to delete the job post "${jobTitle}"? This will also remove all associated applications.`)) {
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('user'));
    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}`, {
            method: 'DELETE'
        });
        if (response.ok) {
            alert('Job post deleted successfully!');
            addNotification(`Job post "${jobTitle}" has been deleted.`, 'WARNING');
        } else {
            throw new Error('Failed to delete job post on backend');
        }
    } catch (error) {
        console.warn("Backend job deletion failed, executing local fallback:", error);
        alert('Job post deleted successfully (local fallback)!');
        addNotification(`Job post "${jobTitle}" has been deleted (local fallback).`, 'WARNING');
    }
    
    // Always clean up locally
    let deletedJobs = JSON.parse(localStorage.getItem(`deletedJobs_${user.id}`)) || [];
    if (!deletedJobs.includes(Number(jobId))) {
        deletedJobs.push(Number(jobId));
        localStorage.setItem(`deletedJobs_${user.id}`, JSON.stringify(deletedJobs));
    }
    
    // Remove from localJobs_${user.id}
    let localJobs = JSON.parse(localStorage.getItem(`localJobs_${user.id}`)) || [];
    localJobs = localJobs.filter(j => j.id != jobId);
    localStorage.setItem(`localJobs_${user.id}`, JSON.stringify(localJobs));
    
    // Reload UI
    await loadCompanyJobs(user.id);
    await updateCompanyMetrics(user.id);
    
    // Remove local applications associated with deleted job
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('localApps_')) {
            let list = JSON.parse(localStorage.getItem(key)) || [];
            const filtered = list.filter(la => la.job && la.job.id != jobId);
            localStorage.setItem(key, JSON.stringify(filtered));
        }
    }
    
    // Reset ATS view if deleted job was selected
    if (window.currentAtsJobId === jobId) {
        const tbody = document.getElementById('atsTableBody');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-5 text-muted">
                        <i class="fas fa-inbox fs-1 mb-3 text-light"></i>
                        <p>Select a job from the left to view applicants</p>
                    </td>
                </tr>
            `;
        }
        const atsTitle = document.getElementById('atsTitle');
        if (atsTitle) atsTitle.innerText = 'Applicant Tracking System';
        const atsDesc = document.getElementById('atsDesc');
        if (atsDesc) atsDesc.innerText = 'Select a job to view applicants.';
        window.currentAtsJobId = null;
        window.currentAtsJobTitle = null;
    }
}

function renderResumeCard(user) {
    const container = document.getElementById('resumeCardContent');
    if (!container) return;
    if (user.resumeFilename) {
        container.innerHTML = `
            <div class="p-3 border rounded-3 bg-white shadow-sm d-flex flex-column gap-3 text-center border-start border-4 border-success">
                <div class="d-flex align-items-center gap-3 text-start">
                    <div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-size: 1.25rem;">
                        <i class="fas fa-file-pdf"></i>
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <h6 class="fw-bold text-dark mb-0 text-truncate" title="${user.resumeFilename}">${user.resumeFilename}</h6>
                        <p class="text-muted small mb-0">Resume uploaded and active</p>
                    </div>
                </div>
                <div class="d-flex gap-2">
                    <button class="btn btn-resume btn-sm w-100" onclick="viewResume(${user.id})">
                        <i class="fas fa-eye me-1"></i> View
                    </button>
                    <button class="btn btn-outline-primary-custom btn-sm w-100" style="padding: 0.25rem 0.5rem; font-size: 0.85rem;" onclick="document.getElementById('resumeFile').click()">
                        <i class="fas fa-sync me-1"></i> Replace
                    </button>
                </div>
            </div>
        `;
    } else {
        container.innerHTML = `
            <div class="upload-area" onclick="document.getElementById('resumeFile').click()">
                <i class="fas fa-cloud-upload-alt upload-icon"></i>
                <h5 class="fw-bold">Upload Resume</h5>
                <p class="text-muted small mb-0">Drag & drop or click to browse</p>
                <p class="text-muted small mb-0">PDF, DOCX up to 5MB</p>
            </div>
        `;
    }
}

function addNotification(text, type = 'INFO') {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    let notifications = JSON.parse(localStorage.getItem(`notifications_${user.id}`)) || [];
    notifications.unshift({
        id: Date.now(),
        text: text,
        type: type,
        timestamp: new Date().toISOString(),
        read: false
    });
    localStorage.setItem(`notifications_${user.id}`, JSON.stringify(notifications));
    renderNotifications();
}

function initNotifications() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const key = `notifications_${user.id}`;
    if (!localStorage.getItem(key)) {
        const defaults = [];
        if (user.role === 'SEEKER') {
            defaults.push({
                id: 1,
                text: "Welcome to JobPortal! Complete your profile to get discovered.",
                type: "INFO",
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                read: false
            });
            defaults.push({
                id: 2,
                text: "Explore active jobs matching your profile in 'Find Jobs'.",
                type: "INFO",
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                read: false
            });
        } else {
            defaults.push({
                id: 1,
                text: "Welcome to JobPortal Company! Post a new job to start hiring.",
                type: "INFO",
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                read: false
            });
        }
        localStorage.setItem(key, JSON.stringify(defaults));
    }
    renderNotifications();
}

function renderNotifications() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    const notifications = JSON.parse(localStorage.getItem(`notifications_${user.id}`)) || [];
    const unreadCount = notifications.filter(n => !n.read).length;
    
    const badge = document.getElementById('notificationBadge');
    const countEl = document.getElementById('notificationCount');
    const list = document.getElementById('notificationList');
    
    if (badge) {
        badge.style.display = unreadCount > 0 ? 'block' : 'none';
    }
    if (countEl) {
        countEl.innerText = `${unreadCount} New`;
    }
    if (list) {
        list.innerHTML = '';
        if (notifications.length === 0) {
            list.innerHTML = `<div class="p-4 text-center text-muted small"><i class="fas fa-bell-slash d-block fs-3 mb-2 text-light"></i>No notifications yet</div>`;
            return;
        }
        notifications.forEach(n => {
            let icon = 'fa-info-circle text-primary';
            if (n.type === 'SUCCESS') icon = 'fa-check-circle text-success';
            if (n.type === 'WARNING') icon = 'fa-exclamation-circle text-warning';
            if (n.type === 'MATCH') icon = 'fa-briefcase text-purple';
            
            const timeAgo = formatTimeAgo(n.timestamp);
            const itemClass = n.read ? '' : 'bg-light fw-semibold';
            
            list.innerHTML += `
                <div class="p-3 border-bottom d-flex gap-3 align-items-start ${itemClass}" style="transition: background 0.2s;">
                    <i class="fas ${icon} fs-5 mt-1"></i>
                    <div style="flex: 1; min-width: 0;">
                        <p class="m-0 small text-dark" style="line-height: 1.4;">${n.text}</p>
                        <span class="text-muted" style="font-size: 0.7rem;">${timeAgo}</span>
                    </div>
                </div>
            `;
        });
    }
}

function formatTimeAgo(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(timestamp).toLocaleDateString();
}

function markAllNotificationsRead(e) {
    if (e) e.preventDefault();
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) return;
    let notifications = JSON.parse(localStorage.getItem(`notifications_${user.id}`)) || [];
    notifications.forEach(n => n.read = true);
    localStorage.setItem(`notifications_${user.id}`, JSON.stringify(notifications));
    renderNotifications();
}

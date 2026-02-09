// Dashboard Application Logic – wired to real API

const TENANT_ID = '12345678-1234-1234-1234-123456789012'; // Test Tenant ID
const USE_MOCK_DATA = true; // Fallback to mock only when API fails

// SPA Navigation
function navigateTo(viewId) {
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    const dashboardView = document.querySelector('.stats-grid').parentElement;
    const coursesView = document.getElementById('coursesView');

    if (viewId === 'dashboard') {
        document.getElementById('navDashboard').classList.add('active');
        document.querySelector('.stats-grid').style.display = 'grid';
        document.querySelector('.recent-activity').style.display = 'block';
        if (coursesView) coursesView.classList.add('hidden');
        document.querySelector('header h1').textContent = 'Dashboard Overview';
    } else if (viewId === 'courses') {
        document.getElementById('navCourses').classList.add('active');
        document.querySelector('.stats-grid').style.display = 'none';
        document.querySelector('.recent-activity').style.display = 'none';
        if (coursesView) {
            coursesView.classList.remove('hidden');
            fetchCourses();
        }
        document.querySelector('header h1').style.display = 'none';
    } else {
        alert('View not implemented: ' + viewId);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        dateElement.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }
    fetchDashboardData();

    // Form handlers
    document.getElementById('formCreateCourse')?.addEventListener('submit', onSubmitCreateCourse);
    document.getElementById('formAddItem')?.addEventListener('submit', onSubmitAddItem);
    document.getElementById('formEnrollUser')?.addEventListener('submit', onSubmitEnrollUser);
});

async function fetchDashboardData() {
    try {
        const response = await fetch(`/api/tenants/${TENANT_ID}/active-users`);
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const data = await response.json();
        if (data.success) {
            renderDashboard(data.users);
        } else {
            throw new Error('API reported failure');
        }
    } catch (error) {
        console.error('Fetch failed, using mock:', error);
        renderDashboard(getMockData());
        showNotification('Using simulation data', 'Could not connect to database.');
    }
}

function renderDashboard(users) {
    document.getElementById('totalStudents').textContent = users.length;
    const completed = users.filter(u => u.status === 'completed').length;
    document.getElementById('completedCourses').textContent = completed;
    const active = users.filter(u => u.status === 'active').length;
    document.getElementById('activeLearners').textContent = active;

    const tableBody = document.querySelector('#usersTable tbody');
    tableBody.innerHTML = '';

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No users found.</td></tr>';
        return;
    }

    users.forEach(user => {
        const progress = user.total_items > 0 ? Math.round((user.completed_items / user.total_items) * 100) : 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><div style="font-weight: 500;">${user.name || '—'}</div></td>
            <td>${user.phone_number}</td>
            <td>${user.course_title || 'No Course'}</td>
            <td>
                <div style="display: flex; align-items: center;">
                    <div style="width: 100px; height: 6px; background: #eee; border-radius: 3px; margin-right: 8px;">
                        <div style="width: ${progress}%; height: 100%; background: var(--primary-color); border-radius: 3px;"></div>
                    </div>
                    <span>${progress}%</span>
                </div>
            </td>
            <td><span class="badge ${user.status}">${user.status}</span></td>
            <td>
                <button class="action-btn" title="View"><i class="fa-regular fa-eye"></i></button>
                <button class="action-btn" title="Edit"><i class="fa-regular fa-pen-to-square"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// —— Courses (real API) ——
async function fetchCourses() {
    const listContainer = document.getElementById('courseList');
    listContainer.innerHTML = '<div class="loading">Loading courses...</div>';

    try {
        const response = await fetch(`/api/tenant/${TENANT_ID}/courses`);
        if (!response.ok) throw new Error('API Failed');
        const courses = await response.json();
        renderCourseList(courses);
    } catch (e) {
        console.warn('Courses API failed, using mock:', e);
        renderCourseList(getMockCourses());
    }
}

function renderCourseList(courses) {
    const listContainer = document.getElementById('courseList');
    listContainer.innerHTML = '';

    document.getElementById('courseList').style.display = 'grid';
    document.getElementById('courseEditor').classList.add('hidden');

    if (courses.length === 0) {
        listContainer.innerHTML = '<p>No courses yet. Click "Create Course" to add one.</p>';
        return;
    }

    courses.forEach(course => {
        const card = document.createElement('div');
        card.className = 'course-card';
        card.onclick = () => openCourseEditor(course);
        card.innerHTML = `
            <h3>${course.title}</h3>
            <p>${course.description || 'No description'}</p>
            <div class="course-meta">
                <span><i class="fa-regular fa-clock"></i> Course</span>
                <span><i class="fa-solid fa-users"></i> Active</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

let currentCourseId = null;

async function openCourseEditor(course) {
    document.getElementById('courseList').style.display = 'none';
    document.getElementById('courseEditor').classList.remove('hidden');

    document.getElementById('editorCourseTitle').textContent = course.title;
    document.getElementById('editorCourseDesc').textContent = course.description || '';

    currentCourseId = course.id;
    const flowContainer = document.getElementById('courseFlow');
    flowContainer.innerHTML = '<div class="loading">Loading items...</div>';

    try {
        const response = await fetch(`/api/courses/${course.id}`);
        if (!response.ok) throw new Error('Failed to load course');
        const data = await response.json();
        const items = data.items || [];
        renderCourseItems(items);
    } catch (e) {
        console.warn('Course items failed, showing empty:', e);
        renderCourseItems([]);
    }
}

function renderCourseItems(items) {
    const flowContainer = document.getElementById('courseFlow');
    flowContainer.innerHTML = '';

    if (items.length === 0) {
        flowContainer.innerHTML = '<p class="text-center" style="color: var(--text-secondary);">No items yet. Add one below.</p>';
    }

    items.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flow-item';
        let icon = 'fa-file-lines';
        if (item.type === 'video') icon = 'fa-video';
        if (item.type === 'image') icon = 'fa-image';
        if (item.type === 'audio') icon = 'fa-volume-high';
        if (item.type === 'quiz') icon = 'fa-circle-question';

        const preview = (item.content_url || item.title || '').substring(0, 60);
        itemEl.innerHTML = `
            <div class="flow-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="flow-content">
                <span class="flow-type-badge">${item.type}</span>
                <h4>${item.title || 'Untitled'}</h4>
                <p>${preview}${(item.content_url && item.content_url.length > 60) ? '…' : ''}</p>
            </div>
            <div class="flow-actions">
                <button class="action-btn"><i class="fa-solid fa-ellipsis-vertical"></i></button>
            </div>
        `;
        flowContainer.appendChild(itemEl);
    });
}

function showCourseList() {
    document.getElementById('courseList').style.display = 'grid';
    document.getElementById('courseEditor').classList.add('hidden');
    currentCourseId = null;
}

// —— Modals ——
function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}
function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function showCreateCourseModal() {
    document.getElementById('newCourseTitle').value = '';
    document.getElementById('newCourseDesc').value = '';
    openModal('modalCreateCourse');
}

async function onSubmitCreateCourse(e) {
    e.preventDefault();
    const title = document.getElementById('newCourseTitle').value.trim();
    const description = document.getElementById('newCourseDesc').value.trim();
    if (!title) return;

    try {
        const response = await fetch(`/api/tenant/${TENANT_ID}/courses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, description, passing_score: 70 })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed');
        closeModal('modalCreateCourse');
        showNotification('Course created', title);
        fetchCourses();
    } catch (err) {
        showNotification('Error', err.message || 'Could not create course');
    }
}

function addCourseItem() {
    if (!currentCourseId) {
        showNotification('Error', 'Open a course first.');
        return;
    }
    document.getElementById('newItemType').value = 'text';
    document.getElementById('newItemTitle').value = '';
    document.getElementById('newItemContent').value = '';
    openModal('modalAddItem');
}

async function onSubmitAddItem(e) {
    e.preventDefault();
    const type = document.getElementById('newItemType').value;
    const title = document.getElementById('newItemTitle').value.trim();
    const content_url = document.getElementById('newItemContent').value.trim() || title;
    if (!title || !currentCourseId) return;

    try {
        const response = await fetch(`/api/courses/${currentCourseId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, title, content_url })
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed');
        closeModal('modalAddItem');
        showNotification('Item added', title);
        openCourseEditor({ id: currentCourseId, title: document.getElementById('editorCourseTitle').textContent, description: document.getElementById('editorCourseDesc').textContent });
    } catch (err) {
        showNotification('Error', err.message || 'Could not add item');
    }
}

function showEnrollUserModal() {
    const select = document.getElementById('enrollCourseId');
    select.innerHTML = '<option value="">Loading...</option>';
    openModal('modalEnrollUser');

    fetch(`/api/tenant/${TENANT_ID}/courses`)
        .then(r => r.ok ? r.json() : [])
        .then(courses => {
            select.innerHTML = courses.length ? '' : '<option value="">No courses</option>';
            courses.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.id;
                opt.textContent = c.title;
                select.appendChild(opt);
            });
        })
        .catch(() => { select.innerHTML = '<option value="">Failed to load</option>'; });
}

async function onSubmitEnrollUser(e) {
    e.preventDefault();
    const phoneNumber = document.getElementById('enrollPhone').value.trim().replace(/\D/g, '');
    const userName = document.getElementById('enrollName').value.trim() || null;
    const courseId = document.getElementById('enrollCourseId').value;
    const sendWithStartButton = document.getElementById('enrollWithStartButton').checked;

    if (!phoneNumber || !courseId) {
        showNotification('Error', 'Phone and course are required.');
        return;
    }

    try {
        const response = await fetch(`/api/tenants/${TENANT_ID}/enroll-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phoneNumber, courseId, userName, sendWithStartButton })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Enrollment failed');

        closeModal('modalEnrollUser');
        showNotification('User enrolled', 'First message sent to ' + phoneNumber);
        fetchDashboardData();
    } catch (err) {
        showNotification('Error', err.message || 'Could not enroll user');
    }
}

// Wire "Enroll New User" button
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btnEnrollUser');
    if (btn) btn.addEventListener('click', showEnrollUserModal);
});

// Mock data (fallbacks)
function getMockData() {
    return [
        { name: 'Juan Perez', phone_number: '+573001234567', course_title: 'Onboarding 101', status: 'active', total_items: 10, completed_items: 3 },
        { name: 'Maria Garcia', phone_number: '+573109876543', course_title: 'Safety Training', status: 'completed', total_items: 5, completed_items: 5 }
    ];
}
function getMockCourses() {
    return [
        { id: '1', title: 'Onboarding 101', description: 'Essential company policies and welcome guide.' },
        { id: '2', title: 'Safety Training', description: 'Workplace safety standards and emergency protocols.' }
    ];
}

function showNotification(title, message) {
    console.log(`[NOTIFICATION] ${title}: ${message}`);
    if (typeof alert !== 'undefined') alert(title + ': ' + message);
}

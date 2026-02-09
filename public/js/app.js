// Dashboard Application Logic

const TENANT_ID = '12345678-1234-1234-1234-123456789012'; // Test Tenant ID
const USE_MOCK_DATA = true; // Set to true to force mock data, or auto-detect on fetch failure

// SPA Navigation
function navigateTo(viewId) {
    // Update Sidebar
    document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));

    // Hide all main views (assuming distinct sections, though mainly swapping content for now)
    const dashboardView = document.querySelector('.stats-grid').parentElement; // Main stats & table
    const coursesView = document.getElementById('coursesView');

    // Reset Views
    if (viewId === 'dashboard') {
        document.getElementById('navDashboard').classList.add('active');
        document.querySelector('.stats-grid').style.display = 'grid';
        document.querySelector('.recent-activity').style.display = 'block';
        if (coursesView) coursesView.classList.add('hidden');
        document.querySelector('header h1').textContent = 'Dashboard Overview';
    }
    else if (viewId === 'courses') {
        document.getElementById('navCourses').classList.add('active');
        document.querySelector('.stats-grid').style.display = 'none';
        document.querySelector('.recent-activity').style.display = 'none';
        if (coursesView) {
            coursesView.classList.remove('hidden');
            fetchCourses(); // Load courses when view is active
        }
        document.querySelector('header h1').style.display = 'none'; // Hide main header, use section header
    } else {
        alert('View not implemented: ' + viewId);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Set current date
    const dateElement = document.getElementById('currentDate');
    if (dateElement) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateElement.textContent = new Date().toLocaleDateString('en-US', options);
    }

    // Initial load
    fetchDashboardData();
});

async function fetchDashboardData() {
    try {
        console.log('Fetching dashboard data...');
        // Try to fetch from real API
        const response = await fetch(`/api/tenants/${TENANT_ID}/active-users`);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            renderDashboard(data.users);
        } else {
            console.warn('API returned success=false');
            throw new Error('API reported failure');
        }
    } catch (error) {
        console.error('Fetch failed, falling back to Mock Data:', error);
        // Fallback to mock data
        renderDashboard(getMockData());
        showNotification('Using Simulation Data', 'Could not connect to database. Displaying mock data.');
    }
}

function renderDashboard(users) {
    // 1. Update Stats
    document.getElementById('totalStudents').textContent = users.length;

    const completed = users.filter(u => u.status === 'completed').length;
    document.getElementById('completedCourses').textContent = completed;

    const active = users.filter(u => u.status === 'active').length;
    document.getElementById('activeLearners').textContent = active;

    // 2. Populate Table
    const tableBody = document.querySelector('#usersTable tbody');
    tableBody.innerHTML = '';

    if (users.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center">No users found.</td></tr>';
        return;
    }

    users.forEach(user => {
        const tr = document.createElement('tr');

        // Calculate progress percentage (simple mock logic)
        const progress = user.total_items > 0
            ? Math.round((user.completed_items / user.total_items) * 100)
            : 0;

        tr.innerHTML = `
            <td>
                <div style="font-weight: 500;">${user.name}</div>
            </td>
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
                <button class="action-btn" title="View Details"><i class="fa-regular fa-eye"></i></button>
                <button class="action-btn" title="Edit User"><i class="fa-regular fa-pen-to-square"></i></button>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

// ===== COURSE MANAGEMENT LOGIC =====

async function fetchCourses() {
    const listContainer = document.getElementById('courseList');
    listContainer.innerHTML = '<div class="loading">Loading courses...</div>';

    try {
        // Try Real API
        const response = await fetch(`/api/tenant/${TENANT_ID}/courses`);
        if (!response.ok) throw new Error('API Failed');
        const courses = await response.json();
        renderCourseList(courses);
    } catch (e) {
        console.warn('Using Mock Courses');
        renderCourseList(getMockCourses());
    }
}

function renderCourseList(courses) {
    const listContainer = document.getElementById('courseList');
    listContainer.innerHTML = '';

    // Ensure we are in list view
    document.getElementById('courseList').style.display = 'grid'; // Grid layout
    document.getElementById('courseEditor').classList.add('hidden');

    if (courses.length === 0) {
        listContainer.innerHTML = '<p>No courses found. Create one!</p>';
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
                <span><i class="fa-regular fa-clock"></i> 5 Modules</span>
                <span><i class="fa-solid fa-users"></i> Active</span>
            </div>
        `;
        listContainer.appendChild(card);
    });
}

function openCourseEditor(course) {
    // Switch views
    document.getElementById('courseList').style.display = 'none';
    document.getElementById('courseEditor').classList.remove('hidden');

    document.getElementById('editorCourseTitle').textContent = course.title;
    document.getElementById('editorCourseDesc').textContent = course.description;

    // Render Items (Flow)
    const flowContainer = document.getElementById('courseFlow');
    flowContainer.innerHTML = '';

    // Mock Items for now (In real app, fetch items via API)
    const items = getMockCourseItems(course.id);

    items.forEach((item, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flow-item';

        let icon = 'fa-file-lines';
        let bgClass = '';
        if (item.type === 'video') icon = 'fa-video';
        if (item.type === 'image') icon = 'fa-image';
        if (item.type === 'quiz') icon = 'fa-circle-question';

        itemEl.innerHTML = `
            <div class="flow-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="flow-content">
                <span class="flow-type-badge">${item.type}</span>
                <h4>${item.title}</h4>
                <p>${item.content_preview}</p>
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
}

// Mock Data Generators
function getMockData() {
    return [
        { name: 'Juan Perez', phone_number: '+573001234567', course_title: 'Onboarding 101', status: 'active', total_items: 10, completed_items: 3 },
        { name: 'Maria Garcia', phone_number: '+573109876543', course_title: 'Safety Training', status: 'completed', total_items: 5, completed_items: 5 }
    ];
}

function getMockCourses() {
    return [
        { id: 1, title: 'Onboarding 101', description: 'Essential company policies and welcome guide.', created_at: '2023-10-01' },
        { id: 2, title: 'Safety Training', description: 'Workplace safety standards and emergency protocols.', created_at: '2023-11-15' },
        { id: 3, title: 'Sales Mastery', description: 'Advanced techniques for closing deals.', created_at: '2023-12-05' }
    ];
}

function getMockCourseItems(courseId) {
    return [
        { id: 1, type: 'text', title: 'Welcome Message', content_preview: 'Hi! Welcome to the course. Reply START to begin.' },
        { id: 2, type: 'video', title: 'Introduction Video', content_preview: 'Video: Company History (3:45)' },
        { id: 3, type: 'text', title: 'Key Logic', content_preview: 'Our core values are Integrity and Innovation.' },
        { id: 4, type: 'quiz', title: 'Quick Check', content_preview: 'Question: What is our #1 value?' },
        { id: 5, type: 'image', title: 'Office Map', content_preview: 'Image: floor_plan.jpg' }
    ];
}

function showNotification(title, message) {
    console.log(`[NOTIFICATION] ${title}: ${message}`);
}

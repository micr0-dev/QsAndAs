let adminMode = false;
let adminPassword = '';

let adminToken = localStorage.getItem('adminToken');
if (adminToken) {
    adminMode = true;
}

let wsConnection = null;

document.addEventListener('DOMContentLoaded', () => {
    console.log('Initializing WebSocket connection...');
    if (!wsConnection) {
        wsConnection = new PostsWebSocket();
    }
});

class PostsWebSocket {
    constructor() {
        this.connect();
        this.notificationSound = new Audio('/static/notification.mp3');
    }

    connect() {
        console.log('Connecting to WebSocket...');
        this.ws = new WebSocket(`ws://${window.location.host}/ws`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };

        this.ws.onmessage = this.handleMessage.bind(this);

        this.ws.onclose = () => {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(() => this.connect(), 1000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(event) {
        const data = JSON.parse(event.data);

        switch (data.type) {
            case 'new_question':
                this.handleNewQuestion(data.payload);
                break;
            case 'new_answer':
                this.handleNewAnswer(data.payload);
                break;
        }
    }

    handleNewQuestion(payload) {
        // Only notify admin of new questions
        if (adminMode) {
            this.playNotification();
            refreshQuestions();
        }
    }

    handleNewAnswer(payload) {
        // Everyone gets notified of new answers
        this.playNotification();
        refreshQuestions();
    }

    playNotification() {
        this.notificationSound.play().catch(err => {
            console.log('Could not play notification sound:', err);
        });
    }
}


const QuestionStatus = {
    getAsked: () => {
        const asked = JSON.parse(localStorage.getItem('askedQuestions') || '[]');
        return new Set(asked);
    },

    addAsked: (questionId) => {
        const asked = QuestionStatus.getAsked();
        asked.add(questionId);
        localStorage.setItem('askedQuestions', JSON.stringify([...asked]));
    },

    removeAsked: (questionId) => {
        const asked = QuestionStatus.getAsked();
        asked.delete(questionId);
        localStorage.setItem('askedQuestions', JSON.stringify([...asked]));
    },

    // New method to clean up answered questions
    cleanupAnswered: (questions) => {
        const asked = QuestionStatus.getAsked();
        let changed = false;

        questions.forEach(q => {
            if (asked.has(q.id) && q.answered) {
                asked.delete(q.id);
                changed = true;
            }
        });

        if (changed) {
            localStorage.setItem('askedQuestions', JSON.stringify([...asked]));
        }
    }
};



function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    if (diff < 1000 * 60) { // Less than 1 minute
        return 'just now';
    } else if (diff < 1000 * 60 * 60) { // Less than 1 hour
        return rtf.format(-Math.floor(diff / (1000 * 60)), 'minute');
    } else if (diff < 1000 * 60 * 60 * 24) { // Less than 1 day
        return rtf.format(-Math.floor(diff / (1000 * 60 * 60)), 'hour');
    } else if (diff < 1000 * 60 * 60 * 24 * 7) { // Less than 1 week
        return rtf.format(-Math.floor(diff / (1000 * 60 * 60 * 24)), 'day');
    }

    return new Intl.DateTimeFormat('default', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
        hour: 'numeric',
        minute: 'numeric'
    }).format(date);
}

// Auto-update timestamps periodically
function startTimeUpdates() {
    setInterval(() => {
        document.querySelectorAll('.question-timestamp').forEach(el => {
            const timestamp = el.dataset.timestamp;
            if (timestamp) {
                el.textContent = formatDate(timestamp);
            }
        });
    }, 60000); // Update every minute
}


function updateStats(stats) {
    const totalElement = document.getElementById('total-questions');
    const answeredElement = document.getElementById('answered-questions');
    const rateElement = document.getElementById('response-rate');

    totalElement.innerHTML = `<span>${stats.total}</span>`;
    answeredElement.innerHTML = `<span>${stats.answered}</span>`;
    rateElement.innerHTML = `<span>${stats.rate}%</span>`;
}

// Initialize theme from localStorage
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

// Generate colors from ID
function generateColors(id) {
    // Convert first 3 chars to hue value (0-360)
    const hue1 = parseInt(id.substring(0, 3), 16) % 360;
    // Convert last 3 chars to hue value (0-360)
    const hue2 = parseInt(id.substring(3, 6), 16) % 360;

    return {
        color1: `hsl(${hue1}, 80%, 60%)`,
        color2: `hsl(${hue2}, 80%, 60%)`
    };
}

function createQuestionCard(q) {
    const card = document.createElement('div');
    card.className = 'question-card';
    card.dataset.questionId = q.id;

    const colors = generateColors(q.id);
    card.style.setProperty('--card-color-1', colors.color1);
    card.style.setProperty('--card-color-2', colors.color2);

    const firstPart = q.id.substring(0, 3);
    const secondPart = q.id.substring(3, 6);

    const unreadBadge = !ReadStatus.isRead(q.id) ? '<div class="unread-badge"></div>' : '';

    const idHtml = `
        ${unreadBadge}
        <div class="question-id">
            <div class="id-hash">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="9" x2="20" y2="9"></line>
                    <line x1="4" y1="15" x2="20" y2="15"></line>
                    <line x1="10" y1="3" x2="8" y2="21"></line>
                    <line x1="16" y1="3" x2="14" y2="21"></line>
                </svg>
            </div>
            <div class="id-value">
                <span class="id-first-part" style="color: ${colors.color1}">${firstPart}</span>
                <span class="id-second-part" style="color: ${colors.color2}">${secondPart}</span>
            </div>
        </div>
    `;

    let html = `
        ${idHtml}
        <div class="question-timestamp" data-timestamp="${q.timestamp}">
            ${formatDate(q.timestamp)}
        </div>
        <div class="question-content">
            <div class="content-header">
                <svg class="question-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>Question</span>
            </div>
            ${q.question}
        </div>
    `;

    if (q.answered) {
        html += `
            <div class="answer-content">
                <div class="content-header">
                    <svg class="answer-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                    <span>Answer</span>
                </div>
                ${q.answer}
            </div>
        `;
    } else if (adminMode) {
        html += `
            <div class="answer-form">
                <textarea id="answer-${q.id}" placeholder="Write your answer..."></textarea>
                <button onclick="answerQuestion('${q.id}')">Submit Answer</button>
            </div>
        `;
    }

    card.innerHTML = html;
    return card;
}

function shouldReduceMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Use this when updating dynamic colors
function updateDynamicColors(questions) {
    if (!questions.length) return;

    const colors = questions.slice(0, 3).map(q => {
        const colors = generateColors(q.id);
        return [colors.color1, colors.color2];
    }).flat();

    while (colors.length < 2) {
        colors.push(colors[0] || 'hsl(230, 80%, 60%)');
    }

    // Create gradient with darker overlay
    const gradient = `linear-gradient(45deg, ${colors.join(', ')})`;

    // Apply styles based on motion preference
    if (shouldReduceMotion()) {
        // For reduced motion, use a simpler gradient or single color
        const simpleGradient = `linear-gradient(45deg, ${colors[0]}, ${colors[1]})`;
        document.documentElement.style.setProperty('--dynamic-gradient', simpleGradient);
    } else {
        document.documentElement.style.setProperty('--dynamic-gradient', gradient);
    }

    document.documentElement.style.setProperty('--dynamic-color', colors[0]);

    // Update profile card colors
    const profileCard = document.querySelector('.profile-card');
    if (profileCard) {
        profileCard.style.setProperty('--profile-color-1', colors[0]);
        profileCard.style.setProperty('--profile-color-2', colors[1]);
    }
}

// Optional: Listen for changes in motion preference
window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
    // Refresh the UI when preference changes
    refreshQuestions();
});


// Add this function to fetch a single question
async function fetchQuestion(id) {
    try {
        const response = await fetch(`/questions/${id}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.log(`Failed to fetch question ${id}:`, error);
    }
    return null;
}

// Modified refreshQuestions function
async function refreshQuestions() {
    const url = adminMode
        ? `/questions?all=true`
        : '/questions';

    try {
        // First, fetch all asked questions that aren't in the main feed
        const askedQuestions = QuestionStatus.getAsked();
        const askedQuestionsPromises = [...askedQuestions].map(id => fetchQuestion(id));
        const askedQuestionsResults = await Promise.all(askedQuestionsPromises);
        const validAskedQuestions = askedQuestionsResults.filter(q => q && !q.answered);

        // Then fetch the main feed
        const response = await fetchWithAuth(url);
        const data = await response.json();

        QuestionStatus.cleanupAnswered(data.questions);

        // Combine the questions
        const allQuestions = [...validAskedQuestions, ...data.questions];

        const container = document.getElementById('questions-container');
        container.innerHTML = '';

        //clear the profile card
        const profileCard = document.querySelector('.profile-card');
        if (profileCard) {
            profileCard.remove();
        }

        // Create sections
        const requestedSection = document.createElement('div');
        requestedSection.className = 'questions-section requested-section';

        const unreadSection = document.createElement('div');
        unreadSection.className = 'questions-section unread-section';

        const readSection = document.createElement('div');
        readSection.className = 'questions-section read-section';

        // Separate questions
        const requestedQuestions = validAskedQuestions;
        const unreadQuestions = [];
        const readQuestions = [];
        const pendingQuestions = []; // New array for unanswered questions

        // Sort all questions
        data.questions.forEach(q => {
            if (!q.answered) {
                if (!requestedQuestions.some(rq => rq.id === q.id)) {
                    // Only add to pending if it's not already in requested
                    pendingQuestions.push(q);
                }
            } else {
                if (ReadStatus.isRead(q.id)) {
                    readQuestions.push(q);
                } else {
                    unreadQuestions.push(q);
                }
            }
        });

        // Add requested section if there are pending questions
        if (requestedQuestions.length > 0) {
            requestedSection.innerHTML = `
                <div class="section-title">
                    Waiting for Answer
                    <span class="pending-count">${requestedQuestions.length}</span>
                </div>
            `;

            requestedQuestions.forEach(q => {
                const card = createQuestionCard(q);
                card.classList.add('requested');
                requestedSection.appendChild(card);
            });

            container.appendChild(requestedSection);
        }

        // Add pending section if there are pending questions
        if (adminMode && pendingQuestions.length > 0) {
            const pendingSection = document.createElement('div');
            pendingSection.className = 'questions-section pending-section';
            pendingSection.innerHTML = `
                <div class="section-title">
                    Pending Questions
                    <span class="pending-count">${pendingQuestions.length}</span>
                </div>
            `;

            pendingQuestions.forEach(q => {
                const card = createQuestionCard(q);
                card.classList.add('pending');
                pendingSection.appendChild(card);
            });

            container.appendChild(pendingSection);
        }

        // Add unread section if there are unread questions
        if (unreadQuestions.length > 0) {
            unreadSection.innerHTML = `
                <div class="section-title">
                    Unread Questions
                    <span class="unread-count">${unreadQuestions.length}</span>
                </div>
            `;

            unreadQuestions.forEach(q => {
                const card = createQuestionCard(q);
                card.classList.add('unread');
                unreadSection.appendChild(card);
            });

            container.appendChild(unreadSection);
        }

        // Add read section
        readSection.innerHTML = `
            <div class="section-title">
                Previously Read
            </div>
        `;

        readQuestions.forEach(q => {
            const card = createQuestionCard(q);
            readSection.appendChild(card);
        });

        container.appendChild(readSection);

        // Setup intersection observer for read tracking
        setupReadTracking();

        const cresponse = await fetch('/config');
        const config = await cresponse.json();

        const newProfileCard = createProfileCard(config.profile);
        document.querySelector('.container').insertBefore(
            newProfileCard,
            document.querySelector('.ask-form')
        );

        // Update dynamic colors with all questions
        updateDynamicColors(allQuestions);

        // After questions are loaded and colors are set
        setTimeout(() => {
            if (!scrollIndicator) {
                scrollIndicator = new ScrollIndicator();
            }
            scrollIndicator.updateGradient();
        }, 100);

        // Update stats
        updateStats(data.stats);
    } catch (error) {
        console.error('Error refreshing questions:', error);
    }
}

// Add a function to update the unread count in the UI
function updateUnreadCount() {
    const unreadSection = document.querySelector('.unread-section');
    const unreadCards = document.querySelectorAll('.question-card.unread');
    const unreadCount = document.querySelector('.unread-count');

    if (unreadCount) {
        if (unreadCards.length === 0) {
            unreadSection.remove();
        } else {
            unreadCount.textContent = unreadCards.length;
        }
    }
}


// Initialize theme when page loads
document.addEventListener('DOMContentLoaded', initTheme);

async function askQuestion() {
    const questionInput = document.getElementById('question-input');
    const question = questionInput.value;
    if (!question) return;

    try {
        const response = await fetch('/ask', {
            method: 'POST',
            body: new URLSearchParams({ question }),
        });

        if (response.status === 429) {
            // Rate limit exceeded
            const data = await response.json();
            showRateLimitError(data);
            return;
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        QuestionStatus.addAsked(data.id);
        questionInput.value = '';
        refreshQuestions();

    } catch (error) {
        console.error('Error asking question:', error);
        showError('Failed to submit question. Please try again.');
    }
}

function showRateLimitError(data) {
    const message = `
        You've reached the limit of ${data.limit} questions per ${data.period}.
        Please try again in ${formatDuration(data.retryAfter)}.
    `;

    // Create or update error message
    let errorDiv = document.querySelector('.rate-limit-error');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'rate-limit-error';
        document.querySelector('.ask-form').appendChild(errorDiv);
    }

    errorDiv.textContent = message;
    errorDiv.style.display = 'block';

    // Hide after 5 seconds
    setTimeout(() => {
        errorDiv.style.display = 'none';
    }, 10000);
}

function formatDuration(durationStr) {
    const duration = parseDuration(durationStr);
    if (duration < 60) {
        return `${Math.ceil(duration)} seconds`;
    }
    if (duration < 3600) {
        return `${Math.ceil(duration / 60)} minutes`;
    }
    return `${Math.ceil(duration / 3600)} hours`;
}

function parseDuration(durationStr) {
    // Simple duration parser for "1h2m3s" format
    const matches = durationStr.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!matches) return 0;

    const hours = parseInt(matches[1] || 0);
    const minutes = parseInt(matches[2] || 0);
    const seconds = parseInt(matches[3] || 0);

    return hours * 3600 + minutes * 60 + seconds;
}

function answerQuestion(id) {
    const answer = document.getElementById(`answer-${id}`).value;
    if (!answer) return;

    const formData = new URLSearchParams({
        id: id,
        answer: answer,
    });

    console.log('Form data:', formData.toString());

    fetchWithAuth('/answer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
    })
        .then(async response => {
            if (!response.ok) {
                // Try to get error message
                const text = await response.text();
                console.log('Error response:', text);
            }

            if (response.ok) {
                const newToken = response.headers.get('X-Admin-Token');
                if (newToken) {
                    adminToken = newToken;
                    localStorage.setItem('adminToken', newToken);
                }
                refreshQuestions();
            } else if (response.status === 401) {
                console.log('Authentication failed');
                adminToken = null;
                localStorage.removeItem('adminToken');
                adminMode = false;
                alert('Admin session expired. Please log in again.');
                // Refresh to clear admin UI
                refreshQuestions();
            }
        })
        .catch(error => {
            console.error('Error answering question:', error);
            alert('Failed to submit answer. Please try again.');
        });
}

// Initial load
refreshQuestions();

let adminPanelVisible = false;

function toggleAdminPanel() {
    const panel = document.querySelector('.admin-panel');
    panel.classList.toggle('visible');
    adminPanelVisible = !adminPanelVisible;
}

// Triple-click on stats
let clickCount = 0;
let clickTimer = null;

document.querySelector('#answered-questions').addEventListener('click', function (e) {
    clickCount++;

    if (clickCount === 3) {
        toggleAdminPanel();
    }

    if (clickTimer) {
        clearTimeout(clickTimer);
    }

    clickTimer = setTimeout(() => {
        clickCount = 0;
    }, 500);
});

const ReadStatus = {
    get: () => JSON.parse(localStorage.getItem('readQuestions') || '{}'),

    set: (status) => localStorage.setItem('readQuestions', JSON.stringify(status)),

    markRead: (questionId) => {
        const status = ReadStatus.get();
        status[questionId] = Date.now();
        ReadStatus.set(status);
    },

    isRead: (questionId) => {
        const status = ReadStatus.get();
        return !!status[questionId];
    }
};


// Modified setupReadTracking
function setupReadTracking() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const questionCard = entry.target;
            const questionId = questionCard.dataset.questionId;

            // Only track read status for answered questions
            if (entry.isIntersecting && questionId && !questionCard.classList.contains('requested')) {

                setTimeout(() => {
                    const stillExists = document.querySelector(`[data-question-id="${questionId}"]`);
                    if (stillExists) {
                        PendingChanges.add(questionId);
                    }
                }, 2000);
            }
        });
    }, {
        threshold: 0.5
    });

    // Only observe answered questions
    const cards = document.querySelectorAll('.question-card:not(.requested)');
    cards.forEach(card => observer.observe(card));
}


// Apply changes when user leaves
window.addEventListener('beforeunload', () => {
    PendingChanges.apply();
});

// Also apply when user switches tabs
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
        PendingChanges.apply();
    }
});

// Queue for tracking changes
const PendingChanges = {
    readQuestions: new Set(),

    add: function (questionId) {
        this.readQuestions.add(questionId);
    },

    apply: function () {
        const status = ReadStatus.get();
        this.readQuestions.forEach(id => {
            status[id] = Date.now();
        });
        ReadStatus.set(status);
        this.readQuestions.clear();

        refreshQuestions();

    }
};

class ScrollIndicator {
    constructor() {
        this.setupIndicator();
        this.setupEventListeners();
        this.isDragging = false;
        this.margin = 0; // Match the CSS margin
    }

    setupIndicator() {
        this.timeline = document.createElement('div');
        this.timeline.className = 'timeline';

        this.timelineLine = document.createElement('div');
        this.timelineLine.className = 'timeline-line';
        this.timeline.appendChild(this.timelineLine);

        this.indicator = document.createElement('div');
        this.indicator.className = 'scroll-progress';

        this.sectionsContainer = document.createElement('div');
        this.sectionsContainer.className = 'scroll-sections';

        this.scrollClip = document.createElement('div');
        this.scrollClip.className = 'scroll-clip';

        this.scrollClip.style.setProperty('--scroll-clip', '100%');
        this.timelineLine.style.setProperty('--scroll-clip', '100%');

        this.indicator.appendChild(this.scrollClip);
        this.scrollClip.appendChild(this.sectionsContainer);
        this.timeline.appendChild(this.indicator);
        document.body.prepend(this.timeline);
    }

    updateGradient() {
        const questions = document.querySelectorAll('.question-card');
        const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;

        this.sectionsContainer.innerHTML = '';

        questions.forEach(question => {
            const rect = question.getBoundingClientRect();
            const scrollTop = window.scrollY + rect.top - window.innerHeight / 2;

            const questionTop = ((scrollTop / totalHeight) * 100);
            const questionHeight = (rect.height / totalHeight) * 100;

            const colors = this.getComputedColors(question);

            const sectionBar = document.createElement('div');
            sectionBar.className = 'section-bar';
            sectionBar.style.top = `${questionTop}%`;
            sectionBar.style.height = `${questionHeight}%`;
            sectionBar.style.setProperty('--start-color', colors.color1);
            sectionBar.style.setProperty('--end-color', colors.color2);

            this.sectionsContainer.appendChild(sectionBar);
        });
    }


    handleClick(e) {
        if (this.isDragging) return;

        const rect = this.indicator.getBoundingClientRect();
        const availableHeight = rect.height;
        const clickY = e.clientY - rect.top - this.margin;
        const clickPosition = clickY / availableHeight;

        this.scrollToPosition(clickPosition);
    }

    handleDrag(e) {
        if (!this.isDragging) return;

        const rect = this.indicator.getBoundingClientRect();
        const availableHeight = rect.height - (this.margin * 2);
        const y = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        const dragY = y - rect.top - this.margin;
        const position = dragY / availableHeight;

        this.scrollToPosition(position);
    }

    scrollToPosition(position) {
        position = Math.max(0, Math.min(1, position));
        const totalHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrollTarget = position * totalHeight;

        window.scrollTo({
            top: scrollTarget,
            behavior: 'smooth'
        });
    }

    updateProgress() {
        const winScroll = document.documentElement.scrollTop;
        const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const scrolled = (winScroll / height) * 100;
        this.scrollClip.style.setProperty('--scroll-clip', `${100 - scrolled}%`);
        this.timelineLine.style.setProperty('--scroll-clip', `${100 - scrolled}%`);
    }

    setupEventListeners() {
        window.addEventListener('scroll', this.updateProgress.bind(this));
        window.addEventListener('resize', this.updateGradient.bind(this));

        // Click handling
        this.indicator.addEventListener('click', this.handleClick.bind(this));

        // Drag handling
        this.indicator.addEventListener('mousedown', this.startDrag.bind(this));
        window.addEventListener('mousemove', this.handleDrag.bind(this));
        window.addEventListener('mouseup', this.stopDrag.bind(this));

        // Touch handling for mobile
        this.indicator.addEventListener('touchstart', this.startDrag.bind(this));
        window.addEventListener('touchmove', this.handleDrag.bind(this));
        window.addEventListener('touchend', this.stopDrag.bind(this));
    }

    startDrag(e) {
        this.isDragging = true;
        this.indicator.classList.add('dragging');

        // Prevent text selection while dragging
        e.preventDefault();
    }

    stopDrag() {
        this.isDragging = false;
        this.indicator.classList.remove('dragging');
    }

    getComputedColors(element) {
        return {
            color1: element.style.getPropertyValue('--card-color-1') || '#000',
            color2: element.style.getPropertyValue('--card-color-2') || '#000'
        };
    }
}

// Initialize the scroll indicator
let scrollIndicator;

// Add click navigation to markers
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('section-marker')) {
        const sectionTitle = e.target.dataset.section;
        const section = Array.from(document.querySelectorAll('.questions-section'))
            .find(s => s.querySelector('.section-title').textContent.trim() === sectionTitle);

        if (section) {
            section.scrollIntoView({ behavior: 'smooth' });
        }
    }
});



function toggleAdminMode() {
    const password = document.getElementById('admin-password').value;

    if (adminToken) {
        // Try with existing token first
        fetchWithAuth('/questions?all=true')
            .then(response => {
                if (!response.ok) {
                    // Token invalid, try with password
                    tryPasswordAuth(password);
                }
            })
            .catch(() => tryPasswordAuth(password));
    } else {
        tryPasswordAuth(password);
    }
}

function tryPasswordAuth(password) {
    fetch('/questions?all=true&password=' + encodeURIComponent(password))
        .then(response => {
            if (response.ok) {
                const token = response.headers.get('X-Admin-Token');
                if (token) {
                    adminToken = token;
                    localStorage.setItem('adminToken', token);
                }
                adminMode = true;
                refreshQuestions();
            }
        });
}

function fetchWithAuth(url, options = {}) {

    if (adminToken) {
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${adminToken}`
        };
        console.log('Added auth headers:', options.headers);
    }
    return fetch(url, options);
}

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = [
            { keys: ['Alt', 'N'], description: 'New question', action: () => this.focusQuestionInput() },
            { keys: ['Ctrl', 'Enter'], description: 'Submit question/answer', action: () => this.submitCurrent() },
            { keys: ['?'], description: 'Show shortcuts', action: () => this.toggleShortcutsOverlay() },
            { keys: ['Esc'], description: 'Close overlay / Blur input', action: () => this.handleEscape() },
            { keys: ['Alt', 'A'], description: 'Toggle admin mode', action: () => this.toggleAdmin() },
        ];

        this.setupOverlay();
        this.bindShortcuts();
    }

    setupOverlay() {
        // Create shortcuts overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'shortcuts-overlay';
        this.overlay.innerHTML = `
            <div class="shortcuts-modal">
                <h2>Keyboard Shortcuts</h2>
                <div class="shortcuts-list">
                    ${this.shortcuts.map(s => `
                        <div class="shortcut-key">
                            ${s.keys.map(k => `<span class="key">${k}</span>`).join('+')}
                        </div>
                        <div class="shortcut-description">${s.description}</div>
                    `).join('')}
                </div>
                <small>Press ? to toggle this overlay</small>
            </div>
        `;
        document.body.appendChild(this.overlay);

        // Close on click outside modal
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) {
                this.hideShortcutsOverlay();
            }
        });
    }

    bindShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Submit with Ctrl+Enter
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                const focused = document.activeElement;
                if (focused.id === 'question-input') {
                    askQuestion();
                } else if (focused.id?.startsWith('answer-')) {
                    const questionId = focused.id.replace('answer-', '');
                    answerQuestion(questionId);
                }
            }

            // Don't trigger shortcuts when typing in input fields
            if (e.target.matches('input, textarea') && e.key !== 'Escape') {
                return;
            }

            // Show shortcuts overlay
            if (e.key === '?' && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                this.toggleShortcutsOverlay();
                return;
            }

            // Focus question input with Alt+N
            if (e.altKey && e.key.toLowerCase() === 'n') {
                e.preventDefault();
                document.getElementById('question-input')?.focus();
            }

            // Toggle admin panel with Alt+A
            if (e.altKey && e.key.toLowerCase() === 'a') {
                e.preventDefault();
                toggleAdminPanel();
            }

            // Blur inputs with Escape
            if (e.key === 'Escape') {
                document.activeElement.blur();
            }

            // Handle other shortcuts
            this.shortcuts.forEach(shortcut => {
                if (this.matchesShortcut(e, shortcut.keys)) {
                    e.preventDefault();
                    shortcut.action();
                }
            });
        });
    }

    matchesShortcut(event, keys) {
        const pressedKeys = [];
        if (event.ctrlKey) pressedKeys.push('Ctrl');
        if (event.altKey) pressedKeys.push('Alt');
        if (event.shiftKey) pressedKeys.push('Shift');
        if (!['Ctrl', 'Alt', 'Shift'].includes(event.key)) {
            pressedKeys.push(event.key);
        }

        return JSON.stringify(pressedKeys) === JSON.stringify(keys);
    }

    focusQuestionInput() {
        document.getElementById('question-input')?.focus();
    }

    submitCurrent() {
        const focused = document.activeElement;
        if (focused.id === 'question-input') {
            askQuestion();
        } else if (focused.id?.startsWith('answer-')) {
            const questionId = focused.id.replace('answer-', '');
            answerQuestion(questionId);
        }
    }

    toggleShortcutsOverlay() {
        this.overlay.classList.toggle('show');
    }

    hideShortcutsOverlay() {
        this.overlay.classList.remove('show');
    }

    handleEscape() {
        if (this.overlay.classList.contains('show')) {
            this.hideShortcutsOverlay();
        } else {
            document.activeElement.blur();
        }
    }

    toggleAdmin() {
        const adminPanel = document.querySelector('.admin-panel');
        if (adminPanel) {
            toggleAdminPanel();
        }
    }
}

// Initialize keyboard shortcuts when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new KeyboardShortcuts();
});

function createAttributionPanel() {
    const panel = document.createElement('div');
    panel.className = 'attribution-panel';

    panel.innerHTML = `
        <a href="https://github.com/micr0-dev/QsAndAs" 
           class="attribution-link" 
           target="_blank" 
           title="View source on GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
        </a>
        
        <a href="https://ko-fi.com/micr0byte" 
           class="attribution-link" 
           target="_blank" 
           title="Support on Ko-fi">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/>
            </svg>
        </a>
    `;

    document.body.appendChild(panel);
}

// Initialize when the page loads
document.addEventListener('DOMContentLoaded', createAttributionPanel);

const ColorUtils = {
    // Convert hex to RGB
    hexToRGB(hex) {
        let r = 0, g = 0, b = 0;

        // Handle #RGB format
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        }
        // Handle #RRGGBB format
        else if (hex.length === 7) {
            r = parseInt(hex.substring(1, 3), 16);
            g = parseInt(hex.substring(3, 5), 16);
            b = parseInt(hex.substring(5, 7), 16);
        }

        return { r, g, b };
    },

    // Convert RGB to HSL
    rgbToHSL(r, g, b) {
        r /= 255;
        g /= 255;
        b /= 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

            switch (max) {
                case r:
                    h = (g - b) / d + (g < b ? 6 : 0);
                    break;
                case g:
                    h = (b - r) / d + 2;
                    break;
                case b:
                    h = (r - g) / d + 4;
                    break;
            }

            h /= 6;
        }

        return {
            h: h * 360,
            s: s * 100,
            l: l * 100
        };
    },

    // Convert HSL to RGB
    hslToRGB(h, s, l) {
        h /= 360;
        s /= 100;
        l /= 100;

        let r, g, b;

        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;

            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255)
        };
    },

    // Convert RGB to Hex
    rgbToHex(r, g, b) {
        const toHex = (c) => {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }
};

function adjustHue(hex, degree) {
    // Remove # if present
    hex = hex.replace(/^#/, '');

    // Convert hex to RGB
    const rgb = ColorUtils.hexToRGB('#' + hex);

    // Convert RGB to HSL
    const hsl = ColorUtils.rgbToHSL(rgb.r, rgb.g, rgb.b);

    // Adjust hue
    hsl.h = (hsl.h + degree) % 360;
    if (hsl.h < 0) hsl.h += 360;

    // Convert back to RGB
    const newRgb = ColorUtils.hslToRGB(hsl.h, hsl.s, hsl.l);

    // Convert back to hex
    return ColorUtils.rgbToHex(newRgb.r, newRgb.g, newRgb.b);
}

class SocialLinks {
    static platforms = {
        github: {
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>',
        },
        bluesky: {
            icon: '<svg viewBox="0 0 600 530" fill="currentColor"><path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/></svg>',
        },
        twitter: {
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>',
        },
        mastodon: {
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path xmlns="http://www.w3.org/2000/svg" d="M21.327 8.566c0-4.339-2.843-5.61-2.843-5.61-1.433-.658-3.894-.935-6.451-.956h-.063c-2.557.021-5.016.298-6.45.956 0 0-2.843 1.272-2.843 5.61 0 .993-.019 2.181.012 3.441.103 4.243.778 8.425 4.701 9.463 1.809.479 3.362.579 4.612.51 2.268-.126 3.541-.809 3.541-.809l-.075-1.646s-1.621.511-3.441.449c-1.804-.062-3.707-.194-3.999-2.409a4.523 4.523 0 0 1-.04-.621s1.77.433 4.014.536c1.372.063 2.658-.08 3.965-.236 2.506-.299 4.688-1.843 4.962-3.254.434-2.223.398-5.424.398-5.424zm-3.353 5.59h-2.081V9.057c0-1.075-.452-1.62-1.357-1.62-1 0-1.501.647-1.501 1.927v2.791h-2.069V9.364c0-1.28-.501-1.927-1.502-1.927-.905 0-1.357.546-1.357 1.62v5.099H6.026V8.903c0-1.074.273-1.927.823-2.558.566-.631 1.307-.955 2.228-.955 1.065 0 1.872.409 2.405 1.228l.518.869.519-.869c.533-.819 1.34-1.228 2.405-1.228.92 0 1.662.324 2.228.955.549.631.822 1.484.822 2.558v5.253z"/></svg>',
        },
        kofi: {
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z"/></svg>',
        },
        spotify: {
            icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path xmlns="http://www.w3.org/2000/svg" d="M19.098 10.638c-3.868-2.297-10.248-2.508-13.941-1.387-.593.18-1.22-.155-1.399-.748-.18-.593.154-1.22.748-1.4 4.239-1.287 11.285-1.038 15.738 1.605.533.317.708 1.005.392 1.538-.316.533-1.005.709-1.538.392zm-.126 3.403c-.272.44-.847.578-1.287.308-3.225-1.982-8.142-2.557-11.958-1.399-.494.15-1.017-.129-1.167-.623-.149-.495.13-1.016.624-1.167 4.358-1.322 9.776-.682 13.48 1.595.44.27.578.847.308 1.286zm-1.469 3.267c-.215.354-.676.465-1.028.249-2.818-1.722-6.365-2.111-10.542-1.157-.402.092-.803-.16-.895-.562-.092-.403.159-.804.562-.896 4.571-1.045 8.492-.595 11.655 1.338.353.215.464.676.248 1.028zm-5.503-17.308c-6.627 0-12 5.373-12 12 0 6.628 5.373 12 12 12 6.628 0 12-5.372 12-12 0-6.627-5.372-12-12-12z"/></svg>',
        },

    };

    static createSocialLinks(links = {}) {
        // Check if links exist
        if (!links || Object.keys(links).length === 0) {
            console.log('No social links configured');
            return '';
        }

        return Object.entries(links).map(([platform, url]) => {
            // Skip empty URLs
            if (!url) return '';

            const platformInfo = this.platforms[platform] || {
                icon: '<svg viewBox="0 -960 960 960" fill="currentColor"><path xmlns="http://www.w3.org/2000/svg" d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm-40-82v-78q-33 0-56.5-23.5T360-320v-40L168-552q-3 18-5.5 36t-2.5 36q0 121 79.5 212T440-162Zm276-102q20-22 36-47.5t26.5-53q10.5-27.5 16-56.5t5.5-59q0-98-54.5-179T600-776v16q0 33-23.5 56.5T520-680h-80v80q0 17-11.5 28.5T400-560h-80v80h240q17 0 28.5 11.5T600-440v120h40q26 0 47 15.5t29 40.5Z"/></svg>',
                domain: platform
            };

            return `
            <a href="${url}" 
               class="social-link" 
               data-platform="${platform}"
               target="_blank" 
               rel="noopener noreferrer">
                ${platformInfo.icon}
                <span>${toTitleCase(platform)}</span>
            </a>
        `;
        }).filter(link => link).join('');
    }
}

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
    );
}


function createProfileCard(profile) {
    const card = document.createElement('div');
    card.className = 'profile-card';

    card.innerHTML = `
        <div class="profile-header">
        <div class="profile-avatar">
                <img src="${profile.Avatar}" alt="${profile.Username}" />
            </div>
            <div class="profile-info">
                <h1 class="profile-username">${profile.Username}</h1>
                <div class="profile-bio">
                    ${profile.Bio}
                </div>
            </div>
        </div>
        <div class="profile-social">
            ${SocialLinks.createSocialLinks(profile.Social)}
        </div>
    `;

    return card;
}
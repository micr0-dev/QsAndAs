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
        console.log('Getting asked questions:', asked);
        return new Set(asked);
    },

    addAsked: (questionId) => {
        const asked = QuestionStatus.getAsked();
        asked.add(questionId);
        localStorage.setItem('askedQuestions', JSON.stringify([...asked]));
        console.log('Added asked question:', questionId);
    },

    removeAsked: (questionId) => {
        const asked = QuestionStatus.getAsked();
        asked.delete(questionId);
        localStorage.setItem('askedQuestions', JSON.stringify([...asked]));
        console.log('Removed asked question:', questionId);
    },

    // New method to clean up answered questions
    cleanupAnswered: (questions) => {
        const asked = QuestionStatus.getAsked();
        let changed = false;

        questions.forEach(q => {
            if (asked.has(q.id) && q.answered) {
                asked.delete(q.id);
                changed = true;
                console.log('Removed answered question from asked:', q.id);
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
document.querySelector('h1').setAttribute('data-text', document.querySelector('h1').textContent);

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
let adminMode = false;
let adminPassword = '';

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
        ? `/questions?all=true&password=${encodeURIComponent(adminPassword)}`
        : '/questions';

    try {
        // First, fetch all asked questions that aren't in the main feed
        const askedQuestions = QuestionStatus.getAsked();
        const askedQuestionsPromises = [...askedQuestions].map(id => fetchQuestion(id));
        const askedQuestionsResults = await Promise.all(askedQuestionsPromises);
        const validAskedQuestions = askedQuestionsResults.filter(q => q && !q.answered);

        // Then fetch the main feed
        const response = await fetch(url);
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

        // Only sort answered questions into read/unread
        data.questions.forEach(q => {
            if (q.answered) {  // Only check read status for answered questions
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

function askQuestion() {
    const question = document.getElementById('question-input').value;
    if (!question) return;

    fetch('/ask', {
        method: 'POST',
        body: new URLSearchParams({ question }),
    })
        .then(response => response.json())
        .then(data => {
            QuestionStatus.addAsked(data.id);
            document.getElementById('question-input').value = '';
            refreshQuestions();
        });
}

function answerQuestion(id) {
    const answer = document.getElementById(`answer-${id}`).value;
    if (!answer) return;

    fetch('/answer', {
        method: 'POST',
        body: new URLSearchParams({
            id,
            answer,
            password: adminPassword
        }),
    })
        .then(() => refreshQuestions());
}

function toggleAdminMode() {
    adminPassword = document.getElementById('admin-password').value;
    adminMode = !adminMode;
    refreshQuestions();
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

// Keyboard shortcut
document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.altKey && e.key === 'a') {
        e.preventDefault();
        toggleAdminPanel();
    }
});

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

        // Refresh the UI
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
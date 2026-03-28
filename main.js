/* ═══════════════════════════════════
   SmartFocus Dashboard — script.js
   State → Render loop · localStorage
════════════════════════════════════ */

/* ── DOM REFERENCES ── */
const taskNameInput     = document.getElementById('task-name');
const taskImpactSlider  = document.getElementById('task-impact');
const taskUrgencySlider = document.getElementById('task-urgency');
const taskCategorySelect= document.getElementById('task-category');
const impactOutput      = document.getElementById('impact-output');
const urgencyOutput     = document.getElementById('urgency-output');
const addBtn            = document.getElementById('js-add-btn');
const formError         = document.getElementById('js-form-error');
const scorePreviewEl    = document.getElementById('js-score-preview');
const statTotal         = document.getElementById('js-stat-total');
const statDone          = document.getElementById('js-stat-done');
const statAvg           = document.getElementById('js-stat-avg');
const taskList          = document.getElementById('js-task-list');
const emptyState        = document.getElementById('js-empty-state');
const filterBtns        = document.querySelectorAll('.filter-btn');
const focusModeBtn      = document.getElementById('js-focus-mode-btn');
const dateEl            = document.getElementById('js-date');
const toastEl           = document.getElementById('js-toast');

// Timer
const timerDisplay      = document.getElementById('js-timer-display');
const timerTaskName     = document.getElementById('js-timer-task-name');
const timerStartBtn     = document.getElementById('js-timer-start');
const timerPauseBtn     = document.getElementById('js-timer-pause');
const timerStopBtn      = document.getElementById('js-timer-stop');
const timerHint         = document.getElementById('js-timer-hint');

// Insight
const insightMessage    = document.getElementById('js-insight-message');
const insightBadge      = document.getElementById('js-insight-badge');

// Chart
const pieChartSVG       = document.getElementById('js-pie-chart');
const chartLegend       = document.getElementById('js-chart-legend');
const chartEmpty        = document.getElementById('js-chart-empty');

// Sound
const soundBtn          = document.getElementById('js-sound-btn');
const soundIcon         = document.getElementById('js-sound-icon');


/* ── CONSTANTS ── */
const STORAGE_KEY  = 'smartfocus_tasks_v2';
const CHART_COLORS = [
  '#00E5C3','#FFB830','#FF5470','#7C6FFF',
  '#FF9F43','#00D2FF','#FF6B9D','#A8FF78',
];


/* ── STATE ── */
const state = {
  tasks:      [],
  filter:     'all',
  focusMode:  false,
  soundOn:    true,

  // Timer state
  timer: {
    selectedTaskId: null,   // ID of task currently selected
    running:        false,
    paused:         false,
    elapsed:        0,      // seconds accumulated this session
    intervalId:     null,
    tickStart:      null,   // Date.now() when last started/resumed
  },
};


/* ── LOCALSTORAGE ── */
function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
}

function loadTasks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    state.tasks = stored ? JSON.parse(stored) : [];
  } catch (e) {
    state.tasks = [];
  }
}


/* ── FOCUS SCORE ALGORITHM ──
   Formula: (Impact × 0.6 + Urgency × 0.4) × 20
   Result range: 20–100
── */
function calculateFocusScore(impact, urgency) {
  return Math.min(100, Math.max(20, Math.round((impact * 0.6 + urgency * 0.4) * 20)));
}

function getScoreTier(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  return 'medium';
}

function getScoreEmoji(score) {
  return { critical: '🔴', high: '🟡', medium: '🟢' }[getScoreTier(score)];
}


/* ── RENDER ── */
function render() {
  // Derive scores, sort descending
  let display = state.tasks
    .map(t => ({ ...t, score: calculateFocusScore(t.impact, t.urgency) }))
    .sort((a, b) => b.score - a.score);

  if (display.length > 0) display[0]._isTop = true;

  // Apply filter
  const filtered = display.filter(t =>
    state.filter === 'all' ? true : getScoreTier(t.score) === state.filter
  );

  const isEmpty = filtered.length === 0;
  emptyState.hidden = !isEmpty;
  taskList.hidden   = isEmpty;

  taskList.innerHTML = filtered.map((t, i) => buildTaskItemHTML(t, i)).join('');

  renderStats(display);
  renderPieChart();
  renderInsight();
}


/* ── TASK ITEM HTML ── */
function buildTaskItemHTML(task, index) {
  const tier     = getScoreTier(task.score);
  const isDone   = task.done   ? 'task-item--done'     : '';
  const isTop    = task._isTop ? 'task-item--top'      : '';
  const isSelected = task.id === state.timer.selectedTaskId ? 'task-item--selected' : '';

  // Format logged time badge if task has accumulated time
  const timeBadge = task.loggedSeconds > 0
    ? `<span class="task-item__time-badge">⏱ ${formatTime(task.loggedSeconds)}</span>`
    : '';

  return `
    <li class="task-item ${isDone} ${isTop} ${isSelected}"
        data-id="${task.id}"
        style="animation-delay:${index * 40}ms"
        title="Click to select for timer">
      <div class="task-item__bar task-item__bar--${tier}" aria-hidden="true"></div>
      <span class="task-item__score task-item__score--${tier}" aria-label="Focus score ${task.score}">${task.score}</span>
      <div class="task-item__info">
        <span class="task-item__name" title="${escapeHTML(task.name)}">${escapeHTML(task.name)}</span>
        ${timeBadge}
        <span class="task-item__meta">${getScoreEmoji(task.score)} ${tier.charAt(0).toUpperCase()+tier.slice(1)} &nbsp;·&nbsp; ${escapeHTML(task.category)}</span>
      </div>
      <div class="task-item__actions">
        <input type="checkbox" class="task-checkbox" data-action="toggle" data-id="${task.id}"
          ${task.done ? 'checked' : ''} aria-label="Complete ${escapeHTML(task.name)}" />
        <button class="btn-delete" data-action="delete" data-id="${task.id}" aria-label="Delete ${escapeHTML(task.name)}">✕</button>
      </div>
    </li>`;
}

// Prevents XSS when injecting user input into innerHTML
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(String(str)));
  return div.innerHTML;
}


/* ── STATS ── */
function renderStats(allTasks) {
  const active = allTasks.filter(t => !t.done);
  const avg    = active.length
    ? Math.round(active.reduce((s, t) => s + t.score, 0) / active.length)
    : null;

  statTotal.textContent = allTasks.length;
  statDone.textContent  = allTasks.filter(t => t.done).length;
  statAvg.textContent   = avg !== null ? avg : '—';
}


/* ── PIE CHART (SVG) ── */
function renderPieChart() {
  // Only tasks with logged time
  const timed = state.tasks.filter(t => t.loggedSeconds > 0);
  const total = timed.reduce((s, t) => s + t.loggedSeconds, 0);

  if (timed.length === 0 || total === 0) {
    pieChartSVG.innerHTML = '';
    chartLegend.innerHTML = '';
    chartEmpty.hidden     = false;
    return;
  }

  chartEmpty.hidden = true;

  const cx = 100, cy = 100, r = 80;
  let startAngle = -Math.PI / 2; // Start at the top (12 o'clock)

  let slicesHTML  = '';
  let legendHTML  = '';

  timed.forEach((task, i) => {
    const color     = CHART_COLORS[i % CHART_COLORS.length];
    const fraction  = task.loggedSeconds / total;
    const angle     = fraction * 2 * Math.PI;
    const endAngle  = startAngle + angle;

    // Compute arc start/end points
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);

    // largeArcFlag = 1 if slice spans more than 180°
    const largeArc = angle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;

    // Label position — midpoint of the arc, pulled out slightly
    const midAngle  = startAngle + angle / 2;
    const labelR    = r * 0.65;
    const lx        = cx + labelR * Math.cos(midAngle);
    const ly        = cy + labelR * Math.sin(midAngle);

    // Truncate long names for the slice label
    const shortName = task.name.length > 10 ? task.name.slice(0, 9) + '…' : task.name;
    const pct       = Math.round(fraction * 100);

    // Only show label if slice is big enough to be readable
    const labelTag = pct >= 8
      ? `<text class="pie-label" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${shortName}</text>`
      : '';

    slicesHTML += `
      <path class="pie-slice" d="${d}" fill="${color}" aria-label="${task.name}: ${formatTime(task.loggedSeconds)}">
        <title>${task.name} — ${formatTime(task.loggedSeconds)} (${pct}%)</title>
      </path>
      ${labelTag}`;

    legendHTML += `
      <div class="legend-item">
        <span class="legend-dot" style="background:${color}"></span>
        <span>${escapeHTML(task.name)}</span>
        <span class="legend-time">${formatTime(task.loggedSeconds)} (${pct}%)</span>
      </div>`;

    startAngle = endAngle;
  });

  pieChartSVG.innerHTML  = slicesHTML;
  chartLegend.innerHTML  = legendHTML;
}


/* ── AI INSIGHT ── */
function renderInsight() {
  const { selectedTaskId, running } = state.timer;

  // No task selected yet
  if (!selectedTaskId) {
    setInsight('Select a task and start the timer to receive insights.', 'neutral', '');
    return;
  }

  const selectedTask = state.tasks.find(t => t.id === selectedTaskId);
  if (!selectedTask) return;

  const selectedScore = calculateFocusScore(selectedTask.impact, selectedTask.urgency);
  const selectedTier  = getScoreTier(selectedScore);

  // Find the highest scored incomplete task
  const topTask = state.tasks
    .filter(t => !t.done)
    .map(t => ({ ...t, score: calculateFocusScore(t.impact, t.urgency) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!running) {
    setInsight(`"${selectedTask.name}" is selected. Press Start when ready.`, 'neutral', '');
    return;
  }

  // Timer is running — evaluate the choice
  if (topTask && topTask.id !== selectedTaskId && getScoreTier(topTask.score) === 'critical' && selectedTier !== 'critical') {
    setInsight(
      `⚠ You're working on a ${selectedTier}-priority task while "${topTask.name}" (score ${topTask.score}) needs urgent attention.`,
      'warn',
      'Low Priority Warning'
    );
    return;
  }

  if (selectedTier === 'critical') {
    setInsight(
      `✦ Excellent focus! "${selectedTask.name}" is your highest-priority task. You're working on what matters most.`,
      'commend',
      'Top Priority'
    );
    return;
  }

  if (selectedTier === 'high') {
    setInsight(
      `👍 Good choice. "${selectedTask.name}" is a high-priority task. Keep going.`,
      'commend',
      'High Priority'
    );
    return;
  }

  setInsight(
    `This is a medium-priority task. Check if anything critical is waiting before continuing.`,
    'neutral',
    ''
  );
}

function setInsight(message, type, badge) {
  insightMessage.textContent = message;
  insightMessage.className   = `insight-card__message insight-card__message--${type}`;
  insightBadge.textContent   = badge;
  insightBadge.className     = `insight-card__badge insight-card__badge--${type}`;
}


/* ── TIMER ── */
function formatTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function getElapsedSeconds() {
  // Current session seconds + previously accumulated
  if (state.timer.running && state.timer.tickStart) {
    return state.timer.elapsed + Math.floor((Date.now() - state.timer.tickStart) / 1000);
  }
  return state.timer.elapsed;
}

function tickTimer() {
  const seconds = getElapsedSeconds();
  timerDisplay.textContent = formatTime(seconds);

  // Live update the selected task's badge every second
  const id  = state.timer.selectedTaskId;
  const idx = state.tasks.findIndex(t => t.id === id);
  if (idx > -1) {
    // We only update the badge DOM element directly to avoid a full re-render every second
    const li    = taskList.querySelector(`[data-id="${id}"]`);
    if (li) {
      let badge = li.querySelector('.task-item__time-badge');
      const baseLogged = state.tasks[idx].loggedSeconds || 0;
      const sessionSec = Math.floor((Date.now() - state.timer.tickStart) / 1000);
      const total = baseLogged + sessionSec;
      if (badge) {
        badge.textContent = `⏱ ${formatTime(total)}`;
      } else {
        const info = li.querySelector('.task-item__info');
        if (info) {
          const newBadge = document.createElement('span');
          newBadge.className   = 'task-item__time-badge';
          newBadge.textContent = `⏱ ${formatTime(total)}`;
          info.insertBefore(newBadge, info.children[1] || null);
        }
      }
    }
  }
}

function startTimer() {
  if (!state.timer.selectedTaskId) {
    showToast('⚠ Select a task first by clicking on it.');
    return;
  }

  state.timer.running   = true;
  state.timer.paused    = false;
  state.timer.tickStart = Date.now();
  state.timer.intervalId = setInterval(tickTimer, 1000);

  timerDisplay.classList.add('timer-digits--running');
  timerDisplay.classList.remove('timer-digits--paused');
  timerStartBtn.disabled = true;
  timerPauseBtn.disabled = false;
  timerStopBtn.disabled  = false;
  timerPauseBtn.textContent = 'Pause';

  renderInsight();
}

function pauseTimer() {
  if (state.timer.paused) {
    // Resume
    state.timer.paused    = false;
    state.timer.running   = true;
    state.timer.tickStart = Date.now();
    state.timer.intervalId = setInterval(tickTimer, 1000);
    timerPauseBtn.textContent = 'Pause';
    timerDisplay.classList.add('timer-digits--running');
    timerDisplay.classList.remove('timer-digits--paused');
    renderInsight();
  } else {
    // Pause — bank elapsed seconds
    clearInterval(state.timer.intervalId);
    state.timer.elapsed += Math.floor((Date.now() - state.timer.tickStart) / 1000);
    state.timer.running   = false;
    state.timer.paused    = true;
    state.timer.tickStart = null;
    timerPauseBtn.textContent = 'Resume';
    timerDisplay.classList.remove('timer-digits--running');
    timerDisplay.classList.add('timer-digits--paused');
    renderInsight();
  }
}

function stopTimer() {
  clearInterval(state.timer.intervalId);

  // Final elapsed — add any remaining running seconds
  const finalSeconds = state.timer.running && state.timer.tickStart
    ? state.timer.elapsed + Math.floor((Date.now() - state.timer.tickStart) / 1000)
    : state.timer.elapsed;

  // Log time to the task
  const idx = state.tasks.findIndex(t => t.id === state.timer.selectedTaskId);
  if (idx > -1 && finalSeconds > 0) {
    state.tasks[idx].loggedSeconds = (state.tasks[idx].loggedSeconds || 0) + finalSeconds;
    saveTasks();
    showToast(`⏱ Logged ${formatTime(finalSeconds)} to "${state.tasks[idx].name}"`);
  }

  // Reset timer state
  state.timer.running   = false;
  state.timer.paused    = false;
  state.timer.elapsed   = 0;
  state.timer.tickStart = null;
  state.timer.intervalId= null;

  timerDisplay.textContent = '00:00:00';
  timerDisplay.classList.remove('timer-digits--running','timer-digits--paused');
  timerStartBtn.disabled = false;
  timerPauseBtn.disabled = true;
  timerStopBtn.disabled  = true;
  timerPauseBtn.textContent = 'Pause';

  render();
}

function selectTask(id) {
  // Stop timer if running on a different task
  if (state.timer.running || state.timer.paused) {
    stopTimer();
  }

  state.timer.selectedTaskId = id;
  state.timer.elapsed        = 0;

  const task = state.tasks.find(t => t.id === id);
  timerTaskName.textContent = task ? task.name : 'No task selected';
  timerHint.textContent     = task ? `Ready to focus on "${task.name}"` : 'Click a task below to select it.';

  render(); // Re-render to show selection highlight
  showToast(`📌 "${task.name}" selected for timer`);
}


/* ── COMPLETION SOUND ──
   Web Audio API — generates a short sine pop.
   No external audio file needed.
── */
function playPopSound() {
  if (!state.soundOn) return;

  try {
    const ctx  = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type            = 'sine';
    osc.frequency.value = 600;

    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    // Quick decay to silence
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);

    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch (e) {
    // Silently fail if Web Audio isn't supported
  }
}


/* ── TASK ACTIONS ── */
function handleAddTask() {
  const name     = taskNameInput.value.trim();
  const impact   = Number(taskImpactSlider.value);
  const urgency  = Number(taskUrgencySlider.value);
  const category = taskCategorySelect.value;

  if (!name) {
    formError.hidden = false;
    taskNameInput.focus();
    setTimeout(() => { formError.hidden = true; }, 3000);
    return;
  }

  formError.hidden = true;

  state.tasks.unshift({
    id:            Date.now(),
    name,
    impact,
    urgency,
    category,
    done:          false,
    loggedSeconds: 0,
    createdAt:     new Date().toISOString(),
  });

  saveTasks();
  render();

  // Reset form
  taskNameInput.value       = '';
  taskImpactSlider.value    = 3;
  taskUrgencySlider.value   = 3;
  updateSlider(taskImpactSlider, impactOutput);
  updateSlider(taskUrgencySlider, urgencyOutput);
  updateScorePreview();
  taskNameInput.focus();

  showToast(`✓ Task added — Score: ${calculateFocusScore(impact, urgency)}`);
}

function toggleTask(id) {
  const idx = state.tasks.findIndex(t => t.id === id);
  if (idx === -1) return;

  state.tasks[idx].done = !state.tasks[idx].done;
  if (state.tasks[idx].done) playPopSound();

  saveTasks();
  render();
  showToast(state.tasks[idx].done ? '✓ Task complete!' : '↩ Task reopened');
}

function deleteTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  // Deselect if the deleted task was the timer's target
  if (state.timer.selectedTaskId === id) {
    stopTimer();
    state.timer.selectedTaskId = null;
    timerTaskName.textContent  = 'No task selected';
  }

  state.tasks = state.tasks.filter(t => t.id !== id);
  saveTasks();
  render();
  showToast(`🗑 "${task.name.substring(0,24)}…" removed`);
}


/* ── EVENT DELEGATION — TASK LIST ──
   One listener on the <ul> handles all child clicks.
── */
taskList.addEventListener('click', function(e) {
  const actionEl = e.target.closest('[data-action]');

  if (actionEl) {
    // Checkbox or delete button clicked
    e.stopPropagation();
    const id = Number(actionEl.dataset.id);
    if (actionEl.dataset.action === 'toggle') toggleTask(id);
    if (actionEl.dataset.action === 'delete') deleteTask(id);
    return;
  }

  // Click on the task row itself — select for timer
  const row = e.target.closest('.task-item');
  if (row) selectTask(Number(row.dataset.id));
});


/* ── FILTER ── */
document.querySelector('.filter-group').addEventListener('click', function(e) {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;

  state.filter = btn.dataset.filter;
  filterBtns.forEach(b => {
    const active = b.dataset.filter === state.filter;
    b.classList.toggle('filter-btn--active', active);
    b.setAttribute('aria-pressed', active);
  });
  render();
});


/* ── FOCUS MODE ── */
focusModeBtn.addEventListener('click', function() {
  state.focusMode = !state.focusMode;
  document.body.classList.toggle('focus-mode-active', state.focusMode);
  focusModeBtn.classList.toggle('is-active', state.focusMode);
  focusModeBtn.setAttribute('aria-pressed', state.focusMode);
  showToast(state.focusMode ? '⚡ Focus Mode ON' : '◎ Focus Mode OFF');
});


/* ── SOUND TOGGLE ── */
soundBtn.addEventListener('click', function() {
  state.soundOn = !state.soundOn;
  soundIcon.textContent = state.soundOn ? '🔔' : '🔕';
  soundBtn.classList.toggle('is-active', !state.soundOn);
  soundBtn.setAttribute('aria-pressed', state.soundOn);
  showToast(state.soundOn ? '🔔 Sound enabled' : '🔕 Sound disabled');
});


/* ── SLIDERS ── */
function updateSlider(slider, output) {
  const value   = Number(slider.value);
  const percent = ((value - Number(slider.min)) / (Number(slider.max) - Number(slider.min))) * 100;

  output.textContent = value;
  slider.setAttribute('aria-valuenow', value);

  slider.style.background = `linear-gradient(to right,
    var(--color-teal) 0%, var(--color-teal) ${percent}%,
    var(--color-glass-border) ${percent}%, var(--color-glass-border) 100%)`;
}

function updateScorePreview() {
  const score = calculateFocusScore(Number(taskImpactSlider.value), Number(taskUrgencySlider.value));
  const tier  = getScoreTier(score);

  scorePreviewEl.textContent = score;
  scorePreviewEl.className   = `score-preview__value score-preview__value--${tier}`;

  scorePreviewEl.classList.remove('score-pop');
  requestAnimationFrame(() => scorePreviewEl.classList.add('score-pop'));
}

taskImpactSlider.addEventListener('input',  () => { updateSlider(taskImpactSlider,  impactOutput);  updateScorePreview(); });
taskUrgencySlider.addEventListener('input', () => { updateSlider(taskUrgencySlider, urgencyOutput); updateScorePreview(); });
taskCategorySelect.addEventListener('change', updateScorePreview);


/* ── TIMER BUTTON EVENTS ── */
timerStartBtn.addEventListener('click', startTimer);
timerPauseBtn.addEventListener('click', pauseTimer);
timerStopBtn.addEventListener('click',  stopTimer);

// Allow Enter key to add tasks
taskNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); handleAddTask(); }
});
addBtn.addEventListener('click', handleAddTask);


/* ── TOAST ── */
let toastTimer = null;
function showToast(message, duration = 2500) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden      = false;
  void toastEl.offsetHeight; // Force reflow to restart transition
  toastEl.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('is-visible');
    setTimeout(() => { toastEl.hidden = true; }, 300);
  }, duration);
}


/* ── DATE ── */
function renderDate() {
  const now = new Date();
  dateEl.textContent = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'long', day: 'numeric' }).format(now);
  dateEl.setAttribute('datetime', now.toISOString().split('T')[0]);
}


/* ── INIT ── */
function init() {
  loadTasks();
  renderDate();

  updateSlider(taskImpactSlider,  impactOutput);
  updateSlider(taskUrgencySlider, urgencyOutput);
  updateScorePreview();

  // Timer buttons start disabled
  timerPauseBtn.disabled = true;
  timerStopBtn.disabled  = true;

  render();
}

init();
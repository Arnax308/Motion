/* ==========================================================================
   MOTION COMMAND CENTER APP LOGIC & GAMIFICATION ENGINE
   ========================================================================== */

(function () {
  // Application State
  let appData = {
    total_pp: 0,
    streak: 0,
    last_completion_date: null,
    categories: [],
    active_tasks: [],
    history: []
  };

  let activeCategoryFilter = 'ALL';
  let statsCurrentMonth = new Date().getMonth(); // 0-indexed
  let statsCurrentYear = new Date().getFullYear();

  let selectedRescheduleTaskId = null;
  let rescheduleSelectedDate = new Date();

  // Reschedule Clock Widget State
  let clockSelectedHour = 11;
  let clockSelectedMinute = 30;
  let clockSelectedAmPm = 'AM';
  let clockMode = 'hours'; // 'hours' or 'minutes'

  // Task Form Clock Widget State
  let formClockHour = 6;
  let formClockMinute = 0;
  let formClockAmPm = 'PM';
  let formClockMode = 'hours';

  let editingCategoryId = null;
  let selectedVectorColor = '#7C3AED';

  // DOM Elements Cache
  const elements = {
    sidebarRank: document.getElementById('sidebar-rank'),
    pageTitle: document.getElementById('page-title'),
    headerLevel: document.getElementById('header-level'),
    headerStreak: document.getElementById('header-streak'),
    headerPp: document.getElementById('header-pp'),
    navItems: document.querySelectorAll('.nav-item'),
    tabContents: document.querySelectorAll('.tab-content'),

    // Task Form
    taskForm: document.getElementById('task-form'),
    taskTitle: document.getElementById('task-title'),
    taskCategory: document.getElementById('task-category'),
    taskSeverity: document.getElementById('task-severity'),
    taskPp: document.getElementById('task-pp'),
    taskRecurring: document.getElementById('task-recurring'),
    taskDate: document.getElementById('task-date'),
    taskTime: document.getElementById('task-time'),
    taskTimeBtn: document.getElementById('task-time-btn'),
    taskTimeDisplay: document.getElementById('task-time-display'),
    btnQuickNewTask: document.getElementById('btn-quick-new-task'),

    // Active Sequences
    categoryFilters: document.getElementById('category-filters'),
    sequencesGrid: document.getElementById('sequences-grid'),

    // History
    histCurrentLevel: document.getElementById('hist-current-level'),
    histTotalPp: document.getElementById('hist-total-pp'),
    histActiveStreak: document.getElementById('hist-active-streak'),
    historyGroups: document.getElementById('history-groups'),

    // Statistics
    statsMonthYear: document.getElementById('stats-month-year'),
    btnPrevMonth: document.getElementById('btn-prev-month'),
    btnNextMonth: document.getElementById('btn-next-month'),
    metricPotentialPp: document.getElementById('metric-potential-pp'),
    metricActiveCategories: document.getElementById('metric-active-categories'),
    heatmapMonthsWrapper: document.getElementById('heatmap-months-wrapper'),
    categoryPerformanceBody: document.getElementById('category-performance-body'),

    // Category Modal
    btnOpenCategoryModal: document.getElementById('btn-open-category-modal'),
    modalCategory: document.getElementById('modal-category'),
    btnCloseCatModal: document.getElementById('btn-close-cat-modal'),
    modalCategoriesList: document.getElementById('modal-categories-list'),
    formSynthesizeCategory: document.getElementById('form-synthesize-category'),
    catDesignation: document.getElementById('cat-designation'),
    catSymbology: document.getElementById('cat-symbology'),
    symbologyPreview: document.getElementById('symbology-preview'),
    catWeight: document.getElementById('cat-weight'),
    catWeightVal: document.getElementById('cat-weight-val'),
    colorVectorGroup: document.getElementById('color-vector-group'),

    // Reschedule Modal & Clock Widget
    modalReschedule: document.getElementById('modal-reschedule'),
    btnCloseRescheduleModal: document.getElementById('btn-close-reschedule-modal'),
    btnCancelReschedule: document.getElementById('btn-cancel-reschedule'),
    btnConfirmReschedule: document.getElementById('btn-confirm-reschedule'),
    miniCalMonthYear: document.getElementById('mini-cal-month-year'),
    miniCalPrev: document.getElementById('mini-cal-prev'),
    miniCalNext: document.getElementById('mini-cal-next'),
    miniCalGrid: document.getElementById('mini-cal-grid'),
    rescheduleReason: document.getElementById('reschedule-reason'),

    // Reschedule Clock Elements
    clockDisplayHours: document.getElementById('clock-display-hours'),
    clockDisplayMinutes: document.getElementById('clock-display-minutes'),
    btnAmpmAm: document.getElementById('btn-ampm-am'),
    btnAmpmPm: document.getElementById('btn-ampm-pm'),
    clockHand: document.getElementById('clock-hand'),
    clockFaceDial: document.getElementById('clock-face-dial'),
    btnClockModeHours: document.getElementById('btn-clock-mode-hours'),
    btnClockModeMinutes: document.getElementById('btn-clock-mode-minutes'),

    // Form Clock Picker Modal Elements
    modalFormClock: document.getElementById('modal-form-clock'),
    btnCloseFormClockModal: document.getElementById('btn-close-form-clock-modal'),
    btnConfirmFormClock: document.getElementById('btn-confirm-form-clock'),
    formClockDisplayHours: document.getElementById('form-clock-display-hours'),
    formClockDisplayMinutes: document.getElementById('form-clock-display-minutes'),
    btnFormAmpmAm: document.getElementById('btn-form-ampm-am'),
    btnFormAmpmPm: document.getElementById('btn-form-ampm-pm'),
    formClockHand: document.getElementById('form-clock-hand'),
    formClockFaceDial: document.getElementById('form-clock-face-dial'),
    btnFormClockModeHours: document.getElementById('btn-form-clock-mode-hours'),
    btnFormClockModeMinutes: document.getElementById('btn-form-clock-mode-minutes'),

    toastContainer: document.getElementById('toast-container')
  };

  // INITIALIZATION
  async function init() {
    setupEventListeners();
    await loadAppData();
    autoProcessOverdue();
    setDefaultFormDateTime();
    updateClockDisplay();
    updateFormClockDisplay();
    renderAll();
  }

  async function loadAppData() {
    try {
      if (window.api && window.api.loadData) {
        const loaded = await window.api.loadData();
        if (loaded) appData = loaded;
      }
    } catch (e) {
      console.warn('API load fallback:', e);
    }
  }

  async function saveAppData() {
    renderAll();
    try {
      if (window.api && window.api.saveData) {
        await window.api.saveData(appData);
      }
    } catch (e) {
      console.warn('API save fallback:', e);
    }
  }

  // GAMIFICATION LOGIC ENGINE
  function calculateLevel(pp) {
    if (!pp || pp === 0) return 0;
    return Math.floor(pp / 300) + 1;
  }

  function getTitleForPp(pp) {
    if (pp <= 100) return 'Casual Rookie 🐣';
    if (pp <= 300) return 'Disciplined Doer 🔨';
    if (pp <= 600) return 'Momentum Builder 🔥';
    if (pp <= 1200) return 'Versatile Grinder ⚡';
    return 'Life Prodigy 🌟';
  }

  function getCategoryWeight(categoryName) {
    const cat = appData.categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
    return cat ? parseFloat(cat.weight || 1.0) : 1.0;
  }

  function updateStreak() {
    const todayStr = new Date().toISOString().split('T')[0];
    if (appData.last_completion_date) {
      const lastDate = new Date(appData.last_completion_date);
      const today = new Date(todayStr);
      const diffDays = Math.round((today - lastDate) / (1000 * 3600 * 24));

      if (diffDays === 1) {
        appData.streak += 1;
      } else if (diffDays > 1) {
        appData.streak = 1;
      }
    } else {
      appData.streak = 1;
    }
    appData.last_completion_date = todayStr;
  }

  function autoProcessOverdue() {
    const now = new Date();
    const toMiss = [];

    appData.active_tasks.forEach(task => {
      const deadline = new Date(task.deadline);
      if (now > new Date(deadline.getTime() + 72 * 3600 * 1000)) {
        toMiss.push(task.id);
      }
    });

    toMiss.forEach(id => missTask(id, true));
  }

  const severityMultipliers = {
    low: 0.5,
    med: 1.0,
    high: 2.0,
    life_changing: 5.0
  };

  function handleRecurringAutoRespawn(task) {
    if (!task || !task.recurring || task.recurring === 'none') return;

    const prevDeadline = new Date(task.deadline);
    const daysToAdd = task.recurring === 'weekly' ? 7 : 1;
    const nextDeadline = new Date(prevDeadline.getTime() + daysToAdd * 24 * 3600 * 1000);

    appData.active_tasks.push({
      id: 'task-' + Date.now() + Math.floor(Math.random() * 1000),
      title: task.title,
      description: task.description || '',
      category: task.category,
      severity: task.severity,
      base_pp: task.base_pp,
      deadline: nextDeadline.toISOString(),
      rescheduled: false,
      recurring: task.recurring
    });
  }

  // TASK ACTIONS
  function completeTask(taskId) {
    const idx = appData.active_tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = appData.active_tasks.splice(idx, 1)[0];
    const now = new Date();
    const deadline = new Date(task.deadline);
    const basePp = parseInt(task.base_pp, 10) || 50;

    let earnedPp = basePp;
    if (now < new Date(deadline.getTime() - 3600 * 1000)) {
      earnedPp = basePp * 2;
    } else if (now <= deadline) {
      earnedPp = basePp;
    } else {
      earnedPp = Math.max(1, Math.floor(basePp / 2));
    }

    if (task.rescheduled) {
      earnedPp = Math.max(1, Math.floor(earnedPp / 2));
    }

    const severityMult = severityMultipliers[task.severity] !== undefined ? severityMultipliers[task.severity] : 1.0;
    const weight = getCategoryWeight(task.category);
    earnedPp = Math.round(earnedPp * severityMult * weight);

    appData.total_pp += earnedPp;
    updateStreak();

    appData.history.push({
      id: 'hist-' + Date.now(),
      title: task.title,
      category: task.category,
      severity: task.severity || 'med',
      deadline: task.deadline,
      completion_time: now.toISOString(),
      pp_earned: earnedPp,
      base_pp: basePp,
      status: 'completed'
    });

    handleRecurringAutoRespawn(task);

    saveAppData();
    const recurringMsg = task.recurring && task.recurring !== 'none' ? ' | Next instance spawned 🔄' : '';
    showToast(`Task Completed! +${earnedPp} PP Earned ✨${recurringMsg}`);
  }

  function missTask(taskId, isAuto = false) {
    const idx = appData.active_tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = appData.active_tasks.splice(idx, 1)[0];
    const severityMult = severityMultipliers[task.severity] !== undefined ? severityMultipliers[task.severity] : 1.0;
    const loss = Math.round(10 * severityMult);

    appData.total_pp = Math.max(0, appData.total_pp - loss);

    appData.history.push({
      id: 'hist-' + Date.now(),
      title: task.title,
      category: task.category,
      severity: task.severity || 'med',
      deadline: task.deadline,
      completion_time: new Date().toISOString(),
      pp_earned: -loss,
      base_pp: task.base_pp,
      status: 'missed'
    });

    handleRecurringAutoRespawn(task);

    saveAppData();
    if (!isAuto) showToast(`Task Missed. Lost ${loss} PP.`);
  }

  function deferTask(taskId) {
    const idx = appData.active_tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = appData.active_tasks.splice(idx, 1)[0];

    appData.history.push({
      id: 'hist-' + Date.now(),
      title: task.title,
      category: task.category,
      severity: task.severity || 'med',
      deadline: task.deadline,
      completion_time: new Date().toISOString(),
      pp_earned: 0,
      base_pp: task.base_pp,
      status: 'deferred'
    });

    handleRecurringAutoRespawn(task);

    saveAppData();
    showToast('Task Deferred (Circumstances out of hand) ⏸️');
  }

  function deleteTask(taskId) {
    const idx = appData.active_tasks.findIndex(t => t.id === taskId);
    if (idx === -1) return;

    const task = appData.active_tasks.splice(idx, 1)[0];
    saveAppData();
    showToast(`Task '${task.title}' Deleted 🗑️`);
  }

  function rescheduleTask(taskId, newDeadlineISO, reason) {
    const task = appData.active_tasks.find(t => t.id === taskId);
    if (!task) return;

    task.deadline = newDeadlineISO;
    task.rescheduled = true;
    task.rescheduled_reason = reason || null;

    saveAppData();
    showToast('Task Rescheduled (Earned PP halved for completion)');
  }

  // RESCHEDULE CLOCK CONTROLLER
  function updateClockDisplay() {
    elements.clockDisplayHours.textContent = String(clockSelectedHour).padStart(2, '0');
    elements.clockDisplayMinutes.textContent = String(clockSelectedMinute).padStart(2, '0');
    elements.btnAmpmAm.classList.toggle('active', clockSelectedAmPm === 'AM');
    elements.btnAmpmPm.classList.toggle('active', clockSelectedAmPm === 'PM');

    elements.clockDisplayHours.classList.toggle('active', clockMode === 'hours');
    elements.clockDisplayMinutes.classList.toggle('active', clockMode === 'minutes');
    elements.btnClockModeHours.classList.toggle('active', clockMode === 'hours');
    elements.btnClockModeMinutes.classList.toggle('active', clockMode === 'minutes');

    renderClockDial();
  }

  function renderClockDial() {
    elements.clockFaceDial.innerHTML = '';

    if (clockMode === 'hours') {
      const handAngle = (clockSelectedHour % 12) * 30;
      elements.clockHand.style.transform = `rotate(${handAngle}deg)`;

      const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      hours.forEach((h, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180);
        const radius = 68;
        const x = 95 + radius * Math.cos(angle) - 14;
        const y = 95 + radius * Math.sin(angle) - 14;

        const numEl = document.createElement('div');
        numEl.className = 'clock-number' + (clockSelectedHour === h ? ' active' : '');
        numEl.style.left = `${x}px`;
        numEl.style.top = `${y}px`;
        numEl.textContent = h;

        numEl.addEventListener('click', () => {
          clockSelectedHour = h;
          clockMode = 'minutes';
          updateClockDisplay();
        });

        elements.clockFaceDial.appendChild(numEl);
      });
    } else {
      const handAngle = clockSelectedMinute * 6;
      elements.clockHand.style.transform = `rotate(${handAngle}deg)`;

      const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
      minutes.forEach((m, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180);
        const radius = 68;
        const x = 95 + radius * Math.cos(angle) - 14;
        const y = 95 + radius * Math.sin(angle) - 14;

        const numEl = document.createElement('div');
        numEl.className = 'clock-number' + (clockSelectedMinute === m ? ' active' : '');
        numEl.style.left = `${x}px`;
        numEl.style.top = `${y}px`;
        numEl.textContent = String(m).padStart(2, '0');

        numEl.addEventListener('click', () => {
          clockSelectedMinute = m;
          updateClockDisplay();
        });

        elements.clockFaceDial.appendChild(numEl);
      });
    }
  }

  function getClockFormattedTime24() {
    let h24 = clockSelectedHour % 12;
    if (clockSelectedAmPm === 'PM') h24 += 12;
    const hh = String(h24).padStart(2, '0');
    const mm = String(clockSelectedMinute).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // TASK FORM CLOCK CONTROLLER
  function updateFormClockDisplay() {
    elements.formClockDisplayHours.textContent = String(formClockHour).padStart(2, '0');
    elements.formClockDisplayMinutes.textContent = String(formClockMinute).padStart(2, '0');
    elements.btnFormAmpmAm.classList.toggle('active', formClockAmPm === 'AM');
    elements.btnFormAmpmPm.classList.toggle('active', formClockAmPm === 'PM');

    elements.formClockDisplayHours.classList.toggle('active', formClockMode === 'hours');
    elements.formClockDisplayMinutes.classList.toggle('active', formClockMode === 'minutes');
    elements.btnFormClockModeHours.classList.toggle('active', formClockMode === 'hours');
    elements.btnFormClockModeMinutes.classList.toggle('active', formClockMode === 'minutes');

    renderFormClockDial();
  }

  function renderFormClockDial() {
    elements.formClockFaceDial.innerHTML = '';

    if (formClockMode === 'hours') {
      const handAngle = (formClockHour % 12) * 30;
      elements.formClockHand.style.transform = `rotate(${handAngle}deg)`;

      const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
      hours.forEach((h, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180);
        const radius = 68;
        const x = 95 + radius * Math.cos(angle) - 14;
        const y = 95 + radius * Math.sin(angle) - 14;

        const numEl = document.createElement('div');
        numEl.className = 'clock-number' + (formClockHour === h ? ' active' : '');
        numEl.style.left = `${x}px`;
        numEl.style.top = `${y}px`;
        numEl.textContent = h;

        numEl.addEventListener('click', () => {
          formClockHour = h;
          formClockMode = 'minutes';
          updateFormClockDisplay();
        });

        elements.formClockFaceDial.appendChild(numEl);
      });
    } else {
      const handAngle = formClockMinute * 6;
      elements.formClockHand.style.transform = `rotate(${handAngle}deg)`;

      const minutes = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
      minutes.forEach((m, index) => {
        const angle = (index * 30 - 90) * (Math.PI / 180);
        const radius = 68;
        const x = 95 + radius * Math.cos(angle) - 14;
        const y = 95 + radius * Math.sin(angle) - 14;

        const numEl = document.createElement('div');
        numEl.className = 'clock-number' + (formClockMinute === m ? ' active' : '');
        numEl.style.left = `${x}px`;
        numEl.style.top = `${y}px`;
        numEl.textContent = String(m).padStart(2, '0');

        numEl.addEventListener('click', () => {
          formClockMinute = m;
          updateFormClockDisplay();
        });

        elements.formClockFaceDial.appendChild(numEl);
      });
    }
  }

  function getFormClockFormatted24() {
    let h24 = formClockHour % 12;
    if (formClockAmPm === 'PM') h24 += 12;
    const hh = String(h24).padStart(2, '0');
    const mm = String(formClockMinute).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  // EVENT LISTENERS SETUP
  function setupEventListeners() {
    // Nav Tab Switching
    elements.navItems.forEach(btn => {
      btn.addEventListener('click', () => {
        elements.navItems.forEach(i => i.classList.remove('active'));
        elements.tabContents.forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const tabId = 'tab-' + btn.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');

        const titleMap = { tasks: 'Command Center', history: 'Audit Log', statistics: 'Efficiency Metrics' };
        elements.pageTitle.textContent = titleMap[btn.getAttribute('data-tab')] || 'Command Center';
      });
    });

    // Quick New Task button scroll
    elements.btnQuickNewTask.addEventListener('click', () => {
      document.querySelector('[data-tab="tasks"]').click();
      elements.taskTitle.focus();
    });

    // Task Form submission
    elements.taskForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = elements.taskTitle.value.trim();
      const category = elements.taskCategory.value;
      const severity = elements.taskSeverity.value;
      const basePp = parseInt(elements.taskPp.value, 10) || 100;
      const recurring = elements.taskRecurring ? elements.taskRecurring.value : 'none';
      const dateVal = elements.taskDate.value;
      const timeVal = elements.taskTime.value;

      if (!title || !dateVal || !timeVal) return;

      const deadline = new Date(`${dateVal}T${timeVal}:00`).toISOString();

      appData.active_tasks.push({
        id: 'task-' + Date.now(),
        title: title,
        category: category,
        severity: severity,
        base_pp: basePp,
        deadline: deadline,
        rescheduled: false,
        recurring: recurring
      });

      elements.taskTitle.value = '';
      saveAppData();
      showToast('New Protocol Created 🚀');
    });

    // Form Clock Picker Modal Listeners
    elements.taskTimeBtn.addEventListener('click', () => {
      formClockMode = 'hours';
      updateFormClockDisplay();
      elements.modalFormClock.classList.add('active');
    });
    elements.btnCloseFormClockModal.addEventListener('click', () => {
      elements.modalFormClock.classList.remove('active');
    });
    elements.btnFormAmpmAm.addEventListener('click', () => {
      formClockAmPm = 'AM';
      updateFormClockDisplay();
    });
    elements.btnFormAmpmPm.addEventListener('click', () => {
      formClockAmPm = 'PM';
      updateFormClockDisplay();
    });
    elements.formClockDisplayHours.addEventListener('click', () => {
      formClockMode = 'hours';
      updateFormClockDisplay();
    });
    elements.formClockDisplayMinutes.addEventListener('click', () => {
      formClockMode = 'minutes';
      updateFormClockDisplay();
    });
    elements.btnFormClockModeHours.addEventListener('click', () => {
      formClockMode = 'hours';
      updateFormClockDisplay();
    });
    elements.btnFormClockModeMinutes.addEventListener('click', () => {
      formClockMode = 'minutes';
      updateFormClockDisplay();
    });

    // Minute Step Controls (-1m / +1m)
    const btnClockMinDown = document.getElementById('btn-clock-min-down');
    const btnClockMinUp = document.getElementById('btn-clock-min-up');
    const btnFormClockMinDown = document.getElementById('btn-form-clock-min-down');
    const btnFormClockMinUp = document.getElementById('btn-form-clock-min-up');

    if (btnClockMinDown) {
      btnClockMinDown.addEventListener('click', () => {
        clockSelectedMinute = (clockSelectedMinute - 1 + 60) % 60;
        clockMode = 'minutes';
        updateClockDisplay();
      });
    }
    if (btnClockMinUp) {
      btnClockMinUp.addEventListener('click', () => {
        clockSelectedMinute = (clockSelectedMinute + 1) % 60;
        clockMode = 'minutes';
        updateClockDisplay();
      });
    }
    if (btnFormClockMinDown) {
      btnFormClockMinDown.addEventListener('click', () => {
        formClockMinute = (formClockMinute - 1 + 60) % 60;
        formClockMode = 'minutes';
        updateFormClockDisplay();
      });
    }
    if (btnFormClockMinUp) {
      btnFormClockMinUp.addEventListener('click', () => {
        formClockMinute = (formClockMinute + 1) % 60;
        formClockMode = 'minutes';
        updateFormClockDisplay();
      });
    }

    // Radial Dial Click for Exact Minute Precision (0-59)
    const reschedDial = document.getElementById('reschedule-clock-widget');
    if (reschedDial) {
      const container = reschedDial.querySelector('.clock-dial-container');
      if (container) {
        container.addEventListener('click', (e) => {
          if (e.target.classList.contains('clock-number')) return;
          if (clockMode === 'minutes') {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
            if (angle < 0) angle += 360;
            clockSelectedMinute = Math.round((angle / 360) * 60) % 60;
            updateClockDisplay();
          }
        });
      }
    }

    const formDial = document.getElementById('form-clock-dial-container');
    if (formDial) {
      formDial.addEventListener('click', (e) => {
        if (e.target.classList.contains('clock-number')) return;
        if (formClockMode === 'minutes') {
          const rect = formDial.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const y = e.clientY - rect.top - rect.height / 2;
          let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;
          if (angle < 0) angle += 360;
          formClockMinute = Math.round((angle / 360) * 60) % 60;
          updateFormClockDisplay();
        }
      });
    }

    // Direct Minute Number Entry
    if (elements.formClockDisplayMinutes) {
      elements.formClockDisplayMinutes.addEventListener('dblclick', () => {
        formClockMode = 'minutes';
        const custom = prompt('Enter exact minute (0-59):', formClockMinute);
        if (custom !== null) {
          const val = parseInt(custom, 10);
          if (!isNaN(val) && val >= 0 && val <= 59) {
            formClockMinute = val;
            updateFormClockDisplay();
          }
        }
      });
    }

    if (elements.clockDisplayMinutes) {
      elements.clockDisplayMinutes.addEventListener('dblclick', () => {
        clockMode = 'minutes';
        const custom = prompt('Enter exact minute (0-59):', clockSelectedMinute);
        if (custom !== null) {
          const val = parseInt(custom, 10);
          if (!isNaN(val) && val >= 0 && val <= 59) {
            clockSelectedMinute = val;
            updateClockDisplay();
          }
        }
      });
    }

    elements.btnConfirmFormClock.addEventListener('click', () => {
      const time24 = getFormClockFormatted24();
      const hh12 = String(formClockHour).padStart(2, '0');
      const mm12 = String(formClockMinute).padStart(2, '0');

      elements.taskTime.value = time24;
      elements.taskTimeDisplay.textContent = `🕒 ${hh12}:${mm12} ${formClockAmPm}`;
      elements.modalFormClock.classList.remove('active');
    });

    // Category Color vector picker
    elements.colorVectorGroup.querySelectorAll('.color-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        elements.colorVectorGroup.querySelectorAll('.color-dot').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedVectorColor = btn.getAttribute('data-color');
      });
    });

    // Symbology preview update
    elements.catSymbology.addEventListener('input', (e) => {
      elements.symbologyPreview.textContent = e.target.value.charAt(0).toUpperCase() || '⚡';
    });

    // Weight slider label
    elements.catWeight.addEventListener('input', (e) => {
      elements.catWeightVal.textContent = parseFloat(e.target.value).toFixed(1) + 'x PP';
    });

    // Synthesize Category submit (CREATE & EDIT / UPDATE)
    elements.formSynthesizeCategory.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = elements.catDesignation.value.trim();
      if (!name) return;

      const submitBtn = elements.formSynthesizeCategory.querySelector('button[type="submit"]');

      if (editingCategoryId) {
        const cat = appData.categories.find(c => c.id === editingCategoryId);
        if (cat) {
          const oldName = cat.name;
          cat.name = name;
          cat.icon = elements.catSymbology.value || 'tag';
          cat.color = selectedVectorColor;
          cat.weight = parseFloat(elements.catWeight.value);

          if (oldName !== name) {
            appData.active_tasks.forEach(t => { if (t.category === oldName) t.category = name; });
            appData.history.forEach(h => { if (h.category === oldName) h.category = name; });
          }
          showToast(`Category '${name}' Updated ✨`);
        }
        editingCategoryId = null;
        submitBtn.querySelector('span').textContent = '+ INITIALIZE MODULE';
      } else {
        if (appData.categories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
          showToast('Category already exists!');
          return;
        }

        appData.categories.push({
          id: 'cat-' + Date.now(),
          name: name,
          subtext: 'Custom Module',
          icon: elements.catSymbology.value || 'tag',
          color: selectedVectorColor,
          weight: parseFloat(elements.catWeight.value),
          active: true
        });
        showToast(`Category '${name}' Synthesized ✨`);
      }

      elements.catDesignation.value = '';
      saveAppData();
      renderCategoryModalList();
    });

    // Category Modal triggers
    elements.btnOpenCategoryModal.addEventListener('click', () => {
      editingCategoryId = null;
      elements.catDesignation.value = '';
      elements.formSynthesizeCategory.querySelector('button[type="submit"] span').textContent = '+ INITIALIZE MODULE';
      renderCategoryModalList();
      elements.modalCategory.classList.add('active');
    });
    elements.btnCloseCatModal.addEventListener('click', () => {
      elements.modalCategory.classList.remove('active');
    });

    // Reschedule Modal controls
    elements.btnCloseRescheduleModal.addEventListener('click', closeRescheduleModal);
    elements.btnCancelReschedule.addEventListener('click', closeRescheduleModal);

    // Reschedule Clock Widget event listeners
    elements.btnAmpmAm.addEventListener('click', () => {
      clockSelectedAmPm = 'AM';
      updateClockDisplay();
    });
    elements.btnAmpmPm.addEventListener('click', () => {
      clockSelectedAmPm = 'PM';
      updateClockDisplay();
    });
    elements.clockDisplayHours.addEventListener('click', () => {
      clockMode = 'hours';
      updateClockDisplay();
    });
    elements.clockDisplayMinutes.addEventListener('click', () => {
      clockMode = 'minutes';
      updateClockDisplay();
    });
    elements.btnClockModeHours.addEventListener('click', () => {
      clockMode = 'hours';
      updateClockDisplay();
    });
    elements.btnClockModeMinutes.addEventListener('click', () => {
      clockMode = 'minutes';
      updateClockDisplay();
    });

    elements.btnConfirmReschedule.addEventListener('click', () => {
      if (!selectedRescheduleTaskId) return;
      const year = rescheduleSelectedDate.getFullYear();
      const month = String(rescheduleSelectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(rescheduleSelectedDate.getDate()).padStart(2, '0');
      const time24 = getClockFormattedTime24();
      const isoDeadline = new Date(`${year}-${month}-${day}T${time24}:00`).toISOString();

      rescheduleTask(selectedRescheduleTaskId, isoDeadline, elements.rescheduleReason.value);
      closeRescheduleModal();
    });

    // Stats month nav
    elements.btnPrevMonth.addEventListener('click', () => {
      if (statsCurrentMonth === 0) {
        statsCurrentMonth = 11;
        statsCurrentYear--;
      } else {
        statsCurrentMonth--;
      }
      renderStatisticsTab();
    });
    elements.btnNextMonth.addEventListener('click', () => {
      if (statsCurrentMonth === 11) {
        statsCurrentMonth = 0;
        statsCurrentYear++;
      } else {
        statsCurrentMonth++;
      }
      renderStatisticsTab();
    });
  }

  function closeRescheduleModal() {
    elements.modalReschedule.classList.remove('active');
    selectedRescheduleTaskId = null;
  }

  function openRescheduleModal(taskId) {
    selectedRescheduleTaskId = taskId;
    const task = appData.active_tasks.find(t => t.id === taskId);
    if (!task) return;

    rescheduleSelectedDate = new Date(task.deadline);
    const d = new Date(task.deadline);
    let hours = d.getHours();
    clockSelectedAmPm = hours >= 12 ? 'PM' : 'AM';
    clockSelectedHour = hours % 12 || 12;
    clockSelectedMinute = Math.round(d.getMinutes() / 5) * 5 % 60;
    clockMode = 'hours';

    updateClockDisplay();
    renderMiniCalendar();
    elements.modalReschedule.classList.add('active');
  }

  function setDefaultFormDateTime() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    elements.taskDate.value = `${yyyy}-${mm}-${dd}`;

    formClockHour = 6;
    formClockMinute = 0;
    formClockAmPm = 'PM';
    elements.taskTime.value = '18:00';
    elements.taskTimeDisplay.textContent = '🕒 06:00 PM';
  }

  // RENDER CONTROLLER
  function renderAll() {
    renderHeaderStats();
    renderCategoryDropdown();
    renderActiveSequences();
    renderHistoryTab();
    renderStatisticsTab();
  }

  function renderHeaderStats() {
    const level = calculateLevel(appData.total_pp);
    const title = getTitleForPp(appData.total_pp);

    elements.headerLevel.textContent = level;
    elements.headerStreak.textContent = appData.streak;
    elements.headerPp.textContent = appData.total_pp.toLocaleString();
    elements.sidebarRank.textContent = `LEVEL ${level} • ${title.toUpperCase()}`;

    elements.histCurrentLevel.textContent = level;
    elements.histTotalPp.textContent = appData.total_pp.toLocaleString();
    elements.histActiveStreak.textContent = `🔥 ${appData.streak} Days`;
  }

  function renderCategoryDropdown() {
    elements.taskCategory.innerHTML = '';
    appData.categories.forEach(cat => {
      if (cat.active !== false) {
        const opt = document.createElement('option');
        opt.value = cat.name;
        opt.textContent = `${cat.name} (${cat.weight || 1.0}x PP)`;
        elements.taskCategory.appendChild(opt);
      }
    });

    elements.categoryFilters.innerHTML = '<button class="filter-chip ' + (activeCategoryFilter === 'ALL' ? 'active' : '') + '" data-category="ALL">All</button>';
    appData.categories.forEach(cat => {
      const chip = document.createElement('button');
      chip.className = 'filter-chip ' + (activeCategoryFilter === cat.name ? 'active' : '');
      chip.textContent = cat.name;
      chip.addEventListener('click', () => {
        activeCategoryFilter = cat.name;
        renderActiveSequences();
      });
      elements.categoryFilters.appendChild(chip);
    });

    const allChip = elements.categoryFilters.querySelector('[data-category="ALL"]');
    if (allChip) {
      allChip.addEventListener('click', () => {
        activeCategoryFilter = 'ALL';
        renderActiveSequences();
      });
    }
  }

  function renderActiveSequences() {
    elements.sequencesGrid.innerHTML = '';

    const filtered = activeCategoryFilter === 'ALL'
      ? appData.active_tasks
      : appData.active_tasks.filter(t => t.category === activeCategoryFilter);

    if (filtered.length === 0) {
      elements.sequencesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 48px; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 12px;">⚡</div>
          <h3>No Active Sequences</h3>
          <p style="font-size: 13px; margin-top: 6px;">Deploy a new protocol above to begin your grind.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(task => {
      const now = new Date();
      const deadline = new Date(task.deadline);
      const diffHours = (deadline - now) / (1000 * 3600);

      let severityClass = task.severity || 'med';
      let severityLabel = 'MED (x1)';
      if (severityClass === 'low') severityLabel = 'LOW (x0.5)';
      else if (severityClass === 'high') severityLabel = 'HIGH (x2)';
      else if (severityClass === 'life_changing') severityLabel = '🔥 LIFE CHANGING (x5)';

      let timeLabel = '';
      if (diffHours < 0) {
        timeLabel = '⚠️ OVERDUE';
      } else if (diffHours <= 2) {
        timeLabel = `Due in ${Math.ceil(diffHours * 60)}m`;
      } else if (diffHours <= 24) {
        timeLabel = `Due in ${Math.ceil(diffHours)}h`;
      } else {
        timeLabel = deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      }

      const recurringTag = task.recurring && task.recurring !== 'none'
        ? `<span class="tag tag-recurring">${task.recurring === 'daily' ? '🔄 Daily' : '📅 Weekly'}</span>`
        : '';

      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-card-accent ${severityClass}"></div>
        <div class="card-tags-row">
          <div class="left-tags">
            <span class="tag tag-${severityClass}">${severityLabel}</span>
            ${recurringTag}
            <span class="tag ${diffHours <= 24 ? 'tag-due-soon' : 'tag-upcoming'}">${timeLabel}</span>
          </div>
          <span class="pp-earned-tag">+${task.base_pp} PP</span>
        </div>
        <h3 class="card-title">${escapeHtml(task.title)}</h3>
        <p class="card-description">${task.description ? escapeHtml(task.description) : 'Category: ' + task.category}</p>
        <div class="card-footer">
          <span class="card-time">🕒 ${deadline.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <div class="card-actions">
            <button class="btn-icon-sm btn-icon-delete btn-delete" title="Delete Task">🗑️</button>
            <button class="btn-icon-sm btn-reschedule" title="Reschedule Task">🔄</button>
            <button class="btn-action-danger btn-miss" title="Mark Missed">⊗ Missed</button>
            <button class="btn-action-secondary btn-defer" title="Defer Task">⏸️ Defer</button>
            <button class="btn-action-primary btn-complete">✓ Complete</button>
          </div>
        </div>
      `;

      card.querySelector('.btn-complete').addEventListener('click', () => completeTask(task.id));
      card.querySelector('.btn-defer').addEventListener('click', () => deferTask(task.id));
      card.querySelector('.btn-miss').addEventListener('click', () => missTask(task.id));
      card.querySelector('.btn-reschedule').addEventListener('click', () => openRescheduleModal(task.id));
      card.querySelector('.btn-delete').addEventListener('click', () => deleteTask(task.id));

      elements.sequencesGrid.appendChild(card);
    });
  }

  function renderHistoryTab() {
    elements.historyGroups.innerHTML = '';

    if (appData.history.length === 0) {
      elements.historyGroups.innerHTML = `
        <div style="text-align: center; padding: 48px; color: var(--text-muted);">
          <div style="font-size: 36px; margin-bottom: 12px;">📚</div>
          <h3>No Task History</h3>
          <p style="font-size: 13px;">Complete or miss protocols to build your log.</p>
        </div>
      `;
      return;
    }

    const groups = {};
    appData.history.forEach(item => {
      const dateKey = new Date(item.completion_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    });

    Object.keys(groups).sort((a, b) => new Date(b) - new Date(a)).forEach(dateStr => {
      const groupEl = document.createElement('div');
      groupEl.className = 'history-group';

      const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

      let titleLabel = dateStr;
      if (dateStr === todayStr) titleLabel = 'Today';
      else if (dateStr === yesterdayStr) titleLabel = 'Yesterday';

      groupEl.innerHTML = `<h3 class="history-group-title">${titleLabel}</h3><div class="history-list"></div>`;
      const listEl = groupEl.querySelector('.history-list');

      groups[dateStr].forEach(item => {
        const itemEl = document.createElement('div');
        itemEl.className = 'history-item';

        const statusClass = item.status || 'completed';
        const iconChar = statusClass === 'completed' ? '✓' : statusClass === 'missed' ? '⊗' : '➔';
        const ppClass = item.pp_earned > 0 ? 'positive' : item.pp_earned < 0 ? 'negative' : 'neutral';
        const ppText = item.pp_earned > 0 ? `+${item.pp_earned} PP` : `${item.pp_earned} PP`;

        let severityLabel = 'MED (x1)';
        const s = item.severity || 'med';
        if (s === 'low') severityLabel = 'LOW (x0.5)';
        else if (s === 'high') severityLabel = 'HIGH (x2)';
        else if (s === 'life_changing') severityLabel = 'LIFE CHANGING (x5)';

        itemEl.innerHTML = `
          <div class="history-left">
            <div class="status-icon ${statusClass}">${iconChar}</div>
            <div class="history-details">
              <span class="history-item-title">${escapeHtml(item.title)}</span>
              <div class="history-meta">
                <span>${item.category}</span> • <span>${severityLabel}</span>
              </div>
            </div>
          </div>
          <div class="history-right">
            <span class="pp-badge ${ppClass}">${ppText}</span>
            <span class="history-time">${new Date(item.completion_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        `;

        listEl.appendChild(itemEl);
      });

      elements.historyGroups.appendChild(groupEl);
    });
  }

  function renderStatisticsTab() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    elements.statsMonthYear.textContent = `${monthNames[statsCurrentMonth]} ${statsCurrentYear}`;

    let potentialPp = appData.total_pp;
    appData.active_tasks.forEach(t => {
      potentialPp += parseInt(t.base_pp, 10) * 2;
    });
    elements.metricPotentialPp.textContent = potentialPp.toLocaleString();
    elements.metricActiveCategories.textContent = appData.categories.length;

    renderHeatmapCalendar();
    renderCategoryPerformanceTable();
  }

  function renderHeatmapCalendar() {
    elements.heatmapMonthsWrapper.innerHTML = '';
    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];

    let m1Month = statsCurrentMonth - 1;
    let m1Year = statsCurrentYear;
    if (m1Month < 0) {
      m1Month = 11;
      m1Year--;
    }

    let m2Month = statsCurrentMonth;
    let m2Year = statsCurrentYear;

    [ { month: m1Month, year: m1Year }, { month: m2Month, year: m2Year } ].forEach(mInfo => {
      const monthBlock = document.createElement('div');
      monthBlock.className = 'heatmap-month-block';

      monthBlock.innerHTML = `
        <div class="heatmap-month-title">${monthNames[mInfo.month]} ${mInfo.year}</div>
        <div class="heatmap-weekdays">
          <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
        </div>
        <div class="heatmap-grid"></div>
      `;

      const grid = monthBlock.querySelector('.heatmap-grid');
      const firstDay = new Date(mInfo.year, mInfo.month, 1);
      const lastDay = new Date(mInfo.year, mInfo.month + 1, 0);
      const startDayOfWeek = (firstDay.getDay() + 6) % 7;

      for (let i = 0; i < startDayOfWeek; i++) {
        const emptyCell = document.createElement('div');
        emptyCell.className = 'heatmap-day nodata';
        emptyCell.style.opacity = '0.15';
        grid.appendChild(emptyCell);
      }

      const today = new Date();
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const cell = document.createElement('div');
        cell.className = 'heatmap-day';
        cell.textContent = day;

        const isToday = today.getDate() === day && today.getMonth() === mInfo.month && today.getFullYear() === mInfo.year;
        if (isToday) cell.classList.add('today');

        const dayHistory = appData.history.filter(h => {
          const d = new Date(h.completion_time);
          return d.getDate() === day && d.getMonth() === mInfo.month && d.getFullYear() === mInfo.year;
        });

        if (dayHistory.length > 0) {
          const completed = dayHistory.filter(h => h.status === 'completed').length;
          const ratio = completed / dayHistory.length;
          if (ratio >= 0.7) cell.classList.add('productive');
          else if (ratio >= 0.3) cell.classList.add('average');
          else cell.classList.add('lazy');
        } else {
          cell.classList.add('nodata');
        }

        grid.appendChild(cell);
      }

      elements.heatmapMonthsWrapper.appendChild(monthBlock);
    });
  }

  function renderCategoryPerformanceTable() {
    elements.categoryPerformanceBody.innerHTML = '';

    appData.categories.forEach(cat => {
      const catHistory = appData.history.filter(h => h.category.toLowerCase() === cat.name.toLowerCase());
      const completed = catHistory.filter(h => h.status === 'completed').length;
      const missed = catHistory.filter(h => h.status === 'missed').length;
      const total = completed + missed;
      const successRate = total > 0 ? Math.round((completed / total) * 100) : 100;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-weight: 600;"><span style="color: ${cat.color || '#7C3AED'};">■</span> ${escapeHtml(cat.name)}</td>
        <td>${completed}</td>
        <td>${missed}</td>
        <td>
          <div class="progress-bar-container">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${successRate}%; background-color: ${cat.color || '#7C3AED'};"></div>
            </div>
            <span style="font-family: var(--font-mono); font-size: 12px; font-weight: 700;">${successRate}%</span>
          </div>
        </td>
      `;
      elements.categoryPerformanceBody.appendChild(tr);
    });
  }

  function renderCategoryModalList() {
    elements.modalCategoriesList.innerHTML = '';

    appData.categories.forEach((cat) => {
      const row = document.createElement('div');
      row.className = 'cat-item-row';
      row.innerHTML = `
        <div class="cat-item-info">
          <div class="cat-icon-badge" style="background: ${cat.color || '#7C3AED'}22; color: ${cat.color || '#7C3AED'}; font-weight: 700;">
            ${cat.name.charAt(0).toUpperCase()}
          </div>
          <div class="cat-item-text">
            <span class="cat-name">${escapeHtml(cat.name)}</span>
            <span class="cat-sub">${cat.subtext || 'Active Module'}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="cat-weight-pill">${cat.weight || 1.0}x PP</span>
          <div class="cat-item-actions">
            <button class="btn-cat-action btn-cat-edit" title="Edit Category">✏️</button>
            <button class="btn-cat-action btn-cat-delete" title="Delete Category">🗑️</button>
          </div>
        </div>
      `;

      row.querySelector('.btn-cat-edit').addEventListener('click', () => {
        editingCategoryId = cat.id;
        elements.catDesignation.value = cat.name;
        elements.catSymbology.value = cat.icon || 'tag';
        elements.symbologyPreview.textContent = (cat.icon || '⚡').charAt(0).toUpperCase();
        elements.catWeight.value = cat.weight || 1.0;
        elements.catWeightVal.textContent = (cat.weight || 1.0) + 'x PP';
        selectedVectorColor = cat.color || '#7C3AED';

        elements.colorVectorGroup.querySelectorAll('.color-dot').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-color') === selectedVectorColor);
        });

        elements.formSynthesizeCategory.querySelector('button[type="submit"] span').textContent = '✓ UPDATE MODULE';
      });

      row.querySelector('.btn-cat-delete').addEventListener('click', () => {
        if (appData.categories.length <= 1) {
          showToast('Cannot delete the last remaining category!');
          return;
        }

        appData.categories = appData.categories.filter(c => c.id !== cat.id);
        saveAppData();
        renderCategoryModalList();
        showToast(`Category '${cat.name}' Deleted.`);
      });

      elements.modalCategoriesList.appendChild(row);
    });
  }

  function renderMiniCalendar() {
    elements.miniCalGrid.innerHTML = '';
    const year = rescheduleSelectedDate.getFullYear();
    const month = rescheduleSelectedDate.getMonth();

    const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    elements.miniCalMonthYear.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;

    for (let i = 0; i < startDayOfWeek; i++) {
      const emptyCell = document.createElement('div');
      emptyCell.className = 'mini-cal-cell disabled';
      elements.miniCalGrid.appendChild(emptyCell);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const cell = document.createElement('div');
      cell.className = 'mini-cal-cell';
      cell.textContent = day;

      if (rescheduleSelectedDate.getDate() === day && rescheduleSelectedDate.getMonth() === month && rescheduleSelectedDate.getFullYear() === year) {
        cell.classList.add('selected');
      }

      cell.addEventListener('click', () => {
        rescheduleSelectedDate = new Date(year, month, day);
        renderMiniCalendar();
      });

      elements.miniCalGrid.appendChild(cell);
    }
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>⚡</span> <span>${escapeHtml(msg)}</span>`;
    elements.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // DOM READY
  document.addEventListener('DOMContentLoaded', init);
})();

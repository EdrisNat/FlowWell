(() => {
      "use strict";

      const STORAGE_KEY = "flowwell.v1";
      const SECURE_STORAGE_KEY = "flowwell.secure.v1";
      const dayMs = 86400000;
      const today = () => toISO(new Date());
      const symptoms = [
        ["Cramps", "C"],
        ["Headache", "H"],
        ["Fatigue", "F"],
        ["Bloating", "B"],
        ["Mood Swings", "M"],
        ["Breast Tenderness", "T"],
        ["Nausea", "N"]
      ];
      const myths = [
        {
          myth: "Menstruation is linked to sorcery.",
          fact: "A period is a normal body process. It is not connected to sorcery, curses, or spiritual danger."
        },
        {
          myth: "Period blood is dirty.",
          fact: "Period blood is part of the body clearing the monthly lining. Good hygiene helps comfort, but having a period is not dirty or shameful."
        },
        {
          myth: "You cannot bathe during periods.",
          fact: "Bathing is safe during a period. Warm water can even help some people feel cleaner and calmer."
        },
        {
          myth: "Pain means you should just endure quietly.",
          fact: "Common cramps can be managed, but severe pain deserves care. Campus health workers can help without judgement."
        },
        {
          myth: "Talking about periods brings embarrassment.",
          fact: "Private, respectful conversations help students get products, care, and support when they need it."
        }
      ];
      const resources = [
        { name: "University Health Center", phone: "+256700000101", note: "Campus medical support and pain guidance" },
        { name: "Female-Friendly Clinic", phone: "+256700000202", note: "Confidential care and reproductive health support" },
        { name: "Nurse Helpline", phone: "+256700000303", note: "Fast advice when symptoms feel worrying" }
      ];
      const trustedPlaces = [
        { title: "Campus Health Center", text: "Ask for a nurse privately and explain your symptoms in your own words." },
        { title: "Dean of Students Office", text: "Support for absence guidance, student welfare, and safe referrals." },
        { title: "Women Students Association", text: "Peer support for products, stigma concerns, and dignity needs." }
      ];

      const defaultState = {
        periodDays: [],
        symptoms: {},
        locations: [
          { id: uid(), building: "Freedom Hall", floor: "Ground floor", room: "Women's Washroom", product: "Pads", verified: today(), distance: 2, out: false },
          { id: uid(), building: "Main Library", floor: "Level 1", room: "Student Support Desk", product: "Free", verified: today(), distance: 4, out: false },
          { id: uid(), building: "Science Block", floor: "Second floor", room: "Vending Area", product: "Vending Machine", verified: today(), distance: 6, out: false }
        ],
        believedMyths: [],
        letters: [],
        settings: {
          cycleLength: 28,
          periodDuration: 5,
          showFertile: false,
          theme: "light",
          highContrast: false
        }
      };

      let state;
      let privacy = {
        encrypted: false,
        locked: false,
        key: null,
        salt: null
      };
      let pendingSave = 0;
      let selectedDate = today();
      let multiSelectMode = false;
      let multiSelected = new Set();
      let calendarCursor = startOfMonth(new Date());
      let currentLetter = "";
      let locationAscending = true;

      const $ = (selector, root = document) => root.querySelector(selector);
      const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

      /**
       * Handles all localStorage reads and writes.
       */
      function Data() {}
      Data.load = () => {
        if (localStorage.getItem(SECURE_STORAGE_KEY)) {
          privacy.encrypted = true;
          privacy.locked = true;
          return clone(defaultState);
        }
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          // First-ever open: raw is null → return a clean state with NO period days,
          // locations only, and no pre-marked calendar dates.
          if (!raw) return clone(defaultState);
          const stored = JSON.parse(raw);
          return mergeState(defaultState, stored);
        } catch {
          return clone(defaultState);
        }
      };
      Data.save = () => {
        clearTimeout(pendingSave);
        pendingSave = setTimeout(() => {
          Data.saveNow();
        }, 140);
      };
      Data.saveNow = async () => {
        if (privacy.encrypted && privacy.key) {
          const encrypted = await encryptState(state, privacy.key, privacy.salt);
          localStorage.setItem(SECURE_STORAGE_KEY, JSON.stringify(encrypted));
          localStorage.removeItem(STORAGE_KEY);
          return;
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      };

      state = Data.load();

      /**
       * Coordinates all UI drawing so actions can update the screen in batches.
       */
      const Renderer = {
        all() {
          this.theme();
          this.dashboard();
          this.calendar();
          this.selectedDay();
          this.symptomForm();
          this.symptomChart();
          this.locations();
          this.myths();
          this.resources();
          this.settings();
          this.logs();
        },
        theme() {
          document.documentElement.dataset.theme = state.settings.theme;
          document.documentElement.dataset.contrast = state.settings.highContrast ? "high" : "normal";
          $("#themeToggle").setAttribute("aria-label", state.settings.theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
          $("#themeToggle").setAttribute("title", state.settings.theme === "dark" ? "Light theme" : "Dark theme");
          $("#fertileToggle").setAttribute("aria-pressed", String(state.settings.showFertile));
          $("#lockScreen").classList.toggle("active", privacy.locked);
        },
        dashboard() {
          const prediction = getPrediction();
          const lastStart = getLastPeriodStart();
          const stats = [
            { label: "Days since last period", value: lastStart ? daysBetween(lastStart, today()) : "Not set" },
            { label: "Days until next period", value: prediction.nextStart ? Math.max(0, daysBetween(today(), prediction.nextStart)) : "Log first" },
            { label: "Next expected start", value: prediction.nextStart ? formatShort(prediction.nextStart) : "Unknown" },
            { label: state.settings.showFertile ? "Fertile window" : "Ovulation window", value: prediction.fertileStart ? `${formatShort(prediction.fertileStart)} – ${formatShort(prediction.fertileEnd)}` : "Log a period first" }
          ];
          $("#dashboardStats").innerHTML = stats.map((stat) => `
            <div class="stat">
              <b>${stat.value}</b>
              <span>${stat.label}</span>
            </div>
          `).join("");
        },
        calendar() {
          const calendar = $("#calendar");
          const monthStart = startOfMonth(calendarCursor);
          const gridStart = addDays(monthStart, -monthStart.getDay());
          const prediction = getPrediction();
          $("#monthLabel").textContent = monthStart.toLocaleDateString(undefined, { month: "long", year: "numeric" });
          // Update multi-select toolbar visibility
          const toolbar = $("#multiSelectToolbar");
          if (toolbar) {
            toolbar.style.display = multiSelectMode ? "flex" : "none";
            const countEl = toolbar.querySelector("#multiSelectCount");
            if (countEl) countEl.textContent = `${multiSelected.size} day${multiSelected.size === 1 ? "" : "s"} selected`;
          }
          const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => `<div class="weekday">${d}</div>`).join("");
          const days = Array.from({ length: 42 }, (_, index) => {
            const date = addDays(gridStart, index);
            const iso = toISO(date);
            const classes = ["day"];
            if (date.getMonth() !== monthStart.getMonth()) classes.push("outside");
            if (iso === today()) classes.push("today");
            if (state.periodDays.includes(iso)) classes.push("period");
            if (prediction.periodDays.includes(iso) && !state.periodDays.includes(iso)) classes.push("predicted");
            if (hasSymptoms(iso)) classes.push("symptom");
            if (state.symptoms[iso]?.notes) classes.push("note");
            if (multiSelectMode && multiSelected.has(iso)) classes.push("multi-selected");

            // Ovulation gradient — ALWAYS shown when there is period data.
            // showFertile only controls whether the date text appears in the dashboard stat.
            // The colours are health information and should always be visible.
            let ovStyle = "";
            const hasData = prediction.ovulationDay !== null;

            if (hasData && prediction.ovulationMap[iso] !== undefined) {
              const prob = prediction.ovulationMap[iso];
              // Pink → red scale based on Dunson 2002 fecundability weights
              let r, g, b;
              if (prob <= 0.2)      { r=255; g=182; b=193; }
              else if (prob <= 0.4) { r=252; g=140; b=160; }
              else if (prob <= 0.6) { r=240; g=90;  b=120; }
              else if (prob <= 0.8) { r=220; g=50;  b=80;  }
              else                  { r=200; g=30;  b=60;  }
              const alpha = 0.25 + prob * 0.60; // 0.25 → 0.85, visible even at low prob
              ovStyle = ` style="background:rgba(${r},${g},${b},${alpha.toFixed(2)}) !important;border-color:rgba(${r},${g},${b},0.65) !important;"`;
            }

            const isOvDay = hasData && iso === prediction.ovulationDay;
            const ariaLabel = isOvDay
              ? `${formatLong(iso)} — predicted ovulation day`
              : prediction.ovulationMap[iso]
                ? `${formatLong(iso)} — fertile (${Math.round(prediction.ovulationMap[iso]*100)}% probability)`
                : formatLong(iso);

            return `<button class="${classes.join(" ")}" type="button" data-date="${iso}" aria-label="${ariaLabel}"${ovStyle}>${date.getDate()}${isOvDay ? '<span class="ov-dot" aria-hidden="true"></span>' : ""}</button>`;
          }).join("");
          calendar.innerHTML = weekdays + days;
        },
        selectedDay() {
          const entry = state.symptoms[selectedDate] || {};
          const isPeriod = state.periodDays.includes(selectedDate);
          // Default end date = selectedDate + (periodDuration - 1), capped to not exceed today
          const defaultEnd = toISO(addDays(parseISO(selectedDate), state.settings.periodDuration - 1));
          $("#selectedDayPanel").innerHTML = `
            <div>
              <h3>${formatLong(selectedDate)}</h3>
              <p>${isPeriod ? "Period logged for this day." : "No period logged for this day yet."}</p>
            </div>

            <div class="period-log-form">
              <strong class="period-log-title">Log period range</strong>
              <p class="period-log-hint">Choose exactly which days to mark — you are not limited to the default duration.</p>
              <div class="period-range-row">
                <label class="period-range-label">
                  Start
                  <input type="date" id="periodStartInput" value="${selectedDate}" aria-label="Period start date">
                </label>
                <span class="period-range-sep">→</span>
                <label class="period-range-label">
                  End
                  <input type="date" id="periodEndInput" value="${defaultEnd}" aria-label="Period end date">
                </label>
              </div>
              <div class="button-row">
                <button class="primary" type="button" data-action="logPeriodRange">Save period days</button>
                <button class="secondary" type="button" data-action="togglePeriod">${isPeriod ? "Remove this day only" : "Mark this day only"}</button>
                <button class="ghost" type="button" data-action="useForSymptoms">Log symptoms</button>
              </div>
            </div>

            <div>
              <strong>Symptoms saved</strong>
              ${hasSymptoms(selectedDate) ? `<p>${Object.entries(entry.values || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => `${k}: ${v}/5`).join(", ")}</p>` : `<div class="empty"><b>--</b><span>No symptoms saved for this day.</span></div>`}
            </div>
            ${entry.notes ? `<div><strong>Note</strong><p>${escapeHtml(entry.notes)}</p></div>` : ""}
          `;
        },
        symptomForm() {
          $("#symptomDate").value = selectedDate;
          const entry = state.symptoms[selectedDate] || { values: {}, notes: "" };
          const allSymptoms = getAllSymptoms();
          $("#symptomList").innerHTML = allSymptoms.map(([name, icon]) => {
            const value = Number(entry.values?.[name] || 0);
            return `
              <div class="symptom-item">
                <div class="symptom-name"><span aria-hidden="true">${icon}</span><span>${escapeHtml(name)}</span></div>
                <label>
                  <span class="sr-only">${escapeHtml(name)} pain scale</span>
                  <input type="range" min="0" max="5" value="${value}" data-symptom="${escapeHtml(name)}" aria-label="${escapeHtml(name)} pain scale, 0 to 5">
                </label>
              </div>
            `;
          }).join("");
          $("#dayNotes").value = entry.notes || "";
        },
        symptomChart() {
          const totals = {};
          Object.values(state.symptoms).forEach((entry) => {
            Object.entries(entry.values || {}).forEach(([name, value]) => {
              totals[name] = (totals[name] || 0) + Number(value);
            });
          });
          const rows = Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
          $("#symptomChart").innerHTML = rows.length ? rows.map(([name, value]) => `
            <div class="bar-row">
              <strong>${escapeHtml(name)}</strong>
              <div class="bar-track"><div class="bar" style="width:${Math.min(100, value * 10)}%"></div></div>
              <span>${value}</span>
            </div>
          `).join("") : `<div class="empty"><b>+</b><span>Your symptom chart will grow after you save a few days.</span></div>`;
        },
        locations() {
          const list = [...state.locations].sort((a, b) => locationAscending ? a.distance - b.distance : b.distance - a.distance);
          $("#locationList").innerHTML = list.length ? list.map((loc) => `
            <article class="card location">
              <div class="location-head">
                <div>
                  <h3>${escapeHtml(loc.building)} - ${escapeHtml(loc.room)}</h3>
                  <div class="meta">${escapeHtml(loc.floor)} - ${escapeHtml(loc.product)} - order ${loc.distance}</div>
                </div>
                <span class="stock ${loc.out ? "out" : ""}">${loc.out ? "Out of stock" : "Available"}</span>
              </div>
              <div class="meta">Last verified: ${formatShort(loc.verified)}</div>
              <div class="button-row">
                <button class="secondary" type="button" data-stock="${loc.id}">${loc.out ? "Mark available" : "Mark as out of stock"}</button>
                <button class="danger" type="button" data-remove-location="${loc.id}">Delete</button>
              </div>
            </article>
          `).join("") : `<div class="empty card"><b>PIN</b><span>No locations saved yet.</span></div>`;
        },
        myths() {
          $("#mythList").innerHTML = myths.map((item, index) => {
            const believed = state.believedMyths.includes(index);
            return `
              <details class="myth">
                <summary>Myth: ${escapeHtml(item.myth)}</summary>
                <div class="myth-body">
                  <div class="fact"><strong>Fact:</strong> ${escapeHtml(item.fact)}</div>
                  <button class="${believed ? "primary" : "secondary"}" type="button" data-myth="${index}">
                    ${believed ? "Saved: I used to believe this" : "I used to believe this"}
                  </button>
                </div>
              </details>
            `;
          }).join("");
        },
        resources() {
          $("#callList").innerHTML = resources.map((item) => `
            <div class="resource-call">
              <div>
                <h3>${escapeHtml(item.name)}</h3>
                <div class="meta">${escapeHtml(item.note)}</div>
              </div>
              <a class="primary" href="tel:${item.phone}" aria-label="Call ${escapeHtml(item.name)}">Call</a>
            </div>
          `).join("");
          $("#resourceList").innerHTML = trustedPlaces.map((item) => `
            <article class="card">
              <h3>${escapeHtml(item.title)}</h3>
              <p class="meta">${escapeHtml(item.text)}</p>
            </article>
          `).join("");
        },
        settings() {
          $("#cycleLength").value = state.settings.cycleLength;
          $("#periodDuration").value = state.settings.periodDuration;
          $("#cycleLengthValue").textContent = `${state.settings.cycleLength} days`;
          $("#periodDurationValue").textContent = `${state.settings.periodDuration} days`;
          $("#fertileToggle").setAttribute("aria-pressed", String(state.settings.showFertile));
          $("#privacyStatus").textContent = privacy.encrypted
            ? "PIN lock is on. Records are encrypted in this browser."
            : "Records are stored on this device. Add a PIN to encrypt them.";
          $("#lockNow").disabled = !privacy.encrypted || privacy.locked;
          $("#removePin").disabled = !privacy.encrypted || privacy.locked;
        },
        logs() {
          const blocks = getPeriodBlocks();
          $("#periodLogList").innerHTML = blocks.length ? blocks.map((block, index) => `
            <div class="resource-call">
              <div>
                <h3>${formatShort(block.start)} to ${formatShort(block.end)}</h3>
                <div class="meta">${block.days.length} saved day${block.days.length === 1 ? "" : "s"}</div>
              </div>
              <button class="danger" type="button" data-remove-block="${index}">Delete</button>
            </div>
          `).join("") : `<div class="empty"><b>--</b><span>No period logs yet.</span></div>`;
          $("#letterHistory").innerHTML = state.letters.length ? state.letters.map((letter) => `
            <div class="history-item card">
              <h3>${formatShort(letter.created)} - ${escapeHtml(letter.courseCode)}</h3>
              <p class="meta">${escapeHtml(letter.studentName)} to ${escapeHtml(letter.lecturerName)}</p>
              <div class="button-row">
                <button class="secondary" type="button" data-open-letter="${letter.id}">Open</button>
                <button class="danger" type="button" data-delete-letter="${letter.id}">Delete</button>
              </div>
            </div>
          `).join("") : `<div class="empty"><b>MAIL</b><span>Saved letters will appear here.</span></div>`;
        }
      };

      /**
       * Wires DOM events to local state updates.
       */
      const Events = {
        init() {
          $$(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
          $("#themeToggle").addEventListener("click", () => updateSetting("theme", state.settings.theme === "dark" ? "light" : "dark"));
          $("#contrastToggle").addEventListener("click", () => updateSetting("highContrast", !state.settings.highContrast));
          $("#unlockForm").addEventListener("submit", unlockWithPin);
          $("#resetLockedData").addEventListener("click", () => confirmAction("Erase encrypted FlowWell records from this browser? This cannot be undone.", clearData));
          $("#prevMonth").addEventListener("click", () => { calendarCursor = addMonths(calendarCursor, -1); Renderer.calendar(); });
          $("#nextMonth").addEventListener("click", () => { calendarCursor = addMonths(calendarCursor, 1); Renderer.calendar(); });
          $("#todayBtn").addEventListener("click", () => { selectedDate = today(); calendarCursor = startOfMonth(new Date()); Renderer.all(); });
          $("#calendar").addEventListener("click", onCalendarClick);
          $("#selectedDayPanel").addEventListener("click", onSelectedDayAction);
          $("#symptomDate").addEventListener("change", (event) => { selectedDate = event.target.value || today(); calendarCursor = startOfMonth(parseISO(selectedDate)); Renderer.all(); });
          $("#symptomForm").addEventListener("submit", saveSymptoms);
          $("#addSymptomBtn").addEventListener("click", addCustomSymptom);
          $("#locationForm").addEventListener("submit", addLocation);
          $("#locationList").addEventListener("click", onLocationAction);
          $("#sortLocations").addEventListener("click", () => { locationAscending = !locationAscending; Renderer.locations(); toast(`Sorted ${locationAscending ? "nearest first" : "farthest first"}`); });
          $("#mythList").addEventListener("click", onMythAction);
          $("#letterForm").addEventListener("submit", generateLetter);
          $("#copyLetter").addEventListener("click", copyLetter);
          $("#downloadLetter").addEventListener("click", downloadLetter);
          $("#saveLetter").addEventListener("click", saveLetterHistory);
          $("#cycleLength").addEventListener("input", (event) => updateSetting("cycleLength", Number(event.target.value)));
          $("#periodDuration").addEventListener("input", (event) => updateSetting("periodDuration", Number(event.target.value)));
          $("#fertileToggle").addEventListener("click", () => updateSetting("showFertile", !state.settings.showFertile));
          $("#pinForm").addEventListener("submit", setPrivacyPin);
          $("#lockNow").addEventListener("click", lockNow);
          $("#removePin").addEventListener("click", () => confirmAction("Remove PIN lock and store FlowWell data without encryption?", removePrivacyPin));
          $("#exportData").addEventListener("click", exportData);
          $("#importData").addEventListener("change", importData);
          $("#clearData").addEventListener("click", () => confirmAction("Clear all FlowWell data from this browser?", clearData));
          $("#periodLogList").addEventListener("click", onPeriodLogAction);
          const multiSelectBtn = $("#multiSelectBtn");
          if (multiSelectBtn) multiSelectBtn.addEventListener("click", toggleMultiSelect);
          const removeSelectedBtn = $("#removeSelectedBtn");
          if (removeSelectedBtn) removeSelectedBtn.addEventListener("click", removeMultiSelected);
          $("#letterHistory").addEventListener("click", onLetterHistoryAction);
          $("#confirmNo").addEventListener("click", () => $("#confirmModal").close());
        }
      };

      function switchTab(tab) {
        $$(".tab").forEach((button) => button.setAttribute("aria-selected", String(button.dataset.tab === tab)));
        $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${tab}`));
      }

      function onCalendarClick(event) {
        const button = event.target.closest("[data-date]");
        if (!button) return;
        const iso = button.dataset.date;
        if (multiSelectMode) {
          if (multiSelected.has(iso)) {
            multiSelected.delete(iso);
          } else {
            multiSelected.add(iso);
          }
          Renderer.calendar();
          return;
        }
        selectedDate = iso;
        Renderer.all();
      }

      function onSelectedDayAction(event) {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (!action) return;

        if (action === "logPeriodRange") {
          const startVal = $("#periodStartInput")?.value || selectedDate;
          const endVal   = $("#periodEndInput")?.value   || selectedDate;
          if (endVal < startVal) return toast("End date must be on or after the start date");
          const span = daysBetween(startVal, endVal);
          if (span > 14) return toast("Range too long — please enter up to 14 days");
          const days = Array.from({ length: span + 1 }, (_, i) => toISO(addDays(parseISO(startVal), i)));
          state.periodDays = uniqueSorted([...state.periodDays, ...days]);
          persist(`${days.length} period day${days.length === 1 ? "" : "s"} logged`);
        }
        if (action === "togglePeriod") {
          state.periodDays = state.periodDays.includes(selectedDate)
            ? state.periodDays.filter((day) => day !== selectedDate)
            : uniqueSorted([...state.periodDays, selectedDate]);
          persist(state.periodDays.includes(selectedDate) ? "Period day added" : "Period day removed");
        }
        if (action === "useForSymptoms") {
          switchTab("symptoms");
          Renderer.symptomForm();
        }
      }

      function saveSymptoms(event) {
        event.preventDefault();
        const date = $("#symptomDate").value || selectedDate;
        const values = {};
        $$("[data-symptom]", $("#symptomList")).forEach((input) => {
          values[input.dataset.symptom] = Number(input.value);
        });
        state.symptoms[date] = { values, notes: $("#dayNotes").value.trim() };
        selectedDate = date;
        persist("Symptoms saved");
      }

      function addCustomSymptom() {
        const name = $("#customSymptom").value.trim();
        if (!name) return toast("Add a symptom name first");
        const date = $("#symptomDate").value || selectedDate;
        const entry = state.symptoms[date] || { values: {}, notes: "" };
        entry.values[name] = entry.values[name] || 0;
        state.symptoms[date] = entry;
        $("#customSymptom").value = "";
        selectedDate = date;
        persist("Custom symptom added");
      }

      function addLocation(event) {
        event.preventDefault();
        state.locations.push({
          id: uid(),
          building: $("#locBuilding").value.trim(),
          floor: $("#locFloor").value.trim(),
          room: $("#locRoom").value.trim(),
          product: $("#locProduct").value,
          verified: today(),
          distance: Number($("#locDistance").value || 99),
          out: false
        });
        event.target.reset();
        $("#locDistance").value = 5;
        persist("Location reported");
      }

      function onLocationAction(event) {
        const stockId = event.target.closest("[data-stock]")?.dataset.stock;
        const removeId = event.target.closest("[data-remove-location]")?.dataset.removeLocation;
        if (stockId) {
          const loc = state.locations.find((item) => item.id === stockId);
          loc.out = !loc.out;
          loc.verified = today();
          persist(loc.out ? "Marked out of stock" : "Marked available");
        }
        if (removeId) {
          confirmAction("Delete this product location?", () => {
            state.locations = state.locations.filter((item) => item.id !== removeId);
            persist("Location deleted");
          });
        }
      }

      function onMythAction(event) {
        const index = Number(event.target.closest("[data-myth]")?.dataset.myth);
        if (Number.isNaN(index)) return;
        state.believedMyths = state.believedMyths.includes(index)
          ? state.believedMyths.filter((item) => item !== index)
          : [...state.believedMyths, index];
        persist("Myth reflection updated");
      }

      function generateLetter(event) {
        event.preventDefault();
        const studentName = $("#studentName").value.trim();
        const courseCode = $("#courseCode").value.trim();
        const lecturerName = $("#lecturerName").value.trim();
        const absenceDate = $("#absenceDate").value;
        const reason = $("#absenceReason").value;
        currentLetter = [
          `Dear ${lecturerName},`,
          "",
          `RE: Absence from ${courseCode} on ${formatLong(absenceDate)}`,
          "",
          `I am writing to respectfully inform you that I was unable to attend class on ${formatLong(absenceDate)} due to ${reason.toLowerCase()}.`,
          "",
          "I remain committed to keeping up with the coursework and would be grateful for guidance on any missed material or class activity.",
          "",
          "Thank you for your understanding.",
          "",
          "Yours sincerely,",
          studentName
        ].join("\n");
        $("#letterPreview").textContent = currentLetter;
        toast("Letter generated");
      }

      async function copyLetter() {
        if (!currentLetter) return toast("Generate a letter first");
        try {
          await navigator.clipboard.writeText(currentLetter);
          toast("Letter copied");
        } catch {
          toast("Copy is unavailable in this browser");
        }
      }

      function downloadLetter() {
        if (!currentLetter) return toast("Generate a letter first");
        const blob = new Blob([currentLetter], { type: "text/plain" });
        downloadBlob(blob, `flowwell-letter-${today()}.txt`);
        toast("Letter downloaded");
      }

      function saveLetterHistory() {
        if (!currentLetter) return toast("Generate a letter first");
        state.letters.unshift({
          id: uid(),
          created: today(),
          text: currentLetter,
          studentName: $("#studentName").value.trim(),
          courseCode: $("#courseCode").value.trim(),
          lecturerName: $("#lecturerName").value.trim()
        });
        persist("Letter saved");
      }

      function updateSetting(key, value) {
        state.settings[key] = value;
        persist("Settings updated");
      }

      async function unlockWithPin(event) {
        event.preventDefault();
        const pin = $("#unlockPin").value;
        const payload = getSecurePayload();
        if (!payload || !pin) return toast("Enter your PIN");
        try {
          const key = await deriveKey(pin, payload.salt);
          const decrypted = await decryptState(payload, key);
          state = mergeState(defaultState, decrypted);
          privacy.key = key;
          privacy.salt = payload.salt;
          privacy.encrypted = true;
          privacy.locked = false;
          $("#unlockPin").value = "";
          selectedDate = today();
          calendarCursor = startOfMonth(new Date());
          Renderer.all();
          toast("FlowWell unlocked");
        } catch {
          toast("That PIN did not unlock your records");
        }
      }

      async function setPrivacyPin(event) {
        event.preventDefault();
        const pin = $("#privacyPin").value.trim();
        if (pin.length < 4) return toast("Use at least 4 characters for the PIN");
        try {
          const salt = randomBase64(16);
          const key = await deriveKey(pin, salt);
          privacy.key = key;
          privacy.salt = salt;
          privacy.encrypted = true;
          privacy.locked = false;
          await Data.saveNow();
          localStorage.removeItem(STORAGE_KEY);
          $("#privacyPin").value = "";
          Renderer.all();
          toast("PIN lock enabled");
        } catch {
          toast("PIN lock could not be enabled here");
        }
      }

      function lockNow() {
        if (!privacy.encrypted) return toast("Set a PIN first");
        privacy.key = null;
        privacy.salt = null;
        privacy.locked = true;
        state = clone(defaultState);
        Renderer.all();
        toast("FlowWell locked");
      }

      async function removePrivacyPin() {
        if (!privacy.encrypted || privacy.locked) return toast("Unlock FlowWell first");
        privacy.encrypted = false;
        privacy.key = null;
        privacy.salt = null;
        localStorage.removeItem(SECURE_STORAGE_KEY);
        await Data.saveNow();
        Renderer.all();
        toast("PIN lock removed");
      }

      function exportData() {
        Data.saveNow();
        downloadBlob(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }), `flowwell-backup-${today()}.json`);
        toast("Backup exported");
      }

      function importData(event) {
        const file = event.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            state = mergeState(defaultState, JSON.parse(reader.result));
            Data.saveNow();
            Renderer.all();
            toast("Backup imported");
          } catch {
            toast("That backup file could not be read");
          }
        };
        reader.readAsText(file);
        event.target.value = "";
      }

      function clearData() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(SECURE_STORAGE_KEY);
        privacy = { encrypted: false, locked: false, key: null, salt: null };
        state = clone(defaultState);
        selectedDate = today();
        calendarCursor = startOfMonth(new Date());
        Renderer.all();
        toast("All local data cleared");
      }

      function onPeriodLogAction(event) {
        const index = Number(event.target.closest("[data-remove-block]")?.dataset.removeBlock);
        if (Number.isNaN(index)) return;
        const block = getPeriodBlocks()[index];
        confirmAction(`Delete period log from ${formatShort(block.start)} to ${formatShort(block.end)}?`, () => {
          state.periodDays = state.periodDays.filter((day) => !block.days.includes(day));
          persist("Period log deleted");
        });
      }

      function onLetterHistoryAction(event) {
        const openId = event.target.closest("[data-open-letter]")?.dataset.openLetter;
        const deleteId = event.target.closest("[data-delete-letter]")?.dataset.deleteLetter;
        if (openId) {
          const letter = state.letters.find((item) => item.id === openId);
          currentLetter = letter.text;
          $("#letterPreview").textContent = currentLetter;
          switchTab("letters");
        }
        if (deleteId) {
          confirmAction("Delete this saved letter?", () => {
            state.letters = state.letters.filter((item) => item.id !== deleteId);
            persist("Letter deleted");
          });
        }
      }

      function toggleMultiSelect() {
        multiSelectMode = !multiSelectMode;
        if (!multiSelectMode) multiSelected.clear();
        Renderer.calendar();
        const btn = $("#multiSelectBtn");
        if (btn) btn.setAttribute("aria-pressed", String(multiSelectMode));
        if (multiSelectMode) toast("Tap days to select, then press Remove Selected");
      }

      function removeMultiSelected() {
        if (multiSelected.size === 0) return toast("Select at least one day first");
        const count = multiSelected.size;
        confirmAction(`Remove ${count} selected day${count === 1 ? "" : "s"} from period log?`, () => {
          state.periodDays = state.periodDays.filter((d) => !multiSelected.has(d));
          multiSelected.clear();
          multiSelectMode = false;
          persist(`${count} period day${count === 1 ? "" : "s"} removed`);
        });
      }

      function persist(message) {
        Data.save();
        Renderer.all();
        toast(message);
      }

      function confirmAction(message, callback) {
        const modal = $("#confirmModal");
        $("#modalText").textContent = message;
        $("#confirmYes").onclick = () => {
          modal.close();
          callback();
        };
        if (typeof modal.showModal === "function") modal.showModal();
        else if (confirm(message)) callback();
      }

      function toast(message) {
        const node = document.createElement("div");
        node.className = "toast";
        node.textContent = message;
        $("#toasts").append(node);
        setTimeout(() => node.remove(), 2800);
      }

      function getPrediction() {
        // Use the last period BLOCK (start + actual end date user logged).
        const blocks = getPeriodBlocks();
        const lastBlock = blocks.at(-1);
        if (!lastBlock) return { nextStart: null, periodDays: [], fertileStart: null, fertileEnd: null, fertileDays: [], ovulationDay: null, ovulationMap: {} };

        const lastEnd = lastBlock.end;   // actual last day of period as logged
        const lastStart = lastBlock.start;

        // Next period starts approximately cycleLength days after the PERIOD START.
        // We advance until the prediction is not entirely in the past.
        let next = toISO(addDays(parseISO(lastStart), state.settings.cycleLength));
        while (daysBetween(today(), next) < 0) {
          next = toISO(addDays(parseISO(next), state.settings.cycleLength));
        }
        const periodDays = Array.from({ length: state.settings.periodDuration }, (_, i) =>
          toISO(addDays(parseISO(next), i))
        );

        // ── OVULATION WINDOW ──────────────────────────────────────────────────
        // Clinical basis: ovulation typically occurs 10–16 days after menstruation
        // ends, with the peak at ~day 12–14 post-period-end for average 28-day cycles.
        // We anchor at lastEnd + 10 days as the earliest fertile day, and the
        // peak (ovulation day) at lastEnd + 13 (≈ day 14 of new cycle when period is 5d).
        // This matches the Dunson 2002 / Wilcox 1995 model used in the probability weights.
        //
        // For other cycle lengths we scale: ovDay = lastEnd + (cycleLength - 15).
        // Minimum offset is 7 days after period end to avoid overlap.
        const daysAfterEnd = Math.max(7, state.settings.cycleLength - 15);
        const ovDay = toISO(addDays(parseISO(lastEnd), daysAfterEnd));

        const fertileStart = toISO(addDays(parseISO(ovDay), -5));
        const fertileEnd   = toISO(addDays(parseISO(ovDay),  1));
        const fertileDays  = Array.from({ length: 7 }, (_, i) =>
          toISO(addDays(parseISO(fertileStart), i))
        );

        // Relative conception probability per offset from ovulation day.
        // Source: Dunson et al. 2002 (Hum. Reprod.) fecundability estimates.
        const ovOffsets = [[-5, 0.10], [-4, 0.16], [-3, 0.28], [-2, 0.40], [-1, 0.55], [0, 1.0], [1, 0.38]];
        const ovulationMap = {};
        for (const [offset, prob] of ovOffsets) {
          ovulationMap[toISO(addDays(parseISO(ovDay), offset))] = prob;
        }

        return { nextStart: next, periodDays, fertileStart, fertileEnd, fertileDays, ovulationDay: ovDay, ovulationMap };
      }

      function getLastPeriodStart() {
        return getPeriodBlocks().at(-1)?.start || null;
      }

      function getPeriodBlocks() {
        const days = uniqueSorted(state.periodDays);
        const blocks = [];
        days.forEach((day) => {
          const previous = blocks.at(-1);
          if (previous && daysBetween(previous.end, day) === 1) {
            previous.end = day;
            previous.days.push(day);
          } else {
            blocks.push({ start: day, end: day, days: [day] });
          }
        });
        return blocks;
      }

      function getAllSymptoms() {
        const custom = new Map();
        Object.values(state.symptoms).forEach((entry) => {
          Object.keys(entry.values || {}).forEach((name) => {
            if (!symptoms.some(([base]) => base === name)) custom.set(name, "*");
          });
        });
        return [...symptoms, ...custom.entries()];
      }

      function hasSymptoms(date) {
        const values = state.symptoms[date]?.values || {};
        return Object.values(values).some((value) => Number(value) > 0);
      }

      function mergeState(base, incoming) {
        return {
          ...clone(base),
          ...incoming,
          periodDays: uniqueSorted(incoming.periodDays || base.periodDays),
          symptoms: incoming.symptoms || base.symptoms,
          locations: incoming.locations || base.locations,
          believedMyths: incoming.believedMyths || base.believedMyths,
          letters: incoming.letters || base.letters,
          settings: { ...base.settings, ...(incoming.settings || {}) }
        };
      }

      function getSecurePayload() {
        try {
          return JSON.parse(localStorage.getItem(SECURE_STORAGE_KEY));
        } catch {
          return null;
        }
      }

      async function deriveKey(pin, saltBase64) {
        if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is unavailable");
        const encoder = new TextEncoder();
        const material = await crypto.subtle.importKey(
          "raw",
          encoder.encode(pin),
          "PBKDF2",
          false,
          ["deriveKey"]
        );
        return crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: base64ToBytes(saltBase64),
            iterations: 150000,
            hash: "SHA-256"
          },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      }

      async function encryptState(value, key, salt) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(value));
        const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        return {
          version: 1,
          salt,
          iv: bytesToBase64(iv),
          data: bytesToBase64(new Uint8Array(cipher))
        };
      }

      async function decryptState(payload, key) {
        const plain = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
          key,
          base64ToBytes(payload.data)
        );
        return JSON.parse(new TextDecoder().decode(plain));
      }

      function randomBase64(length) {
        return bytesToBase64(crypto.getRandomValues(new Uint8Array(length)));
      }

      function bytesToBase64(bytes) {
        let binary = "";
        bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
        return btoa(binary);
      }

      function base64ToBytes(base64) {
        return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      }

      function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
      }

      function addDays(date, days) {
        const next = new Date(date);
        next.setDate(next.getDate() + days);
        return next;
      }

      function addMonths(date, months) {
        return new Date(date.getFullYear(), date.getMonth() + months, 1);
      }

      function startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
      }

      function parseISO(iso) {
        const [year, month, day] = iso.split("-").map(Number);
        return new Date(year, month - 1, day);
      }

      function toISO(date) {
        const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
      }

      function daysBetween(start, end) {
        return Math.round((parseISO(end) - parseISO(start)) / dayMs);
      }

      function uniqueSorted(days) {
        return [...new Set(days)].sort();
      }

      function formatShort(iso) {
        if (!iso) return "";
        return parseISO(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
      }

      function formatLong(iso) {
        if (!iso) return "";
        return parseISO(iso).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
      }

      function uid() {
        return `fw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      }

      /**
       * Creates a JSON-safe clone for older mobile browsers that may not support structuredClone.
       * @param {object} value Object to copy.
       * @returns {object} Deep copy of the object.
       */
      function clone(value) {
        return JSON.parse(JSON.stringify(value));
      }

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, (char) => ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;"
        }[char]));
      }

      window.addEventListener("DOMContentLoaded", () => {
        Events.init();
        Renderer.all();
        $("#absenceDate").value = today();
        registerServiceWorker();
        setTimeout(() => $("#skeleton").classList.add("hidden"), 420);
      });

      function registerServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        navigator.serviceWorker.register("./sw.js").catch(() => {
          toast("Offline install is unavailable in this browser context");
        });
      }
    })();
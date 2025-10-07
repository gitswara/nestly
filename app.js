(function() {
    'use strict';
  
    // DOM elements
    // -----------------------------
    const countdownEl = document.getElementById('countdown');
    const streakEl = document.getElementById('streakCounter');
    const birdCaptionEl = document.getElementById('birdCaption');
  
    const birdFloat = document.getElementById('birdFloat');               // container (fixed)
    const birdImg   = birdFloat ? birdFloat.querySelector('img') : null;  // <img class="bird">
  
    const promptBtn = document.getElementById('promptBtn');
    const doneBadge = document.getElementById('doneBadge'); 
    const overlay = document.getElementById('journalOverlay');
    const journalPromptEl = document.getElementById('journalPrompt');
    const journalInput = document.getElementById('journalInput');
    const anotherPromptBtn = document.getElementById('anotherPromptBtn');
    const doneBtn = document.getElementById('doneBtn');
  
    // -----------------------------
    // Constants & Storage keys
    // -----------------------------
    const DAY_MS = 24 * 60 * 60 * 1000;
    const STORAGE_KEYS = {
      deadline: 'bb_deadline_ms',
      streak: 'bb_streak',
      lastCompletionAt: 'bb_last_completion_at',
      usedPrompts: 'bb_used_prompts_v1'
    };
  
    // Mood → image source map (edit filenames as needed)
    const BIRD_IMAGES = {
      happy:   'bird_happy.png',
      neutral: 'bird_neutral.png',
      annoyed: 'bird_annoyed.png',
      pissed:  'bird_pissed.png'
    };
    const BIRD_FALLBACK = 'bird.png';
  
    const BIRD_PADDING = 16;      // keep away from window edges
    const CLOCK_MARGIN_BASE = 32; // base halo around the center stack
  
    // -----------------------------
    // Captions: multiple variants per mood
    // -----------------------------
    const CAPTIONS = {
        happy: [
            "Birdie is radiating joy... finally someone did their job",
            "Feathers fluffed and fabulous",
            "Birdie forgives all your past laziness",
            "Smiles? Achieved. Validation? Received.",
            "Oh look who remembered Birdie exists!",
            "Mission accomplished—Birb believes in you again"
        ],
    
        neutral: [
            "Birdie is... existing.",
            "No chaos, no thrill—just mild existence",
            "Steady wings, dead inside (just kidding... maybe)",
            "Today’s vibe: floating through consequences",
            "Birdie neither hates nor loves you right now",
            "Just here. Being bird-shaped."
        ],
        annoyed: [
            "Birdie is side-eyeing you from the perch",
            "Still waiting... totally fine... no resentment at all",
            "He’s starting to think you ghosted him",
            "Talons tapping, feathers ruffled, patience fading",
            "You promised you’d do it. Birdie remembers. ",
            "Birdie swears you’re doing this on purpose."
        ],
        pissed: [
            "Birdie is sure that you hate him",
            "Oh great. Another day of betrayal",
            "He’s rewriting his will and you’re not in it.",
            "ANGER LEVEL: cartoon steam noises",
            "Birdie’s feathers are literally on fire",
            "If Birdie had middle fingers, they’d be up right now."
        ]
    };
  
    // -----------------------------
    // Prompts
    // -----------------------------
    const PROMPTS = [
      'What made you smile today?',
      'Describe a small win you had today.',
      'What challenged you today, and how did you react?',
      'Name three things you are grateful for right now.',
      'What is one lesson you learned today?',
      'How did you take care of yourself today?',
      'What’s something you’re looking forward to tomorrow?',
      'Write about a kind act you noticed or did.',
      'What would have made today 1% better?',
      'Describe a moment of calm you experienced today.',
      'What is a thought you want to let go of?',
      'Who helped you today and how?',
      'If today had a headline, what would it be?',
      'What is one thing you created today?',
      'What surprised you today?'
    ];
  
    // -----------------------------
    // State
    // -----------------------------
    let deadlineMs = null;            // timestamp (ms) for upcoming midnight
    let streak = 0;                   // integer streak count
    let intervalId = null;            // countdown interval
    let usedPromptSet = new Set();    // cycling prompts
    let lastCompletionAt = null;      // timestamp (ms) of last completion
    let lastMood = null;              // track last mood to trigger swaps/reposition only on change
    let lastCaption = "";             // avoid immediate caption repeats
  
    // -----------------------------
    // Utilities (time)
    // -----------------------------
    function now() { return Date.now(); }
  
    function normalizedMidnight(dateLike) {
      const d = new Date(dateLike);
      d.setHours(24, 0, 0, 0);
      return d.getTime();
    }
  
    function startOfDay(dateLike) {
      const d = new Date(dateLike);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    }
  
    function isSameDay(tsA, tsB) {
      if (!tsA || !tsB) return false;
      const a = new Date(tsA);
      const b = new Date(tsB);
      return a.getFullYear() === b.getFullYear() &&
             a.getMonth() === b.getMonth() &&
             a.getDate() === b.getDate();
    }
  
    // -----------------------------
    // Storage
    // -----------------------------
    function readStorage() {
      const d = Number(localStorage.getItem(STORAGE_KEYS.deadline));
      deadlineMs = Number.isFinite(d) && d > 0 ? d : null;
  
      const s = Number(localStorage.getItem(STORAGE_KEYS.streak));
      streak = Number.isFinite(s) && s >= 0 ? s : 0;
  
      const lca = Number(localStorage.getItem(STORAGE_KEYS.lastCompletionAt));
      lastCompletionAt = Number.isFinite(lca) && lca > 0 ? lca : null;
  
      const used = localStorage.getItem(STORAGE_KEYS.usedPrompts);
      if (used) {
        try { usedPromptSet = new Set(JSON.parse(used)); }
        catch { usedPromptSet = new Set(); }
      }
    }
  
    function writeStorage() {
      try { localStorage.setItem(STORAGE_KEYS.deadline, String(deadlineMs)); } catch {}
      try { localStorage.setItem(STORAGE_KEYS.streak, String(streak)); } catch {}
      try { localStorage.setItem(STORAGE_KEYS.lastCompletionAt, lastCompletionAt ? String(lastCompletionAt) : ''); } catch {}
      try { localStorage.setItem(STORAGE_KEYS.usedPrompts, JSON.stringify(Array.from(usedPromptSet))); } catch {}
    }
  
    // Always pin deadlines to midnight (not rolling 24h windows)
    function ensureDeadline() {
      if (!deadlineMs) {
        // First run → count down to upcoming midnight
        deadlineMs = normalizedMidnight(new Date());
        writeStorage();
        return;
      }
      if (lastCompletionAt) {
        // Keep deadline at the midnight following the day of completion
        const expected = normalizedMidnight(new Date(lastCompletionAt));
        if (deadlineMs !== expected) {
          deadlineMs = expected;
          writeStorage();
        }
      }
    }
  
    // You can complete once per calendar day
    function canCompleteNow() {
      return !isSameDay(lastCompletionAt, now());
    }
  
    function formatTwo(n) { return n < 10 ? '0' + n : String(n); }
  
    function computeRemaining() {
      const diff = Math.max(0, deadlineMs - now());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      const progress = 1 - diff / DAY_MS; // 0 -> fresh day, 1 -> close to midnight
      return { diff, hours, minutes, seconds, progress };
    }
  
    // -----------------------------
    // Bird mood, image, movement, captions, and center-stack avoidance
    // -----------------------------
    function moodFromTime(diffMs, progress) {
      // Longer you wait → worse mood
      if (diffMs <= 5 * 60 * 1000) return 'pissed';
      if (progress < 0.33) return 'happy';
      if (progress < 0.66) return 'neutral';
      return 'annoyed';
    }
  
    // Preload mood images for instant swaps and warm the cache
    function preloadBirdImages() {
      const sources = [...Object.values(BIRD_IMAGES), BIRD_FALLBACK];
      sources.forEach((src) => {
        const img = new Image();
        // Best-effort preload; failures will be handled by runtime fallback
        img.src = src;
      });
    }
  
    function pickCaption(mood) {
      const list = CAPTIONS[mood] || CAPTIONS.happy || [""];
      if (list.length === 0) return "";
      let cap = list[Math.floor(Math.random() * list.length)];
      // avoid immediate repeat if possible
      if (list.length > 1) {
        let safety = 8;
        while (cap === lastCaption && safety--) {
          cap = list[Math.floor(Math.random() * list.length)];
        }
      }
      lastCaption = cap;
      return cap;
    }
  
    function setBirdMood(mood, forceNewCaption = false) {
      if (!birdFloat || !birdImg) return;
  
      birdFloat.classList.remove('mood-happy', 'mood-neutral', 'mood-annoyed', 'mood-pissed');
      birdFloat.classList.add('mood-' + mood);
  
      const desiredSrc = BIRD_IMAGES[mood] || BIRD_IMAGES.happy || BIRD_FALLBACK;
      if (birdImg.getAttribute('src') !== desiredSrc) {
        // Attach a one-shot error fallback to avoid broken icon
        birdImg.onerror = () => {
          birdImg.onerror = null; // prevent loops
          birdImg.setAttribute('src', BIRD_FALLBACK);
        };
        birdImg.setAttribute('src', desiredSrc);
      }
  
      // New caption: pick randomly when mood changes or when forced
      if (forceNewCaption || lastMood !== mood) {
        if (birdCaptionEl) birdCaptionEl.textContent = pickCaption(mood);
        // hop to new spot on mood change (fun)
        if (lastMood !== mood) positionBirdRandomly();
        lastMood = mood;
      }
    }
  
    function randInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
  
    function getBirdSize() {
      if (!birdImg) return { w: 200, h: 200 };
      const rect = birdImg.getBoundingClientRect();
      const w = rect.width || birdImg.naturalWidth || 200;
      const h = rect.height || birdImg.naturalHeight || 200;
      return { w, h };
    }
  
    // Overlap helpers
    function rectsOverlap(a, b) {
      return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }
    function makeRect(left, top, w, h) {
      return { left, top, right: left + w, bottom: top + h };
    }
    function unionRects(a, b) {
      return {
        left:   Math.min(a.left,   b.left),
        top:    Math.min(a.top,    b.top),
        right:  Math.max(a.right,  b.right),
        bottom: Math.max(a.bottom, b.bottom)
      };
    }
  
    // Build one exclusion rect that covers: caption + countdown + button
    function getCenterStackExclusionRect() {
      let rect = null;
      const add = (el) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (!rect) rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        else rect = unionRects(rect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom });
      };
  
      add(birdCaptionEl);
      add(countdownEl);
      add(promptBtn);
  
      if (!rect) return null;
  
      // Dynamic halo: base + part of the countdown font-size (e.g., 96px → + ~16px)
      let extra = CLOCK_MARGIN_BASE;
      if (countdownEl) {
        const cs = getComputedStyle(countdownEl);
        const fs = parseFloat(cs.fontSize) || 0; // 96 in your CSS
        extra += Math.max(12, Math.round(fs * 0.18));
      }
  
      return {
        left:   rect.left  - extra,
        top:    rect.top   - extra,
        right:  rect.right + extra,
        bottom: rect.bottom+ extra
      };
    }
  
    function positionBirdRandomly() {
      if (!birdFloat || !birdImg) return;
  
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const { w, h } = getBirdSize();
  
      const minLeft = BIRD_PADDING;
      const minTop  = BIRD_PADDING;
      const maxLeft = Math.max(minLeft, vw - w - BIRD_PADDING);
      const maxTop  = Math.max(minTop,  vh - h - BIRD_PADDING);
  
      const exclusion = getCenterStackExclusionRect();
  
      // Try random spots that don't overlap the exclusion
      const tries = 60;
      for (let i = 0; i < tries; i++) {
        const left = randInt(minLeft, maxLeft);
        const top  = randInt(minTop,  maxTop);
  
        const birdRect = makeRect(left, top, w, h);
        const overlaps = exclusion ? rectsOverlap(birdRect, exclusion) : false;
        if (!overlaps) {
          birdFloat.style.left = left + 'px';
          birdFloat.style.top  = top  + 'px';
          return;
        }
      }
  
      // Fallback: place above or below the exclusion, whichever space is bigger
      const c = exclusion || { top: vh/2, bottom: vh/2, left: vw/2, right: vw/2 };
  
      const spaceAbove = Math.max(0, c.top - BIRD_PADDING - h);
      const spaceBelow = Math.max(0, vh - (c.bottom + BIRD_PADDING) - h);
      const placeAbove = spaceAbove >= spaceBelow;
  
      const top = placeAbove
        ? Math.max(BIRD_PADDING, c.top - h - BIRD_PADDING)
        : Math.min(vh - h - BIRD_PADDING, c.bottom + BIRD_PADDING);
  
      // Choose horizontal slot not overlapping the exclusion
      let left;
      const leftMax  = Math.max(BIRD_PADDING, c.left - BIRD_PADDING - w);
      const rightMin = Math.max(BIRD_PADDING, c.right + BIRD_PADDING);
      const rightMax = Math.max(rightMin, vw - w - BIRD_PADDING);
  
      const leftRoom  = Math.max(0, leftMax - BIRD_PADDING);
      const rightRoom = Math.max(0, rightMax - rightMin);
  
      if (leftRoom > rightRoom) left = randInt(BIRD_PADDING, leftMax);
      else left = randInt(rightMin, rightMax);
  
      birdFloat.style.left = left + 'px';
      birdFloat.style.top  = top  + 'px';
    }
  
    // -----------------------------
    // UI + rollover
    // -----------------------------
    function renderFlipdown(hours, minutes, seconds) {
      const parts = [
        { label: 'HOURS', value: formatTwo(hours) },
        { label: 'MINUTES', value: formatTwo(minutes) },
        { label: 'SECONDS', value: formatTwo(seconds) }
      ];
      const html = parts.map(p => `
        <div class="digit">
          <div class="tile"><div class="value">${p.value}</div></div>
          <div class="label">${p.label}</div>
        </div>
      `).join('<div class="colon">:</div>');
      countdownEl.innerHTML = html;
    }
  
    function handleMidnightRollover() {
      const nowTs = now();
      const todayStart = startOfDay(nowTs);
      const yesterdayStart = todayStart - DAY_MS;
  
      // If lastCompletionAt is missing or too old, missed yesterday → reset streak
      if (!lastCompletionAt || lastCompletionAt < todayStart - 1) {
        if (lastCompletionAt < yesterdayStart) {
          streak = 0;
        }
      }
  
      // New deadline = tonight's midnight
      deadlineMs = normalizedMidnight(new Date(nowTs));
      writeStorage();
      updateStreakUI();
  
      // New day: allow prompts again
      if (promptBtn) {
        promptBtn.disabled = false;
        promptBtn.classList.remove('hidden');
        promptBtn.textContent = 'Get Prompt';
      }
      if (doneBadge) doneBadge.classList.add('hidden');
  
      // Fresh day → randomize position too (respecting exclusion)
      positionBirdRandomly();
  
      // Reset lastMood so the first mood set today can hop and pick a fresh caption
      lastMood = null;
    }
  
    function tick() {
      const { diff, hours, minutes, seconds, progress } = computeRemaining();
      renderFlipdown(hours, minutes, seconds);
  
      const hasCompletedToday = isSameDay(lastCompletionAt, now());
  
      if (diff > 0) {
        if (hasCompletedToday) {
          // Force happy mood after completion until midnight; force new caption once per tick? No—only once needed.
          setBirdMood('happy'); // caption already forced at completion
          if (promptBtn) {
            promptBtn.disabled = true;
            promptBtn.textContent = 'Done for the day!';
          }
          if (doneBadge) doneBadge.classList.remove('hidden');
        } else {
          // Not completed yet → mood based on time remaining
          const mood = moodFromTime(diff, progress);
          setBirdMood(mood); // random caption when mood changes
          if (promptBtn) {
            promptBtn.disabled = false;
            promptBtn.textContent = 'Get Prompt';
          }
          if (doneBadge) doneBadge.classList.add('hidden');
        }
      } else {
        handleMidnightRollover();
      }
    }
  
    function startInterval() {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(tick, 1000);
      tick(); // immediate paint
    }
  
    // -----------------------------
    // Journal / prompts
    // -----------------------------
    function getRandomPrompt() {
      const available = PROMPTS.filter(p => !usedPromptSet.has(p));
      if (available.length === 0) {
        usedPromptSet.clear();
        writeStorage();
        return getRandomPrompt();
      }
      const idx = Math.floor(Math.random() * available.length);
      const prompt = available[idx];
      usedPromptSet.add(prompt);
      writeStorage();
      return prompt;
    }
  
    function openOverlay(withNewPrompt = true) {
      if (withNewPrompt) {
        if (journalPromptEl) journalPromptEl.textContent = getRandomPrompt();
        if (journalInput) journalInput.value = '';
      }
      overlay.classList.remove('hidden');
      if (doneBtn) {
        doneBtn.disabled = false;
        doneBtn.textContent = 'Close';
      }
    }
  
    function closeOverlay() {
      overlay.classList.add('hidden');
    }
  
    function celebrateAndReset() {
      // Visual hook (optional)
      if (birdFloat) {
        birdFloat.classList.add('is-flying');
        setTimeout(() => birdFloat && birdFloat.classList.remove('is-flying'), 3400);
      }
  
      // Update streak & deadlines
      streak += 1;
      lastCompletionAt = now();
      deadlineMs = normalizedMidnight(new Date()); // lock to tonight's midnight
      writeStorage();
      updateStreakUI();
  
      // Force happy mood immediately on completion WITH a fresh happy caption
      setBirdMood('happy', true);
  
      // Lock UI until midnight
      if (promptBtn) {
        promptBtn.disabled = true;
        promptBtn.textContent = 'Done for the day!';
      }
      if (doneBadge) doneBadge.classList.remove('hidden');
  
      // Keep countdown running to midnight
      startInterval();
    }
  
    function updateStreakUI() {
      if (streakEl) streakEl.textContent = `Streak: ${streak}`;
    }
  
    function handlePromptButton() {
      if (overlay.classList.contains('hidden')) {
        // Opening journal
        openOverlay(true);
        if (promptBtn) promptBtn.textContent = 'Done for the day!';
      } else {
        // Treat as done (if not already completed today)
        if (!canCompleteNow()) return;
        celebrateAndReset();
        closeOverlay();
      }
    }
  
    // -----------------------------
    // Events
    // -----------------------------
    if (promptBtn) promptBtn.addEventListener('click', handlePromptButton);
  
    if (doneBtn) doneBtn.addEventListener('click', () => {
      if (canCompleteNow()) {
        celebrateAndReset();
      }
      closeOverlay();
    });
  
    if (anotherPromptBtn) {
      anotherPromptBtn.addEventListener('click', () => {
        if (journalPromptEl) journalPromptEl.textContent = getRandomPrompt();
      });
    }
  
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
  
    // Reposition on resize so bird stays on-screen (and away from center stack)
    window.addEventListener('resize', () => {
      positionBirdRandomly();
    });
  
    // If image loads late (first paint), position once it knows size
    if (birdImg && !birdImg.complete) {
      birdImg.addEventListener('load', () => {
        positionBirdRandomly();
      });
    }
  
    // -----------------------------
    // Init
    // -----------------------------
    function init() {
      readStorage();
      ensureDeadline();
      updateStreakUI();
      preloadBirdImages();
      // Ensure we start with a safe image src to avoid broken icon on first paint
      if (birdImg && !birdImg.getAttribute('src')) {
        birdImg.setAttribute('src', BIRD_FALLBACK);
      }
      startInterval();
      positionBirdRandomly(); // random spot on first load, avoids center stack
    }
  
    init();
})();
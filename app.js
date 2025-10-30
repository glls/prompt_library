/* Prompt Library - localStorage-based (clean) */
(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary.v1";
  const RATING_MAX = 5;
  const form = document.getElementById("prompt-form");
  const listEl = document.getElementById("prompt-list");
  const countEl = document.getElementById("count");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");
  const modelInput = document.getElementById("model");
  const isCodeInput = document.getElementById("is-code");
  const formError = document.getElementById("form-error");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const importFileInput = document.getElementById("import-file");
  const importModeSelect = document.getElementById("import-mode");

  // Utils
  function safeParse(json, fallback) { try { return JSON.parse(json); } catch { return fallback; } }
  function getPrompts() { return safeParse(localStorage.getItem(STORAGE_KEY), []) || []; }
  function setPrompts(items) { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); }
  function makeId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
  function escapeHtml(str) { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }
  function makePreview(text, words = 12) {
    const tokens = String(text || "").trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return "";
    const snip = tokens.slice(0, words).join(" ");
    return tokens.length > words ? snip + "…" : snip;
  }

  // Validation helpers
  function isValidIso8601(str) {
    if (typeof str !== 'string') return false;
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    if (!isoRegex.test(str)) return false;
    try { return new Date(str).toISOString() === str; } catch { return false; }
  }
  function requireNonEmptyString(value, label, maxLen) {
    if (typeof value !== 'string') throw new Error(`${label} must be a string`);
    const v = value.trim();
    if (!v) throw new Error(`${label} cannot be empty`);
    if (maxLen && v.length > maxLen) throw new Error(`${label} must be at most ${maxLen} characters`);
    return v;
  }
  function humanDate(iso) {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  }

  // Token estimator
  function estimateTokens(text, isCode) {
    const s = String(text || "");
    const words = s.trim() ? s.trim().split(/\s+/).filter(Boolean).length : 0;
    const chars = s.length;
    let min = 0.75 * words;
    let max = 0.25 * chars;
    if (isCode) { min *= 1.3; max *= 1.3; }
    min = Math.max(0, Math.round(min));
    max = Math.max(min, Math.round(max));
    const ref = max; // classify by conservative bound
    const confidence = ref < 1000 ? 'high' : (ref <= 5000 ? 'medium' : 'low');
    return { min, max, confidence };
  }

  // Heuristic code detector (fallback if checkbox not provided)
  function looksLikeCode(text) {
    const t = String(text || "");
    // simple signals: backticks, braces, semicolons with many lines, keywords
    const signals = [/```/, /\{\s*\}/, /;\s*\n/, /function\b|const\b|let\b|var\b/, /class\b|def\b|=>/];
    return signals.some(r => r.test(t));
  }

  // Metadata system
  function trackModel(modelName, content) {
    const model = requireNonEmptyString(modelName, 'Model name', 100);
    const createdAt = new Date().toISOString();
    const updatedAt = createdAt;
    const isCode = isCodeInput ? !!isCodeInput.checked : looksLikeCode(content);
    const tokenEstimate = estimateTokens(String(content || ''), isCode);
    return { model, createdAt, updatedAt, tokenEstimate };
  }

  function updateTimestamps(metadata) {
    if (!metadata || typeof metadata !== 'object') throw new Error('metadata must be an object');
    const created = metadata.createdAt;
    if (!isValidIso8601(created)) throw new Error('createdAt must be a valid ISO 8601 string');
    const updatedAt = new Date().toISOString();
    if (new Date(updatedAt) < new Date(created)) throw new Error('updatedAt cannot be earlier than createdAt');
    return { ...metadata, updatedAt };
  }

  // Data ops
  function addPrompt(title, content, modelName) {
    const metadata = trackModel(modelName, content);
    const next = [{ id: makeId(), title: String(title || "").trim(), content: String(content || "").trim(), rating: 0, notes: [], metadata }, ...getPrompts()];
    setPrompts(next);
  }
  function deletePrompt(id) { setPrompts(getPrompts().filter(p => p.id !== id)); }

  function touchPromptMetadata(promptId) {
    const items = getPrompts();
    const idx = items.findIndex(x => x.id === promptId);
    if (idx === -1) return;
    try {
      const m = items[idx].metadata;
      if (m) {
        items[idx].metadata = updateTimestamps(m);
        setPrompts(items);
      }
    } catch (err) {
      console.error('Failed to update metadata timestamps:', err);
    }
  }

  // Rating
  function setRating(promptId, value) {
    const items = getPrompts();
    const idx = items.findIndex(x => x.id === promptId);
    if (idx === -1) return;
    items[idx].rating = clamp(Number(value) || 0, 0, RATING_MAX);
    try { setPrompts(items); touchPromptMetadata(promptId); } catch (err) { console.error('Failed saving rating:', err); }
    renderPrompts();
  }
  function clearRating(promptId) { setRating(promptId, 0); }
  function buildRatingEl(prompt) {
    const group = document.createElement("div");
    group.className = "rating";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "Rate prompt effectiveness");
    group.dataset.promptId = prompt.id;
    const current = Number(prompt.rating) || 0;
    const focusIndex = current > 0 ? current : 1;
    for (let i = 1; i <= RATING_MAX; i++) {
      const star = document.createElement("button");
      star.type = "button";
      star.className = "star" + (i <= current ? " filled" : "");
      star.dataset.value = String(i);
      star.setAttribute("role", "radio");
      star.setAttribute("aria-checked", String(i === current));
      star.setAttribute("aria-label", `${i} ${i === 1 ? "star" : "stars"}`);
      star.tabIndex = i === focusIndex ? 0 : -1;
      star.textContent = "★";
      group.appendChild(star);
    }
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "clear-rating";
    clearBtn.setAttribute("aria-label", "Clear rating");
    clearBtn.textContent = "Clear";
    clearBtn.dataset.role = "clear-rating";
    group.appendChild(clearBtn);
    return group;
  }
  function previewStars(group, value) {
    const v = clamp(Number(value) || 0, 0, RATING_MAX);
    group.querySelectorAll('.star').forEach((s) => {
      const sv = Number(s.dataset.value) || 0;
      s.classList.toggle('previewed', sv <= v);
    });
  }

  // Notes
  function ensureNotesArray(p) { if (!Array.isArray(p.notes)) p.notes = []; return p.notes; }
  function addNote(promptId, content) {
    const items = getPrompts();
    const idx = items.findIndex(p => p.id === promptId);
    if (idx === -1) return;
    const note = { id: makeId(), content: String(content).trim(), createdAt: Date.now(), updatedAt: Date.now() };
    const notes = ensureNotesArray(items[idx]);
    notes.unshift(note);
    try { setPrompts(items); touchPromptMetadata(promptId); renderPrompts(); } catch (err) { notes.shift(); throw err; }
  }
  function updateNote(promptId, noteId, content) {
    const items = getPrompts();
    const p = items.find(x => x.id === promptId); if (!p) return;
    const notes = ensureNotesArray(p);
    const n = notes.find(x => x.id === noteId); if (!n) return;
    const prev = { ...n };
    n.content = String(content).trim();
    n.updatedAt = Date.now();
    try { setPrompts(items); touchPromptMetadata(promptId); renderPrompts(); } catch (err) { Object.assign(n, prev); throw err; }
  }
  function deleteNote(promptId, noteId) {
    const items = getPrompts();
    const p = items.find(x => x.id === promptId); if (!p) return;
    const notes = ensureNotesArray(p);
    const idx = notes.findIndex(x => x.id === noteId); if (idx === -1) return;
    const removed = notes.splice(idx, 1);
    try { setPrompts(items); touchPromptMetadata(promptId); renderPrompts(); } catch (err) { notes.splice(idx, 0, ...removed); throw err; }
  }
  function showNotesError(notesWrap, message) {
    let err = notesWrap.querySelector('.notes-error');
    if (!err) { err = document.createElement('div'); err.className = 'notes-error'; notesWrap.appendChild(err); }
    err.textContent = message; err.hidden = false; setTimeout(() => { if (err) err.hidden = true; }, 2500);
  }
  function buildNotesEl(prompt) {
    const wrap = document.createElement('section');
    wrap.className = 'notes';
    wrap.dataset.promptId = prompt.id;
    const title = document.createElement('h4'); title.className = 'notes-title'; title.textContent = 'Notes';
    const list = document.createElement('div'); list.className = 'notes-list';
    const notes = Array.isArray(prompt.notes) ? [...prompt.notes] : []; notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (notes.length === 0) {
      const empty = document.createElement('div'); empty.className = 'notes-empty muted'; empty.textContent = 'No notes yet.'; list.appendChild(empty);
    } else {
      for (const n of notes) {
        const item = document.createElement('div'); item.className = 'note-item'; item.dataset.noteId = n.id;
        const text = document.createElement('div'); text.className = 'note-text'; text.textContent = n.content;
        const actions = document.createElement('div'); actions.className = 'notes-actions';
        const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'icon-btn note-edit'; edit.setAttribute('aria-label', 'Edit note'); edit.textContent = 'Edit';
        const del = document.createElement('button'); del.type = 'button'; del.className = 'icon-btn danger note-delete'; del.setAttribute('aria-label', 'Delete note'); del.textContent = 'Delete';
        actions.append(edit, del); item.append(text, actions); list.appendChild(item);
      }
    }
    const form = document.createElement('div'); form.className = 'notes-form';
    const label = document.createElement('label'); label.className = 'notes-label'; label.textContent = 'Add note'; label.setAttribute('for', `note-${prompt.id}`);
    const ta = document.createElement('textarea'); ta.className = 'note-input'; ta.id = `note-${prompt.id}`; ta.setAttribute('rows', '3'); ta.setAttribute('placeholder', 'Write a quick note…'); ta.setAttribute('aria-label', 'Add note');
    const saveBtn = document.createElement('button'); saveBtn.type = 'button'; saveBtn.className = 'btn primary note-add'; saveBtn.setAttribute('data-role', 'note-add'); saveBtn.textContent = 'Save note';
    form.append(label, ta, saveBtn);
    wrap.append(title, list, form);
    return wrap;
  }

  // Render
  function buildMetadataEl(metadata) {
    const section = document.createElement('section');
    section.className = 'metadata';
    if (!metadata || typeof metadata !== 'object') {
      const row = document.createElement('div'); row.className = 'metadata-row';
      const label = document.createElement('span'); label.className = 'metadata-label'; label.textContent = 'Metadata:';
      const val = document.createElement('span'); val.textContent = 'N/A'; val.className = 'muted';
      row.append(label, val); section.appendChild(row); return section;
    }
    const modelRow = document.createElement('div'); modelRow.className = 'metadata-row';
    const modelLabel = document.createElement('span'); modelLabel.className = 'metadata-label'; modelLabel.textContent = 'Model:';
    const modelVal = document.createElement('span'); modelVal.className = 'badge'; modelVal.textContent = metadata.model;
    modelRow.append(modelLabel, modelVal);

    const timeRow = document.createElement('div'); timeRow.className = 'metadata-row metadata-times';
    const created = document.createElement('span'); created.textContent = `Created: ${humanDate(metadata.createdAt)}`;
    const updated = document.createElement('span'); updated.textContent = `Updated: ${humanDate(metadata.updatedAt)}`;
    timeRow.append(created, updated);

    const tokensRow = document.createElement('div'); tokensRow.className = 'metadata-row metadata-tokens';
    const tokensLabel = document.createElement('span'); tokensLabel.className = 'metadata-label'; tokensLabel.textContent = 'Tokens:';
    const range = document.createElement('span'); range.textContent = `${metadata.tokenEstimate?.min ?? 0}–${metadata.tokenEstimate?.max ?? 0}`;
    const conf = document.createElement('span');
    const c = metadata.tokenEstimate?.confidence || 'low';
    conf.className = `badge conf-${c}`;
    conf.textContent = c.charAt(0).toUpperCase() + c.slice(1);
    tokensRow.append(tokensLabel, range, conf);

    section.append(modelRow, timeRow, tokensRow);
    return section;
  }

  function renderPrompts() {
    // migrate any legacy items to ensure metadata exists and sort by metadata.createdAt desc
    const items = getPrompts();
    let changed = false;
    for (const p of items) {
      if (!p.metadata) {
        try { p.metadata = trackModel('Unknown', p.content); changed = true; } catch { /* ignore */ }
      }
    }
    if (changed) { try { setPrompts(items); } catch { /* ignore */ } }
    items.sort((a, b) => {
      const aDate = (a.metadata && isValidIso8601(a.metadata.createdAt)) ? new Date(a.metadata.createdAt).getTime() : (a.createdAt || 0);
      const bDate = (b.metadata && isValidIso8601(b.metadata.createdAt)) ? new Date(b.metadata.createdAt).getTime() : (b.createdAt || 0);
      return bDate - aDate;
    });
    listEl.innerHTML = "";
    countEl.textContent = items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "No prompts yet";
    if (!items.length) {
      const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "No saved prompts yet."; listEl.appendChild(empty); return;
    }
    for (const p of items) {
      const card = document.createElement("article"); card.className = "card prompt-card";
      const header = document.createElement("div"); header.className = "prompt-card-header";
      const h3 = document.createElement("h3"); h3.textContent = p.title || "(Untitled)";
      const btnWrap = document.createElement('div'); btnWrap.style.display = 'flex'; btnWrap.style.gap = '0.35rem';
      const editBtn = document.createElement("button"); editBtn.className = "icon-btn"; editBtn.type = "button"; editBtn.setAttribute("aria-label", "Edit prompt"); editBtn.textContent = "Edit"; editBtn.dataset.role = 'prompt-edit'; editBtn.dataset.promptId = p.id;
      const del = document.createElement("button"); del.className = "icon-btn danger"; del.type = "button"; del.setAttribute("aria-label", "Delete prompt"); del.textContent = "Delete"; del.addEventListener("click", () => { deletePrompt(p.id); renderPrompts(); });
      btnWrap.append(editBtn, del);
      header.append(h3, btnWrap);
      const preview = document.createElement("p"); preview.className = "preview"; preview.textContent = makePreview(p.content);
      const ratingEl = buildRatingEl(p);
      const notesEl = buildNotesEl(p);
      const metadataEl = buildMetadataEl(p.metadata);
      card.append(header, preview, metadataEl, ratingEl, notesEl);
      listEl.appendChild(card);
    }
  }

  // Form
  function onSubmit(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    const model = modelInput?.value?.trim() || '';
    formError.textContent = '';
    try {
      if (!title || !content) { form.reportValidity(); return; }
      requireNonEmptyString(model, 'Model name', 100);
      addPrompt(title, content, model);
      form.reset(); titleInput.focus(); renderPrompts();
    } catch (err) {
      formError.textContent = err?.message || 'Failed to save prompt.';
    }
  }

  // Events
  document.addEventListener("DOMContentLoaded", () => {
    form.addEventListener("submit", onSubmit);
    // Export
    exportBtn?.addEventListener('click', () => {
      try { exportAppData(); } catch (err) { alert((err && err.message) || 'Export failed.'); }
    });
    // Import
    importBtn?.addEventListener('click', () => { importFileInput?.click(); });
    importFileInput?.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const mode = importModeSelect?.value === 'replace' ? 'replace' : 'merge';
      handleImportFile(file, mode).finally(() => { importFileInput.value = ''; });
    });
    // Clicks
    listEl.addEventListener('click', (e) => {
      // Prompt edit: enter edit mode
      const editPromptBtn = e.target.closest('[data-role="prompt-edit"]');
      if (editPromptBtn && listEl.contains(editPromptBtn)) {
        const card = editPromptBtn.closest('.prompt-card'); if (!card) return;
        const id = editPromptBtn.dataset.promptId;
        if (card.classList.contains('editing')) return;
        const items = getPrompts();
        const p = items.find(x => x.id === id); if (!p) return;
        enterEditMode(card, p);
        return;
      }
      const star = e.target.closest('.star');
      if (star && listEl.contains(star)) { const group = star.closest('.rating'); if (!group) return; const promptId = group.dataset.promptId; const value = star.dataset.value; setRating(promptId, value); return; }
      const clearBtn = e.target.closest('[data-role="clear-rating"], .clear-rating');
      if (clearBtn && listEl.contains(clearBtn)) { const group = clearBtn.closest('.rating'); if (!group) return; const promptId = group.dataset.promptId; clearRating(promptId); return; }
      const addBtn = e.target.closest('[data-role="note-add"], .note-add');
      if (addBtn && listEl.contains(addBtn)) { const notesWrap = addBtn.closest('.notes'); if (!notesWrap) return; const promptId = notesWrap.dataset.promptId; const textarea = notesWrap.querySelector('.note-input'); const content = (textarea?.value || "").trim(); if (!content) return; try { addNote(promptId, content); } catch { showNotesError(notesWrap, 'Failed to save note. Storage may be full.'); } return; }
      const editBtn = e.target.closest('[data-role="note-edit"], .note-edit');
      if (editBtn && listEl.contains(editBtn)) { const item = editBtn.closest('.note-item'); const notesWrap = editBtn.closest('.notes'); if (!item || !notesWrap) return; const text = item.querySelector('.note-text')?.textContent || ''; item.classList.add('editing'); item.innerHTML = `\n          <textarea class=\"note-edit\" aria-label=\"Edit note\" rows=\"3\">${escapeHtml(text)}</textarea>\n          <div class=\"notes-actions\">\n            <button type=\"button\" class=\"btn primary note-save\" data-role=\"note-save\">Save</button>\n            <button type=\"button\" class=\"btn note-cancel\" data-role=\"note-cancel\">Cancel</button>\n          </div>\n        `; item.querySelector('.note-edit')?.focus(); return; }
      const saveBtn = e.target.closest('[data-role="note-save"], .note-save');
      if (saveBtn && listEl.contains(saveBtn)) { const item = saveBtn.closest('.note-item'); const notesWrap = saveBtn.closest('.notes'); if (!item || !notesWrap) return; const promptId = notesWrap.dataset.promptId; const noteId = item.dataset.noteId; const content = item.querySelector('.note-edit')?.value.trim() || ''; if (!content) { renderPrompts(); return; } try { updateNote(promptId, noteId, content); } catch { showNotesError(notesWrap, 'Failed to save changes.'); } return; }
      const cancelBtn = e.target.closest('[data-role="note-cancel"], .note-cancel');
      if (cancelBtn && listEl.contains(cancelBtn)) { renderPrompts(); return; }
      const delNoteBtn = e.target.closest('[data-role="note-delete"], .note-delete');
      if (delNoteBtn && listEl.contains(delNoteBtn)) { const item = delNoteBtn.closest('.note-item'); const notesWrap = delNoteBtn.closest('.notes'); if (!item || !notesWrap) return; const promptId = notesWrap.dataset.promptId; const noteId = item.dataset.noteId; if (confirm('Delete this note?')) { try { deleteNote(promptId, noteId); } catch { showNotesError(notesWrap, 'Failed to delete note.'); } } }

      // Prompt edit: save/cancel
      const savePromptBtn = e.target.closest('[data-role="prompt-save"]');
      if (savePromptBtn && listEl.contains(savePromptBtn)) {
        const editWrap = savePromptBtn.closest('.prompt-edit'); if (!editWrap) return;
        const card = savePromptBtn.closest('.prompt-card'); if (!card) return;
        const id = editWrap.dataset.promptId;
        const title = editWrap.querySelector('#edit-title')?.value?.trim() || '';
        const model = editWrap.querySelector('#edit-model')?.value?.trim() || '';
        const content = editWrap.querySelector('#edit-content')?.value?.trim() || '';
        const isCode = !!editWrap.querySelector('#edit-is-code')?.checked;
        const errEl = editWrap.querySelector('.prompt-error');
        if (errEl) { errEl.hidden = true; errEl.textContent = ''; }
        try {
          if (!title || !content) { throw new Error('Title and Content are required'); }
          requireNonEmptyString(model, 'Model name', 100);
          updatePrompt(id, { title, content, model, isCode });
          renderPrompts();
        } catch (err) {
          if (errEl) { errEl.textContent = err?.message || 'Failed to save changes.'; errEl.hidden = false; }
        }
        return;
      }
      const cancelPromptBtn = e.target.closest('[data-role="prompt-cancel"]');
      if (cancelPromptBtn && listEl.contains(cancelPromptBtn)) {
        const card = cancelPromptBtn.closest('.prompt-card'); if (!card) return;
        exitEditMode(card);
        return;
      }
    });
    // Hover preview for rating
    listEl.addEventListener('mouseover', (e) => { const star = e.target.closest('.star'); if (!star || !listEl.contains(star)) return; const group = star.closest('.rating'); if (!group) return; previewStars(group, star.dataset.value); });
    listEl.addEventListener('mouseout', (e) => { const star = e.target.closest('.star'); if (!star || !listEl.contains(star)) return; const group = star.closest('.rating'); if (!group) return; previewStars(group, 0); });
    // Keyboard for rating
    listEl.addEventListener('keydown', (e) => {
      const star = e.target.closest('.star'); if (!star || !listEl.contains(star)) return;
      const group = star.closest('.rating'); if (!group) return; const promptId = group.dataset.promptId; const value = Number(star.dataset.value) || 1;
      if (e.key === 'ArrowRight') { e.preventDefault(); const next = clamp(value + 1, 1, RATING_MAX); group.querySelector(`.star[data-value="${next}"]`)?.focus(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); const prev = clamp(value - 1, 1, RATING_MAX); group.querySelector(`.star[data-value="${prev}"]`)?.focus(); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setRating(promptId, value); }
    });
    // Keyboard for notes (Ctrl/Cmd + Enter)
    listEl.addEventListener('keydown', (e) => {
      const addTa = e.target.closest('.note-input');
      if (addTa && listEl.contains(addTa) && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const notesWrap = addTa.closest('.notes'); if (!notesWrap) return; const promptId = notesWrap.dataset.promptId; const content = addTa.value.trim(); if (!content) return; try { addNote(promptId, content); } catch { showNotesError(notesWrap, 'Failed to save note.'); } }
      const editTa = e.target.closest('.note-edit');
      if (editTa && listEl.contains(editTa) && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { const item = editTa.closest('.note-item'); const notesWrap = editTa.closest('.notes'); if (!item || !notesWrap) return; const promptId = notesWrap.dataset.promptId; const noteId = item.dataset.noteId; const content = editTa.value.trim(); if (!content) return; try { updateNote(promptId, noteId, content); } catch { showNotesError(notesWrap, 'Failed to save changes.'); } }
    });

    renderPrompts();
  });
  // ===== Export / Import System =====
  const EXPORT_VERSION = 1;

  function computeStats(items) {
    const totalPrompts = items.length;
    const avg = totalPrompts ? (items.reduce((s, p) => s + (Number(p.rating) || 0), 0) / totalPrompts) : 0;
    const averageRating = Math.round(avg * 100) / 100;
    const counts = new Map();
    for (const p of items) {
      const m = (p.metadata && p.metadata.model) ? String(p.metadata.model) : 'Unknown';
      counts.set(m, (counts.get(m) || 0) + 1);
    }
    let mostUsedModel = 'Unknown'; let best = -1;
    for (const [m, c] of counts.entries()) { if (c > best) { best = c; mostUsedModel = m; } }
    return { totalPrompts, averageRating, mostUsedModel };
  }

  function validateMetadata(meta) {
    if (!meta || typeof meta !== 'object') throw new Error('Invalid metadata');
    requireNonEmptyString(meta.model, 'Model name', 100);
    if (!isValidIso8601(meta.createdAt)) throw new Error('Invalid metadata.createdAt');
    if (!isValidIso8601(meta.updatedAt)) throw new Error('Invalid metadata.updatedAt');
    const te = meta.tokenEstimate;
    if (!te || typeof te !== 'object') throw new Error('Invalid tokenEstimate');
    if (!Number.isFinite(te.min) || te.min < 0) throw new Error('Invalid tokenEstimate.min');
    if (!Number.isFinite(te.max) || te.max < te.min) throw new Error('Invalid tokenEstimate.max');
    if (!['high','medium','low'].includes(te.confidence)) throw new Error('Invalid tokenEstimate.confidence');
    // temporal order
    if (new Date(meta.updatedAt) < new Date(meta.createdAt)) throw new Error('updatedAt earlier than createdAt');
  }

  function validatePrompt(p) {
    if (!p || typeof p !== 'object') throw new Error('Invalid prompt object');
    requireNonEmptyString(p.id, 'Prompt id');
    requireNonEmptyString(p.title ?? '', 'Title', 120);
    requireNonEmptyString(p.content ?? '', 'Content');
    const r = Number(p.rating); if (!Number.isFinite(r) || r < 0 || r > RATING_MAX) throw new Error('Invalid rating');
    if (p.notes && !Array.isArray(p.notes)) throw new Error('Invalid notes');
    if (Array.isArray(p.notes)) {
      for (const n of p.notes) {
        requireNonEmptyString(n.id, 'Note id');
        requireNonEmptyString(n.content ?? '', 'Note content');
        if (!Number.isFinite(n.createdAt) || !Number.isFinite(n.updatedAt)) throw new Error('Invalid note timestamps');
      }
    }
    validateMetadata(p.metadata);
  }

  function normalizeItemsForExport(items) {
    // Ensure every prompt has metadata
    const out = items.map((p) => {
      if (!p.metadata) {
        try { p = { ...p, metadata: trackModel('Unknown', p.content) }; } catch { /* ignore */ }
      }
      return p;
    });
    return out;
  }

  function exportAppData() {
    const items = normalizeItemsForExport(getPrompts());
    // Validate before exporting
    for (const p of items) validatePrompt(p);
    const payload = {
      version: EXPORT_VERSION,
      exportTimestamp: new Date().toISOString(),
      stats: computeStats(items),
      prompts: items
    };
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, ''); // YYYYMMDDTHHMMSSZ
    a.href = url;
    a.download = `prompt-library-export-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  function handleImportFile(file, mode) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => { alert('Failed to read file.'); resolve(); };
      reader.onload = () => {
        try {
          const text = String(reader.result || '');
          const data = JSON.parse(text);
          importAppData(data, mode);
          renderPrompts();
          alert('Import completed successfully.');
        } catch (err) {
          console.error(err);
          alert((err && err.message) || 'Import failed.');
        } finally {
          resolve();
        }
      };
      reader.readAsText(file);
    });
  }

  function dedupeMerge(existing, incoming, overwrite) {
    const byId = new Map();
    for (const p of existing) byId.set(p.id, p);
    for (const ip of incoming) {
      if (byId.has(ip.id)) {
        if (overwrite) byId.set(ip.id, ip);
      } else {
        byId.set(ip.id, ip);
      }
    }
    return Array.from(byId.values());
  }

  function importAppData(data, mode) {
    if (!data || typeof data !== 'object') throw new Error('Invalid import file');
    const version = Number(data.version);
    if (!Number.isFinite(version) || version !== EXPORT_VERSION) throw new Error(`Unsupported version: ${data.version}`);
    if (!Array.isArray(data.prompts)) throw new Error('Missing prompts array');
    // Validate incoming prompts
    for (const p of data.prompts) validatePrompt(p);
    // Check duplicates
    const existing = getPrompts();
    const existingIds = new Set(existing.map(p => p.id));
    const incomingIds = new Set(data.prompts.map(p => p.id));
    const duplicateIds = [...incomingIds].filter(id => existingIds.has(id));

    // Backup before any write
    const backupKey = `${STORAGE_KEY}.backup.${Date.now()}`;
    localStorage.setItem(backupKey, JSON.stringify(existing));

    try {
      let finalItems;
      if (mode === 'replace') {
        finalItems = data.prompts;
      } else {
        let overwrite = false;
        if (duplicateIds.length) {
          overwrite = confirm(`Found ${duplicateIds.length} duplicate id(s).\nOK: Overwrite from import\nCancel: Keep existing`);
        }
        finalItems = dedupeMerge(existing, data.prompts, overwrite);
      }
      // Final save
      setPrompts(finalItems);
    } catch (err) {
      // Rollback
      console.error('Import failed, rolling back:', err);
      try { localStorage.setItem(STORAGE_KEY, localStorage.getItem(backupKey) || '[]'); } catch {}
      throw err;
    }
  }
  // Edit mode helpers and updater
  function enterEditMode(card, prompt) {
    card.classList.add('editing');
    // Hide existing sections except header
    card.querySelectorAll('.preview, .metadata, .rating, .notes').forEach(el => { el.hidden = true; });
    const edit = document.createElement('section');
    edit.className = 'prompt-edit';
    edit.dataset.promptId = prompt.id;
    const err = document.createElement('div'); err.className = 'prompt-error'; err.setAttribute('role', 'alert'); err.hidden = true;
    const f1 = document.createElement('div'); f1.className = 'field';
    const l1 = document.createElement('label'); l1.setAttribute('for', 'edit-title'); l1.textContent = 'Title';
    const i1 = document.createElement('input'); i1.id = 'edit-title'; i1.type = 'text'; i1.maxLength = 120; i1.value = prompt.title || '';
    f1.append(l1, i1);
    const f2 = document.createElement('div'); f2.className = 'field';
    const l2 = document.createElement('label'); l2.setAttribute('for', 'edit-model'); l2.textContent = 'Model';
    const i2 = document.createElement('input'); i2.id = 'edit-model'; i2.type = 'text'; i2.maxLength = 100; i2.value = prompt.metadata?.model || '';
    f2.append(l2, i2);
    const f3 = document.createElement('div'); f3.className = 'field';
    const l3 = document.createElement('label'); l3.setAttribute('for', 'edit-content'); l3.textContent = 'Content';
    const i3 = document.createElement('textarea'); i3.id = 'edit-content'; i3.rows = 7; i3.value = prompt.content || '';
    f3.append(l3, i3);
    const f4 = document.createElement('div'); f4.className = 'field field-inline';
    const chkWrap = document.createElement('label'); chkWrap.className = 'checkbox'; chkWrap.setAttribute('for', 'edit-is-code');
    const chk = document.createElement('input'); chk.id = 'edit-is-code'; chk.type = 'checkbox'; chk.checked = looksLikeCode(prompt.content);
    const chkTxt = document.createElement('span'); chkTxt.textContent = 'Content contains code';
    chkWrap.append(chk, chkTxt);
    f4.append(chkWrap);
    const actions = document.createElement('div'); actions.className = 'actions';
    const save = document.createElement('button'); save.type = 'button'; save.className = 'btn primary'; save.dataset.role = 'prompt-save'; save.textContent = 'Save changes';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'btn'; cancel.dataset.role = 'prompt-cancel'; cancel.textContent = 'Cancel';
    actions.append(save, cancel);
    edit.append(err, f1, f2, f3, f4, actions);
    card.append(edit);
  }

  function exitEditMode(card) {
    card.classList.remove('editing');
    card.querySelectorAll('.prompt-edit').forEach(el => el.remove());
    card.querySelectorAll('.preview, .metadata, .rating, .notes').forEach(el => { el.hidden = false; });
  }

  function updatePrompt(promptId, changes) {
    const items = getPrompts();
    const idx = items.findIndex(x => x.id === promptId);
    if (idx === -1) throw new Error('Prompt not found');
    const p = items[idx];
    const prev = JSON.parse(JSON.stringify(p));
    try {
      const title = requireNonEmptyString(changes.title ?? p.title ?? '', 'Title', 120);
      const content = requireNonEmptyString(changes.content ?? p.content ?? '', 'Content');
      const model = requireNonEmptyString(changes.model ?? p.metadata?.model ?? '', 'Model name', 100);
      const isCodeFlag = typeof changes.isCode === 'boolean' ? changes.isCode : looksLikeCode(content);
      p.title = title;
      p.content = content;
      const baseMeta = p.metadata && isValidIso8601(p.metadata.createdAt) ? p.metadata : trackModel(model, content);
      const newMeta = { ...baseMeta, model, tokenEstimate: estimateTokens(content, isCodeFlag) };
      p.metadata = updateTimestamps(newMeta);
      setPrompts(items);
    } catch (err) {
      items[idx] = prev;
      setPrompts(items);
      throw err;
    }
  }

})();
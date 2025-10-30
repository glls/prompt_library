/* Prompt Library - localStorage-based */
(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary.v1";
  const RATING_MAX = 5;
  const form = document.getElementById("prompt-form");
  const listEl = document.getElementById("prompt-list");
  const countEl = document.getElementById("count");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");

  function safeParse(json, fallback) {
    try { return JSON.parse(json); } catch { return fallback; }
  }
/* Prompt Library - localStorage-based (clean rewrite) */
(function () {
  "use strict";

  const STORAGE_KEY = "promptLibrary.v1";
  const RATING_MAX = 5;
  const form = document.getElementById("prompt-form");
  const listEl = document.getElementById("prompt-list");
  const countEl = document.getElementById("count");
  const titleInput = document.getElementById("title");
  const contentInput = document.getElementById("content");

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

  // Data ops
  function addPrompt(title, content) {
    const next = [{ id: makeId(), title: String(title || "").trim(), content: String(content || "").trim(), rating: 0, notes: [], createdAt: Date.now() }, ...getPrompts()];
    setPrompts(next);
  }
  function deletePrompt(id) { setPrompts(getPrompts().filter(p => p.id !== id)); }

  // Rating
  function setRating(promptId, value) {
    const items = getPrompts();
    const idx = items.findIndex(x => x.id === promptId);
    if (idx === -1) return;
    items[idx].rating = clamp(Number(value) || 0, 0, RATING_MAX);
    setPrompts(items);
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
    try { setPrompts(items); renderPrompts(); } catch (err) { notes.shift(); throw err; }
  }
  function updateNote(promptId, noteId, content) {
    const items = getPrompts();
    const p = items.find(x => x.id === promptId); if (!p) return;
    const notes = ensureNotesArray(p);
    const n = notes.find(x => x.id === noteId); if (!n) return;
    const prev = { ...n };
    n.content = String(content).trim();
    n.updatedAt = Date.now();
    try { setPrompts(items); renderPrompts(); } catch (err) { Object.assign(n, prev); throw err; }
  }
  function deleteNote(promptId, noteId) {
    const items = getPrompts();
    const p = items.find(x => x.id === promptId); if (!p) return;
    const notes = ensureNotesArray(p);
    const idx = notes.findIndex(x => x.id === noteId); if (idx === -1) return;
    const removed = notes.splice(idx, 1);
    try { setPrompts(items); renderPrompts(); } catch (err) { notes.splice(idx, 0, ...removed); throw err; }
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
  function renderPrompts() {
    const items = getPrompts();
    listEl.innerHTML = "";
    countEl.textContent = items.length ? `${items.length} item${items.length > 1 ? "s" : ""}` : "No prompts yet";
    if (!items.length) {
      const empty = document.createElement("div"); empty.className = "empty-state"; empty.textContent = "No saved prompts yet."; listEl.appendChild(empty); return;
    }
    for (const p of items) {
      const card = document.createElement("article"); card.className = "card prompt-card";
      const header = document.createElement("div"); header.className = "prompt-card-header";
      const h3 = document.createElement("h3"); h3.textContent = p.title || "(Untitled)";
      const del = document.createElement("button"); del.className = "icon-btn danger"; del.type = "button"; del.setAttribute("aria-label", "Delete prompt"); del.textContent = "Delete"; del.addEventListener("click", () => { deletePrompt(p.id); renderPrompts(); });
      header.append(h3, del);
      const preview = document.createElement("p"); preview.className = "preview"; preview.textContent = makePreview(p.content);
      const ratingEl = buildRatingEl(p);
      const notesEl = buildNotesEl(p);
      card.append(header, preview, ratingEl, notesEl);
      listEl.appendChild(card);
    }
  }

  // Form
  function onSubmit(e) {
    e.preventDefault();
    const title = titleInput.value.trim();
    const content = contentInput.value.trim();
    if (!title || !content) { form.reportValidity(); return; }
    addPrompt(title, content); form.reset(); titleInput.focus(); renderPrompts();
  }

  // Events
  document.addEventListener("DOMContentLoaded", () => {
    form.addEventListener("submit", onSubmit);
    // Clicks
    listEl.addEventListener('click', (e) => {
      const star = e.target.closest('.star');
      if (star && listEl.contains(star)) { const group = star.closest('.rating'); if (!group) return; const promptId = group.dataset.promptId; const value = star.dataset.value; setRating(promptId, value); return; }
      const clearBtn = e.target.closest('[data-role="clear-rating"], .clear-rating');
      if (clearBtn && listEl.contains(clearBtn)) { const group = clearBtn.closest('.rating'); if (!group) return; const promptId = group.dataset.promptId; clearRating(promptId); return; }
      const addBtn = e.target.closest('[data-role="note-add"], .note-add');
      if (addBtn && listEl.contains(addBtn)) { const notesWrap = addBtn.closest('.notes'); if (!notesWrap) return; const promptId = notesWrap.dataset.promptId; const textarea = notesWrap.querySelector('.note-input'); const content = (textarea?.value || "").trim(); if (!content) return; try { addNote(promptId, content); } catch { showNotesError(notesWrap, 'Failed to save note. Storage may be full.'); } return; }
      const editBtn = e.target.closest('[data-role="note-edit"], .note-edit');
      if (editBtn && listEl.contains(editBtn)) { const item = editBtn.closest('.note-item'); const notesWrap = editBtn.closest('.notes'); if (!item || !notesWrap) return; const text = item.querySelector('.note-text')?.textContent || ''; item.classList.add('editing'); item.innerHTML = `\n          <textarea class="note-edit" aria-label="Edit note" rows="3">${escapeHtml(text)}</textarea>\n          <div class="notes-actions">\n            <button type="button" class="btn primary note-save" data-role="note-save">Save</button>\n            <button type="button" class="btn note-cancel" data-role="note-cancel">Cancel</button>\n          </div>\n        `; item.querySelector('.note-edit')?.focus(); return; }
      const saveBtn = e.target.closest('[data-role="note-save"], .note-save');
      if (saveBtn && listEl.contains(saveBtn)) { const item = saveBtn.closest('.note-item'); const notesWrap = saveBtn.closest('.notes'); if (!item || !notesWrap) return; const promptId = notesWrap.dataset.promptId; const noteId = item.dataset.noteId; const content = item.querySelector('.note-edit')?.value.trim() || ''; if (!content) { renderPrompts(); return; } try { updateNote(promptId, noteId, content); } catch { showNotesError(notesWrap, 'Failed to save changes.'); } return; }
      const cancelBtn = e.target.closest('[data-role="note-cancel"], .note-cancel');
      if (cancelBtn && listEl.contains(cancelBtn)) { renderPrompts(); return; }
      const delNoteBtn = e.target.closest('[data-role="note-delete"], .note-delete');
      if (delNoteBtn && listEl.contains(delNoteBtn)) { const item = delNoteBtn.closest('.note-item'); const notesWrap = delNoteBtn.closest('.notes'); if (!item || !notesWrap) return; const promptId = notesWrap.dataset.promptId; const noteId = item.dataset.noteId; if (confirm('Delete this note?')) { try { deleteNote(promptId, noteId); } catch { showNotesError(notesWrap, 'Failed to delete note.'); } } }
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
})();
    if (!n) return;
    const prev = { ...n };
    n.content = String(content).trim();
    n.updatedAt = Date.now();
    try {
      setPrompts(items);
      renderPrompts();
    } catch (err) {
      Object.assign(n, prev);
      throw err;
    }
  }

  function deleteNote(promptId, noteId) {
    const items = getPrompts();
    const p = items.find(x => x.id === promptId);
    if (!p) return;
    const notes = ensureNotesArray(p);
    const idx = notes.findIndex(x => x.id === noteId);
    if (idx === -1) return;
    const removed = notes.splice(idx, 1);
    try {
      setPrompts(items);
      renderPrompts();
    } catch (err) {
      // revert
      notes.splice(idx, 0, ...removed);
      throw err;
    }
  }

  function showNotesError(notesWrap, message) {
    let err = notesWrap.querySelector('.notes-error');
    if (!err) {
      err = document.createElement('div');
      err.className = 'notes-error';
      notesWrap.appendChild(err);
    }
    err.textContent = message;
    err.hidden = false;
    setTimeout(() => { if (err) err.hidden = true; }, 2500);
  }

  function buildNotesEl(prompt) {
  function buildNotesEl(prompt) {
    const wrap = document.createElement('section');
    wrap.className = 'notes';
    wrap.dataset.promptId = prompt.id;
  }
    const title = document.createElement('h4');
    title.className = 'notes-title';
    title.textContent = 'Notes';

    const list = document.createElement('div');
    list.className = 'notes-list';
    const notes = Array.isArray(prompt.notes) ? [...prompt.notes] : [];
    // newest already first if we maintained unshift; ensure sort by createdAt desc
    notes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (notes.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'notes-empty muted';
      empty.textContent = 'No notes yet.';
      list.appendChild(empty);
    } else {
      for (const n of notes) {
        const item = document.createElement('div');
        item.className = 'note-item';
        item.dataset.noteId = n.id;
        const text = document.createElement('div');
        text.className = 'note-text';
        text.textContent = n.content;
        const actions = document.createElement('div');
        actions.className = 'notes-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'icon-btn note-edit';
        edit.setAttribute('aria-label', 'Edit note');
        edit.textContent = 'Edit';
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn danger note-delete';
        del.setAttribute('aria-label', 'Delete note');
        del.textContent = 'Delete';
        actions.append(edit, del);
        item.append(text, actions);
        list.appendChild(item);
      }
    }

    const form = document.createElement('div');
    form.className = 'notes-form';
    const label = document.createElement('label');
    label.className = 'notes-label';
    label.textContent = 'Add note';
    label.setAttribute('for', `note-${prompt.id}`);
    const ta = document.createElement('textarea');
    ta.className = 'note-input';
    ta.id = `note-${prompt.id}`;
    ta.setAttribute('rows', '3');
    ta.setAttribute('placeholder', 'Write a quick note…');
    ta.setAttribute('aria-label', 'Add note');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn primary note-add';
    saveBtn.setAttribute('data-role', 'note-add');
    saveBtn.textContent = 'Save note';
    form.append(label, ta, saveBtn);

    wrap.append(title, list, form);
    return wrap;
  }
        if (nextEl) nextEl.focus();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = clamp(value - 1, 1, RATING_MAX);
        const prevEl = group.querySelector(`.star[data-value="${prev}"]`);
        if (prevEl) prevEl.focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setRating(promptId, value);
      }
    });

    renderPrompts();
  });
})();

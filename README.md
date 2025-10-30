# Prompt Library

A tiny, zero-dependency prompt library that saves your prompts to your browser's localStorage using only HTML/CSS/JS

Developed using prompts (GPT-5) while studying the excellent [Practical Prompt Engineering](https://frontendmasters.com/courses/prompt-engineering/) course by [Sabrina Goldfarb](https://github.com/sgoldfarb2)

## Features

- Add prompts with a title and full content
- Save to localStorage (no backend required)
- See saved prompts as clean cards with title and content preview
- Delete prompts (removes from localStorage and UI)
- Clean developer-themed UI with light/dark mode (honors system preference)
- Rate each prompt with a 1–5 star component (stored in localStorage)
- Add, edit, and delete notes per prompt (stored in localStorage)
- Per-prompt metadata tracking: model name, created/updated timestamps (ISO 8601), and token estimate with confidence
- Sorts prompt cards by metadata.createdAt (newest first)
- Inline prompt editing: update Title, Model, Content, and code toggle in-place
- Export/Import: versioned JSON with stats, merge/replace modes, duplicate handling, backup & rollback

## How to run

1. Open `index.html` in your browser.
2. Type a Title, Model (e.g., `gpt-4o`), and Content. Optionally check "Content contains code" if your prompt includes code snippets.
3. Click "Save prompt".
4. Your prompts appear below as cards. Click stars to rate (Clear to reset). Use the Notes area on each card to add a note; Edit/Delete to modify notes. Use the Delete button to remove a prompt.

Optional: run a simple local server (for live reload or cross-origin safe file APIs):

```bash
npx http-server -p 8080
```

## Metadata API (in-browser)

The app defines three pure JS functions in `app.js`:

1. `trackModel(modelName: string, content: string): MetadataObject`
   - Validates non-empty model name (max 100 chars)
   - Auto-creates `createdAt`/`updatedAt` in ISO 8601
   - Computes `tokenEstimate` from `content` (boosted if code-like)

2. `updateTimestamps(metadata: MetadataObject): MetadataObject`
   - Updates `updatedAt` and ensures it's >= `createdAt`

3. `estimateTokens(text: string, isCode: boolean): TokenEstimate`
   - min = 0.75 × word_count, max = 0.25 × character_count; ×1.3 if `isCode=true`
   - confidence: `high` if <1000 tokens, `medium` if 1000–5000, `low` if >5000

Output schema (TypeScript):

```ts
type Confidence = 'high' | 'medium' | 'low';

interface TokenEstimate {
  min: number;
  max: number;
  confidence: Confidence;
}

interface MetadataObject {
  model: string;          // non-empty, max 100 chars
  createdAt: string;      // ISO 8601
  updatedAt: string;      // ISO 8601 (>= createdAt)
  tokenEstimate: TokenEstimate;
}
```

Example value:

```json
{
  "model": "gpt-4o",
  "createdAt": "2025-10-30T12:34:56.789Z",
  "updatedAt": "2025-10-30T12:34:56.789Z",
  "tokenEstimate": { "min": 42, "max": 120, "confidence": "high" }
}
```

Validation errors throw descriptive messages. The UI shows them near the form.

## Edit prompts

- Click Edit on any prompt card to open an inline form.
- You can update Title, Model, Content, and whether the content contains code.
- On save, the app validates fields, recomputes token estimates, updates `metadata.updatedAt`, and refreshes the card. Cancel discards changes.

## Export and import

Toolbar controls (top-right of “Saved Prompts”):

- Mode select: Merge (default) or Replace
- Export button: downloads a timestamped `.json`
- Import button: opens a file picker for `.json`

Schema envelope (JSON):

```json
{
  "version": 1,
  "exportTimestamp": "2025-10-30T12:34:56.789Z",
  "stats": {
    "totalPrompts": 12,
    "averageRating": 3.42,
    "mostUsedModel": "gpt-4o"
  },
  "prompts": []
}
```

Merge vs Replace:
 
- Replace: overwrites your existing data with the imported file.
- Merge: combines both; if duplicate IDs are found, you’ll be prompted to overwrite or keep existing.

Validation and safety:
 
- Import validates structure, version, prompts, and metadata.
- Before import, the app backs up your current data to `localStorage` (key like `promptLibrary.v1.backup.<timestamp>`).
- On import failure, the app rolls back automatically to the backup and shows an error.

## Notes

- Data lives in your browser (key: `promptLibrary.v1`). Clearing site data removes your prompts.
- Exports are plain JSON; keep them private if prompts are sensitive.

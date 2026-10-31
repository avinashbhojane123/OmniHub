import {
  KeepNote,
  KeepNoteType,
  KeepColorKey,
  KEEP_NOTE_TYPES,
  KEEP_COLOR_KEYS,
  KEEP_COLORS,
  ChecklistItem,
  DrawingStroke,
  DrawingPoint,
  isKeepColorKey,
  isKeepNoteType,
  isDrawingPoint,
  isDrawingStroke,
  isChecklistItem,
  isKeepNote,
  getKeepColor,
  resolveKeepColor,
  createEmptyKeepNote,
  checklistToText,
  textToChecklist,
  toggleChecklistItem,
  reorderChecklistItems,
  cleanChecklistItems,
  getKeepNoteStats,
} from '../src/types/keepNote';

describe('KeepNote Types & Utilities Test Suite', () => {
  describe('Constants & Definitions', () => {
    it('should have comprehensive KEEP_NOTE_TYPES including image', () => {
      expect(KEEP_NOTE_TYPES).toContain('text');
      expect(KEEP_NOTE_TYPES).toContain('checklist');
      expect(KEEP_NOTE_TYPES).toContain('drawing');
      expect(KEEP_NOTE_TYPES).toContain('audio');
      expect(KEEP_NOTE_TYPES).toContain('image');
      expect(KEEP_NOTE_TYPES.length).toBe(5);
    });

    it('should have 12 distinct Keep color keys', () => {
      expect(KEEP_COLOR_KEYS.length).toBe(12);
      expect(KEEP_COLOR_KEYS).toContain('default');
      expect(KEEP_COLOR_KEYS).toContain('coral');
      expect(KEEP_COLOR_KEYS).toContain('peach');
      expect(KEEP_COLOR_KEYS).toContain('sand');
      expect(KEEP_COLOR_KEYS).toContain('mint');
      expect(KEEP_COLOR_KEYS).toContain('sage');
      expect(KEEP_COLOR_KEYS).toContain('fog');
      expect(KEEP_COLOR_KEYS).toContain('storm');
      expect(KEEP_COLOR_KEYS).toContain('dusk');
      expect(KEEP_COLOR_KEYS).toContain('blossom');
      expect(KEEP_COLOR_KEYS).toContain('clay');
      expect(KEEP_COLOR_KEYS).toContain('chalk');
    });

    it('should provide full light and dark palettes with contrast text colors for every color', () => {
      KEEP_COLOR_KEYS.forEach((key) => {
        const def = KEEP_COLORS[key];
        expect(def).toBeDefined();
        expect(def.key).toBe(key);
        expect(typeof def.name).toBe('string');
        expect(def.name.length).toBeGreaterThan(0);

        // Hex colors for light and dark
        expect(def.lightBg).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.lightBorder).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.lightText).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.darkBg).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.darkBorder).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(def.darkText).toMatch(/^#[0-9A-Fa-f]{6}$/);

        // Text color must differ from background for contrast
        expect(def.lightText.toLowerCase()).not.toBe(def.lightBg.toLowerCase());
        expect(def.darkText.toLowerCase()).not.toBe(def.darkBg.toLowerCase());
      });
    });
  });

  describe('Runtime Type Guards', () => {
    it('isKeepColorKey should validate color keys correctly', () => {
      expect(isKeepColorKey('default')).toBe(true);
      expect(isKeepColorKey('coral')).toBe(true);
      expect(isKeepColorKey('chalk')).toBe(true);

      expect(isKeepColorKey('neon_green')).toBe(false);
      expect(isKeepColorKey('')).toBe(false);
      expect(isKeepColorKey(null)).toBe(false);
      expect(isKeepColorKey(undefined)).toBe(false);
      expect(isKeepColorKey(123)).toBe(false);
      expect(isKeepColorKey({})).toBe(false);
    });

    it('isKeepNoteType should validate note types correctly', () => {
      expect(isKeepNoteType('text')).toBe(true);
      expect(isKeepNoteType('checklist')).toBe(true);
      expect(isKeepNoteType('drawing')).toBe(true);
      expect(isKeepNoteType('audio')).toBe(true);
      expect(isKeepNoteType('image')).toBe(true);

      expect(isKeepNoteType('video')).toBe(false);
      expect(isKeepNoteType('')).toBe(false);
      expect(isKeepNoteType(null)).toBe(false);
      expect(isKeepNoteType(undefined)).toBe(false);
    });

    it('isDrawingPoint should validate points with optional pressure and timestamp', () => {
      expect(isDrawingPoint({ x: 10, y: 20 })).toBe(true);
      expect(isDrawingPoint({ x: 0, y: 0, pressure: 0.8, timestamp: 1700000000 })).toBe(true);

      expect(isDrawingPoint({ x: NaN, y: 10 })).toBe(false);
      expect(isDrawingPoint({ x: 10 })).toBe(false);
      expect(isDrawingPoint(null)).toBe(false);
      expect(isDrawingPoint('point')).toBe(false);
    });

    it('isDrawingStroke should validate strokes with point arrays and cap styles', () => {
      const validStroke: DrawingStroke = {
        color: '#000000',
        width: 3,
        points: [{ x: 5, y: 5 }, { x: 10, y: 15 }],
        opacity: 0.9,
        cap: 'round',
      };
      expect(isDrawingStroke(validStroke)).toBe(true);

      expect(isDrawingStroke({ color: '#000', width: 2, points: 'invalid' })).toBe(false);
      expect(isDrawingStroke({ color: '#000', width: NaN, points: [] })).toBe(false);
      expect(isDrawingStroke({ color: '#000', width: 2, points: [{ x: 5 }] })).toBe(false);
      expect(isDrawingStroke({ color: '#000', width: 2, points: [], cap: 'triangle' })).toBe(false);
    });

    it('isChecklistItem should validate items with optional order and indent', () => {
      const item: ChecklistItem = {
        id: 'chk_1',
        text: 'Grocery shopping',
        completed: false,
        order: 1,
        indent: 0,
      };
      expect(isChecklistItem(item)).toBe(true);
      expect(isChecklistItem({ id: 'chk_2', text: 'Apples', completed: true })).toBe(true);

      expect(isChecklistItem({ id: 'chk_3', text: 123, completed: false })).toBe(false);
      expect(isChecklistItem({ id: 'chk_4', text: 'Missing completed' })).toBe(false);
      expect(isChecklistItem(null)).toBe(false);
    });

    it('isKeepNote should validate entire note structure', () => {
      const note: KeepNote = {
        id: 'note_123',
        title: 'Project Roadmap',
        content: 'Milestones for Q4',
        type: 'text',
        color: 'mint',
        isPinned: true,
        isArchived: false,
        isTrashed: false,
        labels: ['Work', 'Q4'],
        checklistData: [],
        createdAt: '2026-10-30T10:00:00.000Z',
        updatedAt: '2026-10-30T10:00:00.000Z',
      };
      expect(isKeepNote(note)).toBe(true);

      // Missing required property
      expect(isKeepNote({ ...note, id: undefined })).toBe(false);
      // Bad color
      expect(isKeepNote({ ...note, color: 'invalid_color' })).toBe(false);
      // Malformed checklist
      expect(isKeepNote({ ...note, checklistData: [{ bad: true }] })).toBe(false);
      // Non-object
      expect(isKeepNote(null)).toBe(false);
    });
  });

  describe('Color Resolvers', () => {
    it('getKeepColor should return exact definition or fallback to default', () => {
      const sage = getKeepColor('sage');
      expect(sage.key).toBe('sage');
      expect(sage.name).toBe('Sage');

      const fallbackNull = getKeepColor(null);
      expect(fallbackNull.key).toBe('default');

      const fallbackInvalid = getKeepColor('nonexistent' as KeepColorKey);
      expect(fallbackInvalid.key).toBe('default');
    });

    it('resolveKeepColor should return theme-specific background, border, and text', () => {
      const lightMint = resolveKeepColor('mint', false);
      expect(lightMint.bg).toBe(KEEP_COLORS.mint.lightBg);
      expect(lightMint.border).toBe(KEEP_COLORS.mint.lightBorder);
      expect(lightMint.text).toBe(KEEP_COLORS.mint.lightText);

      const darkMint = resolveKeepColor('mint', true);
      expect(darkMint.bg).toBe(KEEP_COLORS.mint.darkBg);
      expect(darkMint.border).toBe(KEEP_COLORS.mint.darkBorder);
      expect(darkMint.text).toBe(KEEP_COLORS.mint.darkText);
    });
  });

  describe('Factory Helper (createEmptyKeepNote)', () => {
    it('should create a valid default note with generated id and timestamps', () => {
      const note = createEmptyKeepNote();
      expect(note.id).toMatch(/^note_\d+_[a-z0-9]+$/);
      expect(note.title).toBe('');
      expect(note.content).toBe('');
      expect(note.type).toBe('text');
      expect(note.color).toBe('default');
      expect(note.isPinned).toBe(false);
      expect(note.isArchived).toBe(false);
      expect(note.isTrashed).toBe(false);
      expect(Array.isArray(note.labels)).toBe(true);
      expect(note.labels.length).toBe(0);
      expect(Array.isArray(note.checklistData)).toBe(true);
      expect(note.checklistData.length).toBe(0);
      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBeDefined();
    });

    it('should apply partial overrides and deep-clone nested arrays', () => {
      const initialChecklist = [{ id: '1', text: 'Item 1', completed: false }];
      const initialLabels = ['Personal'];
      const note = createEmptyKeepNote({
        title: 'My Custom Note',
        color: 'coral',
        isPinned: true,
        labels: initialLabels,
        checklistData: initialChecklist,
      });

      expect(note.title).toBe('My Custom Note');
      expect(note.color).toBe('coral');
      expect(note.isPinned).toBe(true);

      // Verify deep clone
      initialLabels.push('Mutated');
      expect(note.labels).toEqual(['Personal']);

      initialChecklist[0].text = 'Mutated';
      expect(note.checklistData[0].text).toBe('Item 1');
    });
  });

  describe('Content Converters (checklistToText & textToChecklist)', () => {
    const sampleItems: ChecklistItem[] = [
      { id: '1', text: 'Apples', completed: true, order: 1 },
      { id: '2', text: 'Oranges', completed: false, order: 2 },
      { id: '3', text: 'Organic Navel', completed: false, order: 3, indent: 1 },
    ];

    it('checklistToText should format bullets by default', () => {
      const bulletText = checklistToText(sampleItems);
      expect(bulletText).toBe('✓ Apples\n• Oranges\n  • Organic Navel');
    });

    it('checklistToText should support markdown task list format', () => {
      const mdText = checklistToText(sampleItems, { format: 'markdown' });
      expect(mdText).toBe('[x] Apples\n[ ] Oranges\n  [ ] Organic Navel');
    });

    it('checklistToText should support plain format and ignore empty text', () => {
      const itemsWithEmpty: ChecklistItem[] = [
        ...sampleItems,
        { id: '4', text: '   ', completed: false },
      ];
      const plainText = checklistToText(itemsWithEmpty, { format: 'plain' });
      expect(plainText).toBe('Apples\nOranges\n  Organic Navel');
    });

    it('checklistToText should handle null or empty inputs gracefully', () => {
      expect(checklistToText(null)).toBe('');
      expect(checklistToText([])).toBe('');
    });

    it('textToChecklist should parse markdown brackets [x] and [ ]', () => {
      const text = '[x] Finished task\n[ ] Pending task';
      const items = textToChecklist(text);
      expect(items.length).toBe(2);
      expect(items[0].text).toBe('Finished task');
      expect(items[0].completed).toBe(true);
      expect(items[1].text).toBe('Pending task');
      expect(items[1].completed).toBe(false);
    });

    it('textToChecklist should parse unicode bullets, checkmarks, and numbered lists', () => {
      const text = `✓ Buy groceries
• Clean apartment
  - Deep clean oven
* Take out recycling
+ Water plants
1. Call mom
2) Review PR`;
      const items = textToChecklist(text);
      expect(items.length).toBe(7);
      expect(items[0].completed).toBe(true);
      expect(items[0].text).toBe('Buy groceries');
      expect(items[1].completed).toBe(false);
      expect(items[1].text).toBe('Clean apartment');
      expect(items[2].indent).toBe(1);
      expect(items[2].text).toBe('Deep clean oven');
      expect(items[5].text).toBe('Call mom');
      expect(items[6].text).toBe('Review PR');
    });

    it('textToChecklist should return a single blank draft item for empty text', () => {
      const items = textToChecklist('   \n  ');
      expect(items.length).toBe(1);
      expect(items[0].text).toBe('');
      expect(items[0].completed).toBe(false);
    });
  });

  describe('Checklist State Helpers', () => {
    const items: ChecklistItem[] = [
      { id: '1', text: 'Item 1', completed: false, order: 1 },
      { id: '2', text: 'Item 2', completed: true, order: 2 },
      { id: '3', text: 'Item 3', completed: false, order: 3 },
    ];

    it('toggleChecklistItem should invert completion state immutably', () => {
      const toggled = toggleChecklistItem(items, '1');
      expect(toggled[0].completed).toBe(true);
      expect(items[0].completed).toBe(false); // original untouched

      const untoggled = toggleChecklistItem(toggled, '1');
      expect(untoggled[0].completed).toBe(false);

      // Non-existent id returns identical array items
      const nonExistent = toggleChecklistItem(items, '999');
      expect(nonExistent).toEqual(items);
    });

    it('reorderChecklistItems should reorder and update order indices', () => {
      const reordered = reorderChecklistItems(items, 0, 2);
      expect(reordered.map((i) => i.id)).toEqual(['2', '3', '1']);
      expect(reordered[0].order).toBe(1);
      expect(reordered[1].order).toBe(2);
      expect(reordered[2].order).toBe(3);

      // Out of bounds indices should be safe
      const oob = reorderChecklistItems(items, -1, 5);
      expect(oob).toEqual(items);
    });

    it('cleanChecklistItems should filter blanks, trim whitespace, and re-order', () => {
      const messyItems: ChecklistItem[] = [
        { id: '1', text: '  Trim me  ', completed: false },
        { id: '2', text: '   ', completed: false },
        { id: '3', text: 'Keep me', completed: true },
      ];
      const cleaned = cleanChecklistItems(messyItems);
      expect(cleaned.length).toBe(2);
      expect(cleaned[0].text).toBe('Trim me');
      expect(cleaned[0].order).toBe(1);
      expect(cleaned[1].text).toBe('Keep me');
      expect(cleaned[1].order).toBe(2);
    });
  });

  describe('Note Statistics Helper (getKeepNoteStats)', () => {
    it('should compute checklist progress, counts, and word counts accurately', () => {
      const note: KeepNote = {
        id: 'n_1',
        title: 'Weekly Groceries',
        content: '',
        type: 'checklist',
        color: 'peach',
        isPinned: false,
        isArchived: false,
        isTrashed: false,
        labels: ['Shopping', 'Home'],
        checklistData: [
          { id: '1', text: 'Apples and bananas', completed: true },
          { id: '2', text: 'Milk', completed: true },
          { id: '3', text: 'Whole wheat bread', completed: false },
          { id: '4', text: 'Greek yogurt', completed: false },
        ],
        createdAt: '2026-10-30T00:00:00.000Z',
        updatedAt: '2026-10-30T00:00:00.000Z',
      };

      const stats = getKeepNoteStats(note);
      expect(stats.totalChecklistItems).toBe(4);
      expect(stats.completedChecklistItems).toBe(2);
      expect(stats.pendingChecklistItems).toBe(2);
      expect(stats.checklistProgress).toBe(50); // 2/4 = 50%
      expect(stats.labelsCount).toBe(2);
      expect(stats.hasReminder).toBe(false);
      expect(stats.isReminderOverdue).toBe(false);
      expect(stats.wordCount).toBe(9); // 'Apples and bananas Milk Whole wheat bread Greek yogurt' = 9 words
    });

    it('should evaluate reminder statuses against reference date', () => {
      const refDate = new Date('2026-10-30T12:00:00.000Z');

      const overdueNote: KeepNote = {
        ...createEmptyKeepNote(),
        reminderTime: '2026-10-30T10:00:00.000Z',
      };
      const overdueStats = getKeepNoteStats(overdueNote, refDate);
      expect(overdueStats.hasReminder).toBe(true);
      expect(overdueStats.isReminderOverdue).toBe(true);

      const futureNote: KeepNote = {
        ...createEmptyKeepNote(),
        reminderTime: '2026-10-30T14:00:00.000Z',
      };
      const futureStats = getKeepNoteStats(futureNote, refDate);
      expect(futureStats.hasReminder).toBe(true);
      expect(futureStats.isReminderOverdue).toBe(false);
    });

    it('should compute zero checklist progress for notes without checklists', () => {
      const note: KeepNote = {
        ...createEmptyKeepNote(),
        content: 'Antigravity note engine text',
      };
      const stats = getKeepNoteStats(note);
      expect(stats.totalChecklistItems).toBe(0);
      expect(stats.checklistProgress).toBe(0);
      expect(stats.wordCount).toBe(4);
      expect(stats.characterCount).toBe(28);
    });
  });
});

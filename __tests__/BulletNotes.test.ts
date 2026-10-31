import {
  parseBulletNotes,
  serializeBulletNotes,
  hasBulletNotes,
  toggleBulletInRawText,
  resetBulletsInRawText,
  formatNumberedItem,
  parseHabitNameItems,
  addBulletToRawText,
  removeBulletFromRawText,
  getBulletNotesStats,
  isBulletLine,
  parseBulletLine,
  BulletItem,
} from '../src/utils/bulletNotes';

describe('BulletNotes Utility Hardened Suite', () => {
  describe('parseBulletNotes', () => {
    it('should return empty array for null, undefined, empty string, or whitespace', () => {
      expect(parseBulletNotes(null)).toEqual([]);
      expect(parseBulletNotes(undefined)).toEqual([]);
      expect(parseBulletNotes('')).toEqual([]);
      expect(parseBulletNotes('   \n  \t  ')).toEqual([]);
    });

    it('should parse standard plain bullet points and assign deterministic IDs', () => {
      const text = '• Item 1\n* Item 2\n- Item 3\n+ Item 4';
      const items = parseBulletNotes(text);

      expect(items).toHaveLength(4);
      expect(items[0]).toEqual({
        id: 'bullet_0',
        text: 'Item 1',
        completed: false,
        raw: '• Item 1',
        indent: 0,
        marker: '•',
        isCheckbox: false,
      });
      expect(items[1].text).toBe('Item 2');
      expect(items[2].text).toBe('Item 3');
      expect(items[3].text).toBe('Item 4');
    });

    it('should parse standalone checkbox items with various checkmark symbols', () => {
      const text = [
        '[ ] Unchecked item',
        '[x] Lowercase x completed',
        '[X] Uppercase X completed',
        '[✓] Unicode checkmark',
        '[✔] Heavy checkmark',
        '[v] Letter v checkmark',
      ].join('\n');

      const items = parseBulletNotes(text);
      expect(items).toHaveLength(6);
      expect(items[0].completed).toBe(false);
      expect(items[1].completed).toBe(true);
      expect(items[2].completed).toBe(true);
      expect(items[3].completed).toBe(true);
      expect(items[4].completed).toBe(true);
      expect(items[5].completed).toBe(true);
      expect(items[0].isCheckbox).toBe(true);
    });

    it('should parse markdown-prefixed checklists without retaining the checkbox in text', () => {
      const text = [
        '- [ ] Markdown unchecked',
        '- [x] Markdown checked',
        '* [ ] Asterisk unchecked',
        '* [X] Asterisk checked',
        '+ [✓] Plus checked',
        '• [x] Bullet checked',
      ].join('\n');

      const items = parseBulletNotes(text);
      expect(items).toHaveLength(6);
      expect(items[0].text).toBe('Markdown unchecked');
      expect(items[0].completed).toBe(false);
      expect(items[1].text).toBe('Markdown checked');
      expect(items[1].completed).toBe(true);
      expect(items[2].text).toBe('Asterisk unchecked');
      expect(items[2].completed).toBe(false);
      expect(items[3].text).toBe('Asterisk checked');
      expect(items[3].completed).toBe(true);
      expect(items[4].text).toBe('Plus checked');
      expect(items[4].completed).toBe(true);
      expect(items[5].text).toBe('Bullet checked');
      expect(items[5].completed).toBe(true);
    });

    it('should extract bullet items from mixed markdown documents and ignore headers and paragraphs', () => {
      const document = `
# Project Plan
This is an introductory paragraph explaining the plan.

- [ ] Task 1: Initialize database
- [x] Task 2: Configure authentication
• Task 3: Deploy to production

Note: Please finish by Friday.
---
`;
      const items = parseBulletNotes(document);
      expect(items).toHaveLength(3);
      expect(items[0].text).toBe('Task 1: Initialize database');
      expect(items[0].completed).toBe(false);
      expect(items[1].text).toBe('Task 2: Configure authentication');
      expect(items[1].completed).toBe(true);
      expect(items[2].text).toBe('Task 3: Deploy to production');
      expect(items[2].completed).toBe(false);
    });

    it('should parse Unicode bullet variants', () => {
      const text = '◦ White bullet\n▪ Small black square\n▫ Small white square\n⁃ Hyphen bullet';
      const items = parseBulletNotes(text);
      expect(items).toHaveLength(4);
      expect(items[0].text).toBe('White bullet');
      expect(items[1].text).toBe('Small black square');
      expect(items[2].text).toBe('Small white square');
      expect(items[3].text).toBe('Hyphen bullet');
    });

    it('should parse numbered list items', () => {
      const text = '1. First step\n2) Second step\n3. [ ] Third checklist step';
      const items = parseBulletNotes(text);
      expect(items).toHaveLength(3);
      expect(items[0].text).toBe('First step');
      expect(items[0].completed).toBe(false);
      expect(items[1].text).toBe('Second step');
      expect(items[2].text).toBe('Third checklist step');
      expect(items[2].isCheckbox).toBe(true);
    });

    it('should capture indentation depth', () => {
      const text = '- Top level\n  - Sub level\n    - Deep sub level';
      const items = parseBulletNotes(text);
      expect(items[0].indent).toBe(0);
      expect(items[1].indent).toBe(2);
      expect(items[2].indent).toBe(4);
    });
  });

  describe('toggleBulletInRawText', () => {
    it('should toggle standalone unchecked checkbox to checked and back', () => {
      const initial = '[ ] Buy groceries';
      const toggledOnce = toggleBulletInRawText(initial, 0);
      expect(toggledOnce).toBe('[x] Buy groceries');

      const toggledTwice = toggleBulletInRawText(toggledOnce, 0);
      expect(toggledTwice).toBe('[ ] Buy groceries');
    });

    it('should toggle markdown prefixed checklist without corrupting prefix', () => {
      const initial = '- [ ] Buy groceries';
      const toggledOnce = toggleBulletInRawText(initial, 0);
      expect(toggledOnce).toBe('- [x] Buy groceries');

      const toggledTwice = toggleBulletInRawText(toggledOnce, 0);
      expect(toggledTwice).toBe('- [ ] Buy groceries');
    });

    it('should toggle asterisk and plus prefixed checklists', () => {
      const asterisk = '* [ ] Task A';
      expect(toggleBulletInRawText(asterisk, 0)).toBe('* [x] Task A');

      const plus = '+ [x] Task B';
      expect(toggleBulletInRawText(plus, 0)).toBe('+ [ ] Task B');
    });

    it('should toggle plain bullet items to checked and subsequent toggles to unchecked', () => {
      const bullet = '• Buy milk';
      const toggled1 = toggleBulletInRawText(bullet, 0);
      expect(toggled1).toBe('[x] Buy milk');

      const toggled2 = toggleBulletInRawText(toggled1, 0);
      expect(toggled2).toBe('[ ] Buy milk');

      const dashBullet = '- Buy eggs';
      const dashToggled1 = toggleBulletInRawText(dashBullet, 0);
      expect(dashToggled1).toBe('- [x] Buy eggs');

      const dashToggled2 = toggleBulletInRawText(dashToggled1, 0);
      expect(dashToggled2).toBe('- [ ] Buy eggs');
    });

    it('should preserve surrounding headers, text, and unaffected bullet lines untouched', () => {
      const doc = [
        '# Shopping List',
        'Head to store before 6 PM.',
        '',
        '- [ ] Apples',
        '- [x] Milk',
        '- [ ] Bread',
        '',
        'Remember coupons!',
      ].join('\n');

      const updated = toggleBulletInRawText(doc, 2); // Toggle "Bread" (bullet index 2)
      const lines = updated.split('\n');

      expect(lines[0]).toBe('# Shopping List');
      expect(lines[1]).toBe('Head to store before 6 PM.');
      expect(lines[2]).toBe('');
      expect(lines[3]).toBe('- [ ] Apples');
      expect(lines[4]).toBe('- [x] Milk');
      expect(lines[5]).toBe('- [x] Bread'); // Toggled!
      expect(lines[6]).toBe('');
      expect(lines[7]).toBe('Remember coupons!');
    });

    it('should preserve CRLF line endings when input contains CRLF', () => {
      const crlfDoc = '• Task 1\r\n• Task 2\r\n';
      const result = toggleBulletInRawText(crlfDoc, 0);
      expect(result).toBe('[x] Task 1\r\n• Task 2\r\n');
    });

    it('should return rawText safely when target index is negative or out of bounds', () => {
      const doc = '- [ ] Task 1';
      expect(toggleBulletInRawText(doc, -1)).toBe(doc);
      expect(toggleBulletInRawText(doc, 5)).toBe(doc);
    });

    it('should handle null, undefined, or empty inputs safely', () => {
      expect(toggleBulletInRawText(null, 0)).toBe('');
      expect(toggleBulletInRawText(undefined, 0)).toBe('');
      expect(toggleBulletInRawText('', 0)).toBe('');
    });
  });

  describe('resetBulletsInRawText', () => {
    it('should reset standalone checked items to unchecked', () => {
      const input = '[x] Task 1\n[X] Task 2\n[✓] Task 3\n[✔] Task 4\n[v] Task 5';
      const expected = '[ ] Task 1\n[ ] Task 2\n[ ] Task 3\n[ ] Task 4\n[ ] Task 5';
      expect(resetBulletsInRawText(input)).toBe(expected);
    });

    it('should reset markdown-prefixed checked items while preserving prefixes', () => {
      const input = '- [x] Task 1\n* [X] Task 2\n+ [✓] Task 3\n• [x] Task 4\n1. [X] Task 5';
      const expected = '- [ ] Task 1\n* [ ] Task 2\n+ [ ] Task 3\n• [ ] Task 4\n1. [ ] Task 5';
      expect(resetBulletsInRawText(input)).toBe(expected);
    });

    it('should preserve indentation when resetting checked items', () => {
      const input = '  - [x] Indented task\n    [X] Deeply indented task';
      const expected = '  - [ ] Indented task\n    [ ] Deeply indented task';
      expect(resetBulletsInRawText(input)).toBe(expected);
    });

    it('should not alter non-checkbox bracketed text, dividers, or plain text', () => {
      const input = '[Important] Read this\n[Bug] Fix null pointer\n---\nRegular text';
      expect(resetBulletsInRawText(input)).toBe(input);
    });

    it('should handle null, undefined, or empty string gracefully', () => {
      expect(resetBulletsInRawText(null)).toBe('');
      expect(resetBulletsInRawText(undefined)).toBe('');
      expect(resetBulletsInRawText('')).toBe('');
    });
  });

  describe('hasBulletNotes', () => {
    it('should return false for empty or non-string inputs', () => {
      expect(hasBulletNotes(null)).toBe(false);
      expect(hasBulletNotes(undefined)).toBe(false);
      expect(hasBulletNotes('')).toBe(false);
      expect(hasBulletNotes('   ')).toBe(false);
    });

    it('should avoid false positives on negative numbers, horizontal dividers, and tags', () => {
      expect(hasBulletNotes('-5 degrees outside')).toBe(false);
      expect(hasBulletNotes('- $20 transaction fee')).toBe(false);
      expect(hasBulletNotes('---')).toBe(false);
      expect(hasBulletNotes('***')).toBe(false);
      expect(hasBulletNotes('**bold announcement**')).toBe(false);
      expect(hasBulletNotes('*italic text*')).toBe(false);
      expect(hasBulletNotes('[Important] Note for team')).toBe(false);
      expect(hasBulletNotes('[Feature] Request status')).toBe(false);
      expect(hasBulletNotes('Just a plain paragraph without any list.')).toBe(false);
    });

    it('should detect bullets even when preceded by headers or intro text', () => {
      const note = 'Project Overview\n\n- Task 1\n- Task 2';
      expect(hasBulletNotes(note)).toBe(true);
    });

    it('should return true for all valid bullet and checkbox styles', () => {
      expect(hasBulletNotes('• Bullet item')).toBe(true);
      expect(hasBulletNotes('* Asterisk item')).toBe(true);
      expect(hasBulletNotes('- Dash item')).toBe(true);
      expect(hasBulletNotes('+ Plus item')).toBe(true);
      expect(hasBulletNotes('[ ] Checkbox item')).toBe(true);
      expect(hasBulletNotes('[x] Checked item')).toBe(true);
      expect(hasBulletNotes('- [ ] Markdown checkbox')).toBe(true);
      expect(hasBulletNotes('1. Numbered item')).toBe(true);
      expect(hasBulletNotes('  ◦ Indented white bullet')).toBe(true);
    });
  });

  describe('formatNumberedItem', () => {
    it('should return the original item unchanged when total <= 1', () => {
      expect(formatNumberedItem('Exercise', 0, 1)).toBe('Exercise');
      expect(formatNumberedItem('10 min meditation', 0, 1)).toBe('10 min meditation');
    });

    it('should accurately number items when total > 1', () => {
      expect(formatNumberedItem('Exercise', 0, 3)).toBe('1. Exercise');
      expect(formatNumberedItem('Meditate', 1, 3)).toBe('2. Meditate');
      expect(formatNumberedItem('Stretch', 2, 3)).toBe('3. Stretch');
    });

    it('should NOT corrupt quantities, numbers, or durations in habit titles', () => {
      expect(formatNumberedItem('10 min meditation', 0, 3)).toBe('1. 10 min meditation');
      expect(formatNumberedItem('20 Pushups', 1, 3)).toBe('2. 20 Pushups');
      expect(formatNumberedItem('5km Run', 2, 3)).toBe('3. 5km Run');
      expect(formatNumberedItem('2 liters of water', 1, 2)).toBe('2. 2 liters of water');
    });

    it('should strip existing bullet markers to prevent double prefixes', () => {
      expect(formatNumberedItem('• Reading', 0, 2)).toBe('1. Reading');
      expect(formatNumberedItem('- Drinking water', 1, 2)).toBe('2. Drinking water');
      expect(formatNumberedItem('* Sleeping 8h', 0, 3)).toBe('1. Sleeping 8h');
    });

    it('should re-number existing numbering prefixes to match the current index', () => {
      expect(formatNumberedItem('5. Meditation', 0, 3)).toBe('1. Meditation');
      expect(formatNumberedItem('1) Stretch', 1, 3)).toBe('2. Stretch');
      expect(formatNumberedItem('1 - Running', 2, 3)).toBe('3. Running');
    });

    it('should leave section dividers and markdown headers untouched', () => {
      expect(formatNumberedItem('----------------DRINKS----------------', 0, 3)).toBe(
        '----------------DRINKS----------------'
      );
      expect(formatNumberedItem('### Morning Routine', 0, 3)).toBe('### Morning Routine');
      expect(formatNumberedItem('===================', 1, 3)).toBe('===================');
    });

    it('should handle null or non-string inputs safely', () => {
      expect(formatNumberedItem(null, 0, 3)).toBe('');
      expect(formatNumberedItem(undefined, 0, 3)).toBe('');
      expect(formatNumberedItem('', 0, 3)).toBe('');
    });
  });

  describe('parseHabitNameItems', () => {
    it('should return empty array for null, undefined, or empty inputs', () => {
      expect(parseHabitNameItems(null)).toEqual([]);
      expect(parseHabitNameItems(undefined)).toEqual([]);
      expect(parseHabitNameItems('')).toEqual([]);
      expect(parseHabitNameItems('   ')).toEqual([]);
      expect(parseHabitNameItems('||')).toEqual([]);
      expect(parseHabitNameItems('|| ||')).toEqual([]);
    });

    it('should split habits separated by double pipes', () => {
      const habitName = 'Exercise || Meditate - 15 Min || Yoga';
      expect(parseHabitNameItems(habitName)).toEqual(['Exercise', 'Meditate - 15 Min', 'Yoga']);
    });

    it('should split habits separated by newlines (LF and CRLF)', () => {
      const habitNameLf = 'Exercise\nMeditate\nYoga';
      expect(parseHabitNameItems(habitNameLf)).toEqual(['Exercise', 'Meditate', 'Yoga']);

      const habitNameCrlf = 'Exercise\r\nMeditate\r\nYoga';
      expect(parseHabitNameItems(habitNameCrlf)).toEqual(['Exercise', 'Meditate', 'Yoga']);
    });

    it('should return a single item array when no delimiters exist', () => {
      expect(parseHabitNameItems('Daily Reading')).toEqual(['Daily Reading']);
    });
  });

  describe('serializeBulletNotes', () => {
    const sampleItems: BulletItem[] = [
      { id: '1', text: 'First task', completed: false },
      { id: '2', text: 'Second task', completed: true },
    ];

    it('should serialize to bullets mode by default', () => {
      expect(serializeBulletNotes(sampleItems)).toBe('• First task\n• Second task');
    });

    it('should serialize to checklist mode', () => {
      expect(serializeBulletNotes(sampleItems, 'checklist')).toBe('[ ] First task\n[x] Second task');
    });

    it('should serialize to markdown-checklist mode', () => {
      expect(serializeBulletNotes(sampleItems, 'markdown-checklist')).toBe(
        '- [ ] First task\n- [x] Second task'
      );
    });

    it('should serialize to dash mode', () => {
      expect(serializeBulletNotes(sampleItems, 'dash')).toBe('- First task\n- Second task');
    });

    it('should serialize to plain text mode', () => {
      expect(serializeBulletNotes(sampleItems, 'text')).toBe('First task\nSecond task');
    });

    it('should safely handle empty or null items', () => {
      expect(serializeBulletNotes([])).toBe('');
      expect(serializeBulletNotes(null)).toBe('');
      expect(serializeBulletNotes(undefined)).toBe('');
      expect(
        serializeBulletNotes([{ id: '1', text: '' }, { id: '2', text: '   ' }] as any)
      ).toBe('');
    });
  });

  describe('addBulletToRawText & removeBulletFromRawText', () => {
    it('should append a new checklist item with proper linebreaks', () => {
      const initial = '[ ] Item 1';
      const updated = addBulletToRawText(initial, 'Item 2', 'checklist');
      expect(updated).toBe('[ ] Item 1\n[ ] Item 2');
    });

    it('should handle appending to an empty document', () => {
      expect(addBulletToRawText('', 'First Task', 'markdown-checklist')).toBe('- [ ] First Task');
    });

    it('should remove a bullet line while preserving headers, descriptions, and paragraphs', () => {
      const doc = [
        '# Morning Routine',
        'Daily habits to start the day.',
        '',
        '[ ] Drink water',
        '[ ] Stretch',
        '[ ] Meditate',
        '',
        'Have a great day!',
      ].join('\n');

      // Remove index 1: "[ ] Stretch"
      const updated = removeBulletFromRawText(doc, 1);
      const lines = updated.split('\n');

      expect(lines).toEqual([
        '# Morning Routine',
        'Daily habits to start the day.',
        '',
        '[ ] Drink water',
        '[ ] Meditate',
        '',
        'Have a great day!',
      ]);
    });

    it('should return original text if target index is out of bounds or negative', () => {
      const doc = '[ ] Item 1';
      expect(removeBulletFromRawText(doc, -1)).toBe(doc);
      expect(removeBulletFromRawText(doc, 10)).toBe(doc);
    });
  });

  describe('getBulletNotesStats', () => {
    it('should return zeros for empty or null text', () => {
      expect(getBulletNotesStats(null)).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        percent: 0,
      });
      expect(getBulletNotesStats('')).toEqual({
        total: 0,
        completed: 0,
        pending: 0,
        percent: 0,
      });
    });

    it('should correctly calculate total, completed, pending, and percentage', () => {
      const notes = [
        '- [x] Task 1',
        '- [x] Task 2',
        '- [ ] Task 3',
        '- [ ] Task 4',
      ].join('\n');

      const stats = getBulletNotesStats(notes);
      expect(stats).toEqual({
        total: 4,
        completed: 2,
        pending: 2,
        percent: 50,
      });
    });

    it('should round percent properly', () => {
      const notes = '[x] Task 1\n[ ] Task 2\n[ ] Task 3';
      const stats = getBulletNotesStats(notes);
      expect(stats.total).toBe(3);
      expect(stats.completed).toBe(1);
      expect(stats.pending).toBe(2);
      expect(stats.percent).toBe(33); // 1/3 ~ 33%
    });
  });

  describe('isBulletLine & parseBulletLine', () => {
    it('should identify valid bullet lines and reject non-bullet lines', () => {
      expect(isBulletLine('• Item')).toBe(true);
      expect(isBulletLine('- [ ] Task')).toBe(true);
      expect(isBulletLine('1. First')).toBe(true);
      expect(isBulletLine('---')).toBe(false);
      expect(isBulletLine('-5 degrees')).toBe(false);
      expect(isBulletLine('# Heading')).toBe(false);
      expect(isBulletLine('Paragraph')).toBe(false);
    });

    it('should parse line details into BulletItem', () => {
      const parsed = parseBulletLine('  - [x] Done item', 2);
      expect(parsed).toEqual({
        id: 'bullet_2',
        text: 'Done item',
        completed: true,
        raw: '  - [x] Done item',
        indent: 2,
        marker: '-',
        isCheckbox: true,
      });
    });

    it('should return null for empty or non-matching line', () => {
      expect(parseBulletLine(null)).toBeNull();
      expect(parseBulletLine('')).toBeNull();
      expect(parseBulletLine('[ ]')).toBeNull(); // Empty content
      expect(parseBulletLine('Just text')).toBeNull();
    });
  });
});


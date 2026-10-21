import { keepNoteRepository } from '../src/database/repositories/KeepNoteRepository';
import { getDatabase } from '../src/database/connection';

describe('Google Keep Notes Test Suite', () => {
  beforeAll(async () => {
    await getDatabase();
  });

  it('should create a standard text note with title and content', async () => {
    const note = await keepNoteRepository.create({
      title: 'Groceries List',
      content: 'Almond milk, oats, fresh blueberries',
      color: 'sand',
    });

    expect(note).toBeDefined();
    expect(note.id).toBeDefined();
    expect(note.title).toBe('Groceries List');
    expect(note.content).toBe('Almond milk, oats, fresh blueberries');
    expect(note.color).toBe('sand');
    expect(note.isPinned).toBe(false);
    expect(note.isArchived).toBe(false);
    expect(note.isTrashed).toBe(false);
  });

  it('should create and manage interactive checklist notes', async () => {
    const checklistItems = [
      { id: '1', text: 'Clean workstation', completed: false },
      { id: '2', text: 'Backup SQLite database', completed: true },
    ];

    const note = await keepNoteRepository.create({
      title: 'Sprint To-Do',
      type: 'checklist',
      checklistData: checklistItems,
      color: 'mint',
    });

    expect(note.type).toBe('checklist');
    expect(note.checklistData.length).toBe(2);
    expect(note.checklistData[0].text).toBe('Clean workstation');
    expect(note.checklistData[1].completed).toBe(true);

    // Toggle item completion
    const updated = await keepNoteRepository.update(note.id, {
      checklistData: [
        { id: '1', text: 'Clean workstation', completed: true },
        { id: '2', text: 'Backup SQLite database', completed: true },
      ],
    });

    expect(updated?.checklistData[0].completed).toBe(true);
  });

  it('should toggle pinning state on notes', async () => {
    const note = await keepNoteRepository.create({
      title: 'Important Idea',
      content: 'Next-gen reactive framework',
      isPinned: false,
    });

    const isPinnedNow = await keepNoteRepository.togglePin(note.id);
    expect(isPinnedNow).toBe(true);

    const reloaded = await keepNoteRepository.findById(note.id);
    expect(reloaded?.isPinned).toBe(true);

    const isUnpinnedNow = await keepNoteRepository.togglePin(note.id);
    expect(isUnpinnedNow).toBe(false);
  });

  it('should support archiving and unarchiving notes', async () => {
    const note = await keepNoteRepository.create({
      title: 'Archived Project',
      content: 'Legacy v1 system specs',
      isArchived: false,
    });

    await keepNoteRepository.setArchived(note.id, true);
    const archivedNote = await keepNoteRepository.findById(note.id);
    expect(archivedNote?.isArchived).toBe(true);
    expect(archivedNote?.isPinned).toBe(false);

    // Should appear in archived filter
    const archivedList = await keepNoteRepository.findAll({ status: 'archived' });
    expect(archivedList.some((n) => n.id === note.id)).toBe(true);

    // Unarchive
    await keepNoteRepository.setArchived(note.id, false);
    const restoredNote = await keepNoteRepository.findById(note.id);
    expect(restoredNote?.isArchived).toBe(false);
  });

  it('should move to trash and restore or delete permanently', async () => {
    const note = await keepNoteRepository.create({
      title: 'Note to Delete',
      content: 'Temporary scratch content',
    });

    await keepNoteRepository.moveToTrash(note.id);
    const trashedNote = await keepNoteRepository.findById(note.id);
    expect(trashedNote?.isTrashed).toBe(true);
    expect(trashedNote?.trashedAt).toBeDefined();

    // Restore from trash
    await keepNoteRepository.restoreFromTrash(note.id);
    const restored = await keepNoteRepository.findById(note.id);
    expect(restored?.isTrashed).toBe(false);

    // Trash again & permanent delete
    await keepNoteRepository.moveToTrash(note.id);
    const deleted = await keepNoteRepository.deletePermanently(note.id);
    expect(deleted).toBe(true);

    const checkGone = await keepNoteRepository.findById(note.id);
    expect(checkGone).toBeNull();
  });

  it('should support labels and tags filtering', async () => {
    const note = await keepNoteRepository.create({
      title: 'Work Project',
      content: 'Architecture roadmap',
      labels: ['Engineering', 'Mobile'],
    });

    const allLabels = await keepNoteRepository.getAllLabels();
    expect(allLabels).toContain('Engineering');
    expect(allLabels).toContain('Mobile');

    const filtered = await keepNoteRepository.findAll({ label: 'Engineering' });
    expect(filtered.some((n) => n.id === note.id)).toBe(true);
  });

  it('should duplicate a note', async () => {
    const note = await keepNoteRepository.create({
      title: 'Original Recipe',
      content: '2 cups flour, 1 cup milk',
      color: 'peach',
    });

    const copy = await keepNoteRepository.duplicate(note.id);
    expect(copy).not.toBeNull();
    expect(copy?.id).not.toBe(note.id);
    expect(copy?.title).toBe('Original Recipe (Copy)');
    expect(copy?.content).toBe(note.content);
    expect(copy?.color).toBe('peach');
  });

  it('should support batch actions (pin, color, archive, trash)', async () => {
    const n1 = await keepNoteRepository.create({ title: 'Batch 1' });
    const n2 = await keepNoteRepository.create({ title: 'Batch 2' });

    // Batch color
    await keepNoteRepository.batchColor([n1.id, n2.id], 'dusk');
    const r1 = await keepNoteRepository.findById(n1.id);
    const r2 = await keepNoteRepository.findById(n2.id);
    expect(r1?.color).toBe('dusk');
    expect(r2?.color).toBe('dusk');

    // Batch pin
    await keepNoteRepository.batchPin([n1.id, n2.id], true);
    expect((await keepNoteRepository.findById(n1.id))?.isPinned).toBe(true);
    expect((await keepNoteRepository.findById(n2.id))?.isPinned).toBe(true);

    // Batch trash
    await keepNoteRepository.batchTrash([n1.id, n2.id]);
    expect((await keepNoteRepository.findById(n1.id))?.isTrashed).toBe(true);
    expect((await keepNoteRepository.findById(n2.id))?.isTrashed).toBe(true);
  });

  it('should rename and delete labels across notes and custom labels', async () => {
    const n1 = await keepNoteRepository.create({
      title: 'Label Test 1',
      labels: ['Urgent', 'Work'],
    });
    const n2 = await keepNoteRepository.create({
      title: 'Label Test 2',
      labels: ['Work', 'Personal'],
    });

    // Rename 'Work' -> 'Career'
    await keepNoteRepository.renameLabel('Work', 'Career');
    const updated1 = await keepNoteRepository.findById(n1.id);
    const updated2 = await keepNoteRepository.findById(n2.id);
    expect(updated1?.labels).toContain('Career');
    expect(updated1?.labels).not.toContain('Work');
    expect(updated2?.labels).toContain('Career');
    expect(updated2?.labels).not.toContain('Work');

    // Delete 'Career'
    await keepNoteRepository.deleteLabel('Career');
    const del1 = await keepNoteRepository.findById(n1.id);
    const del2 = await keepNoteRepository.findById(n2.id);
    expect(del1?.labels).not.toContain('Career');
    expect(del2?.labels).not.toContain('Career');
  });

  it('should filter notes by color and properly escape search wildcards', async () => {
    await keepNoteRepository.create({
      title: '100% Progress Note',
      content: 'Detail with percent 100%',
      color: 'mint',
    });
    await keepNoteRepository.create({
      title: 'Standard Note',
      content: 'Regular text without symbol',
      color: 'peach',
    });

    // Color filter
    const mintNotes = await keepNoteRepository.findAll({ color: 'mint' });
    expect(mintNotes.some((n) => n.title === '100% Progress Note')).toBe(true);
    expect(mintNotes.every((n) => n.color === 'mint')).toBe(true);

    // Escaped wildcard search for literal '100%'
    const searchPercent = await keepNoteRepository.findAll({ search: '100%' });
    expect(searchPercent.length).toBeGreaterThanOrEqual(1);
    expect(searchPercent.some((n) => n.title.includes('100%'))).toBe(true);
  });
});

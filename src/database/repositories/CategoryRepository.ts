import { Category } from '../../types';
import { getDatabase } from '../connection';
import { syncEventBus } from '../../services/backup/SyncEventBus';

export class CategoryRepository {
  async findAll(): Promise<Category[]> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM categories ORDER BY name ASC');
    return result.rows.map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      createdAt: r.createdAt,
    }));
  }

  async findById(id: string): Promise<Category | null> {
    const db = await getDatabase();
    const result = await db.execute('SELECT * FROM categories WHERE id = ?', [id]);
    if (result.rows.length === 0) return null;
    const r = result.rows[0];
    return {
      id: r.id,
      name: r.name,
      color: r.color,
      icon: r.icon,
      createdAt: r.createdAt,
    };
  }

  async create(category: Category): Promise<Category> {
    const db = await getDatabase();
    await db.execute(
      'INSERT INTO categories (id, name, color, icon, createdAt) VALUES (?, ?, ?, ?, ?)',
      [category.id, category.name, category.color, category.icon, category.createdAt]
    );
    syncEventBus.notifyDataChanged({
      entityType: 'category',
      operation: 'upsert',
      id: category.id,
      item: category,
    });
    return category;
  }

  async delete(id: string): Promise<boolean> {
    const db = await getDatabase();
    const res = await db.transaction(async (tx) => {
      await tx.execute('UPDATE tasks SET categoryId = NULL WHERE categoryId = ?', [id]);
      const result = await tx.execute('DELETE FROM categories WHERE id = ?', [id]);
      return result.rowsAffected > 0;
    });
    syncEventBus.notifyDataChanged({
      entityType: 'category',
      operation: 'delete',
      id,
    });
    return res;
  }
}

export const categoryRepository = new CategoryRepository();

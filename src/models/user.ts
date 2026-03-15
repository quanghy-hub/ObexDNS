import { D1Database } from "@cloudflare/workers-types";
import { User } from "../types";

export class UserModel {
  constructor(private db: D1Database) {}

  async getById(id: string): Promise<any | null> {
    return await this.db.prepare("SELECT * FROM users WHERE id = ?").bind(id).first();
  }

  async getByUsername(username: string): Promise<any | null> {
    return await this.db.prepare("SELECT * FROM users WHERE username = ?").bind(username).first();
  }

  async listAll(): Promise<User[]> {
    const { results } = await this.db.prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC").all<User>();
    return results;
  }

  async create(user: { id: string, username: string, passwordHash: string, role: string }): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      "INSERT INTO users (id, username, hashed_password, role, created_at) VALUES (?, ?, ?, ?, ?)"
    ).bind(user.id, user.username, user.passwordHash, user.role, now).run();
    return result.success;
  }

  async updateUsername(id: string, username: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, id).run();
    return result.success;
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await this.db.prepare("UPDATE users SET hashed_password = ? WHERE id = ?").bind(passwordHash, id).run();
    return result.success;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
    return result.success;
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.db.prepare("SELECT COUNT(*) as count FROM users").first<number>('count');
    return count === 0;
  }
}

import { D1Database } from "@cloudflare/workers-types";
import { Profile, ProfileSettings, Rule, List } from "../types";

export interface ProfileWithBloom extends Profile {
  list_bloom?: string;
  list_updated_at?: number;
}

export class ProfileModel {
  constructor(private db: D1Database) {}

  async getById(id: string): Promise<ProfileWithBloom | null> {
    return await this.db.prepare("SELECT * FROM profiles WHERE id = ?")
      .bind(id)
      .first<ProfileWithBloom>();
  }

  async getRules(profileId: string): Promise<Rule[]> {
    const { results } = await this.db.prepare("SELECT * FROM rules WHERE profile_id = ? ORDER BY id DESC")
      .bind(profileId)
      .all<Rule>();
    return results;
  }

  async list(filterSql: string, params: any[]): Promise<Profile[]> {
    const { results } = await this.db.prepare(`SELECT * FROM profiles ${filterSql}`)
      .bind(...params).all<Profile>();
    return results;
  }

  async findByName(ownerId: string, name: string): Promise<Profile | null> {
    return await this.db.prepare("SELECT * FROM profiles WHERE owner_id = ? AND name = ?")
      .bind(ownerId, name).first<Profile | null>();
  }

  async create(profile: { id: string, owner_id: string, name: string, settings: ProfileSettings }): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      "INSERT INTO profiles (id, owner_id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
      .bind(profile.id, profile.owner_id, profile.name, JSON.stringify(profile.settings), now, now)
      .run();
    return result.success;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM profiles WHERE id = ?").bind(id).run();
    return result.success;
  }

  async deleteByOwner(ownerId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM profiles WHERE owner_id = ?").bind(ownerId).run();
    return result.success;
  }

  async updateName(id: string, name: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare("UPDATE profiles SET name = ?, updated_at = ? WHERE id = ?")
      .bind(name, now, id).run();
    return result.success;
  }

  async updateSettings(id: string, settings: ProfileSettings): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await this.db.prepare(
      "UPDATE profiles SET settings = ?, updated_at = ? WHERE id = ?"
    )
      .bind(JSON.stringify(settings), now, id)
      .run();
    return result.success;
  }

  async getLists(profileId: string): Promise<List[]> {
    const { results } = await this.db.prepare("SELECT * FROM lists WHERE profile_id = ?").bind(profileId).all<List>();
    return results;
  }

  async addList(profileId: string, url: string): Promise<boolean> {
    const result = await this.db.prepare("INSERT INTO lists (profile_id, url) VALUES (?, ?)").bind(profileId, url).run();
    return result.success;
  }

  async deleteList(id: number, profileId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM lists WHERE id = ? AND profile_id = ?").bind(id, profileId).run();
    return result.success;
  }

  async addRule(profileId: string, rule: Partial<Rule>): Promise<boolean> {
    const result = await this.db.prepare(
      "INSERT INTO rules (profile_id, type, pattern, v_a, v_aaaa, v_txt, v_cname) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(profileId, rule.type, rule.pattern, rule.v_a || null, rule.v_aaaa || null, rule.v_txt || null, rule.v_cname || null)
      .run();
    return result.success;
  }

  async deleteRule(id: number, profileId: string): Promise<boolean> {
    const result = await this.db.prepare("DELETE FROM rules WHERE id = ? AND profile_id = ?").bind(id, profileId).run();
    return result.success;
  }
}

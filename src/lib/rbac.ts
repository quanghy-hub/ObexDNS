import { User, Profile } from "../types";

export class RBAC {
  /**
   * 检查用户是否为管理员
   */
  static isAdmin(user: User): boolean {
    return user.role === 'admin';
  }

  /**
   * 检查用户是否有权访问特定 Profile
   */
  static canAccessProfile(user: User, profile: Profile): boolean {
    if (this.isAdmin(user)) return true;
    return profile.owner_id === user.id;
  }

  /**
   * 构造 Profile 查询的过滤条件
   * 返回 SQL 片段和绑定的参数
   */
  static getProfileFilter(user: User): { sql: string; params: any[] } {
    if (this.isAdmin(user)) {
      return { sql: "ORDER BY created_at DESC", params: [] };
    }
    return { sql: "WHERE owner_id = ? ORDER BY created_at DESC", params: [user.id] };
  }
}

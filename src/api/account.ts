import { Env, User, ExecutionContext } from "../types";
import { RBAC } from "../lib/rbac";
import { initializeLucia } from "../lib/auth";
import { generateId } from "lucia";
import { hashPassword, verifyPassword } from "../utils/crypto";
import { UserModel } from "../models/user";
import { ProfileModel } from "../models/profile";
import { LogModel } from "../models/log";

export async function handleAccountRequest(request: Request, env: Env, user: User, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 'account', ...] 或 ['api', 'admin', 'users', ...]
  const userModel = new UserModel(env.DB);
  const profileModel = new ProfileModel(env.DB);
  const logModel = new LogModel(env.DB);

  // 个人账号接口 (/api/account/...)
  if (pathParts[1] === 'account') {
    // GET /api/account/me
    if (pathParts[2] === 'me' && request.method === 'GET') {
      return new Response(JSON.stringify({
        id: user.id,
        username: user.username,
        role: user.role
      }), { headers: { 'Content-Type': 'application/json' } });
    }

    // PATCH /api/account/me (修改用户名)
    if (pathParts[2] === 'me' && request.method === 'PATCH') {
      const { username: newUsername } = await request.json() as any;
      if (!newUsername || !/^[a-zA-Z0-9]{5,15}$/.test(newUsername)) {
        return new Response("Username format error: Only 5 to 15 English letters or numbers are allowed.", { status: 400 });
      }

      try {
        await userModel.updateUsername(user.id, newUsername);
        return new Response(JSON.stringify({ success: true }));
      } catch (e: any) {
        if (e.message?.includes("UNIQUE constraint failed")) return new Response("The username is already taken", { status: 400 });
        return new Response("Failed to update username", { status: 500 });
      }
    }

    // POST /api/account/password
    if (pathParts[2] === 'password' && request.method === 'POST') {
      const { oldPassword, newPassword } = await request.json() as any;

      if (!newPassword || newPassword.length < 8 || newPassword.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
        return new Response("New password format error: Length must be at least 8 characters and include both letters and numbers.", { status: 400 });
      }
      
      // 验证旧密码
      const dbUser = await userModel.getById(user.id);
      if (!dbUser || !(await verifyPassword(oldPassword, dbUser.hashed_password))) {
        return new Response("Current password is incorrect", { status: 400 });
      }

      const hashedPassword = await hashPassword(newPassword);
      await userModel.updatePassword(user.id, hashedPassword);
      return new Response(JSON.stringify({ success: true }));
    }

    // DELETE /api/account/logs (清空该用户下所有配置的日志)
    if (pathParts[2] === 'logs' && request.method === 'DELETE') {
      await logModel.deleteByOwner(user.id);
      return new Response(JSON.stringify({ success: true }));
    }

    // DELETE /api/account/me (注销并删除账号)
    if (pathParts[2] === 'me' && request.method === 'DELETE') {
      if (RBAC.isAdmin(user)) {
        return new Response("Administrator accounts cannot be deleted directly. Please downgrade or have another administrator handle this.", { status: 400 });
      }

      // 删除关联的所有配置 (logs, rules, lists 会通过级联删除自动清理)
      await profileModel.deleteByOwner(user.id);
      // 删除用户
      await userModel.delete(user.id);

      // 清除 Session
      const lucia = initializeLucia(env.DB);
      const blankCookie = lucia.createBlankSessionCookie();
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Set-Cookie": blankCookie.serialize() }
      });
    }
  }

  // 管理员接口 (/api/admin/...)
  if (pathParts[1] === 'admin') {
    if (!RBAC.isAdmin(user)) {
      return new Response("Forbidden", { status: 403 });
    }

    // 用户管理: /api/admin/users
    if (pathParts[2] === 'users') {
      // GET /api/admin/users
      if (request.method === 'GET') {
        const users = await userModel.listAll();
        return new Response(JSON.stringify(users), { headers: { 'Content-Type': 'application/json' } });
      }

      // POST /api/admin/users (创建新用户)
      if (request.method === 'POST') {
        const { username, password, role } = await request.json() as any;
        
        if (!username || !/^[a-zA-Z0-9]{5,15}$/.test(username)) {
          return new Response("Username format error: Only 5 to 15 English letters or numbers are allowed.", { status: 400 });
        }

        if (!password || password.length < 8 || password.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
          return new Response("Password format error: Length must be at least 8 characters and include both letters and numbers.", { status: 400 });
        }

        const hashedPassword = await hashPassword(password);
        const userId = generateId(15);
        
        try {
          await userModel.create({ id: userId, username, passwordHash: hashedPassword, role: role || 'user' });
          return new Response(JSON.stringify({ id: userId }), { status: 201 });
        } catch (e: any) {
          if (e.message?.includes("UNIQUE constraint failed")) {
            return new Response("The username is already taken", { status: 400 });
          }
          return new Response("Database error", { status: 500 });
        }
      }

      // DELETE /api/admin/users/:id
      if (request.method === 'DELETE' && pathParts[3]) {
        const targetId = pathParts[3];
        if (targetId === user.id) return new Response("Cannot delete yourself", { status: 400 });
        
        await profileModel.deleteByOwner(targetId);
        await userModel.delete(targetId);
        
        return new Response(null, { status: 204 });
      }
    }
  }

  return new Response("Not Found", { status: 404 });
}

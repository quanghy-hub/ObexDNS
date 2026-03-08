import { Env, User, ExecutionContext } from "../types";
import { RBAC } from "../lib/rbac";
import { initializeLucia } from "../lib/auth";
import { generateId } from "lucia";
import { hashPassword, verifyPassword } from "../utils/crypto";

export async function handleAccountRequest(request: Request, env: Env, user: User, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean); // ['api', 'account', ...] 或 ['api', 'admin', 'users', ...]

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
        return new Response("用户名格式错误：仅限 5 至 15 位英文字母或数字", { status: 400 });
      }

      try {
        await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(newUsername, user.id).run();
        return new Response(JSON.stringify({ success: true }));
      } catch (e: any) {
        if (e.message?.includes("UNIQUE constraint failed")) return new Response("该用户名已被占用", { status: 400 });
        return new Response("更新失败", { status: 500 });
      }
    }

    // POST /api/account/password
    if (pathParts[2] === 'password' && request.method === 'POST') {
      const { oldPassword, newPassword } = await request.json() as any;

      if (!newPassword || newPassword.length < 8 || newPassword.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(newPassword)) {
        return new Response("新密码格式错误：长度至少 8 位，且必须包含字母和数字", { status: 400 });
      }
      
      // 验证旧密码
      const dbUser = await env.DB.prepare("SELECT hashed_password FROM users WHERE id = ?").bind(user.id).first<any>();
      if (!dbUser || !(await verifyPassword(oldPassword, dbUser.hashed_password))) {
        return new Response("当前密码错误", { status: 400 });
      }

      const hashedPassword = await hashPassword(newPassword);
      await env.DB.prepare("UPDATE users SET hashed_password = ? WHERE id = ?").bind(hashedPassword, user.id).run();
      return new Response(JSON.stringify({ success: true }));
    }

    // DELETE /api/account/logs (清空该用户下所有配置的日志)
    if (pathParts[2] === 'logs' && request.method === 'DELETE') {
      await env.DB.prepare("DELETE FROM logs WHERE profile_id IN (SELECT id FROM profiles WHERE owner_id = ?)").bind(user.id).run();
      return new Response(JSON.stringify({ success: true }));
    }

    // DELETE /api/account/me (注销并删除账号)
    if (pathParts[2] === 'me' && request.method === 'DELETE') {
      if (RBAC.isAdmin(user)) {
        return new Response("管理员账号不能直接删除，请先降级或由其他管理员处理", { status: 400 });
      }

      // 删除关联的所有配置 (logs, rules, lists 会通过级联删除自动清理)
      await env.DB.prepare("DELETE FROM profiles WHERE owner_id = ?").bind(user.id).run();
      
      // 删除用户
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();

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
        const { results } = await env.DB.prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC").all();
        return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
      }

      // POST /api/admin/users (创建新用户)
      if (request.method === 'POST') {
        const { username, password, role } = await request.json() as any;
        
        if (!username || !/^[a-zA-Z0-9]{5,15}$/.test(username)) {
          return new Response("用户名格式错误：仅限 5 至 15 位英文字母或数字", { status: 400 });
        }

        if (!password || password.length < 8 || password.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
          return new Response("密码格式错误：长度至少 8 位，且必须包含字母和数字", { status: 400 });
        }

        const hashedPassword = await hashPassword(password);
        const userId = generateId(15);
        
        try {
          await env.DB.prepare(
            "INSERT INTO users (id, username, hashed_password, role, created_at) VALUES (?, ?, ?, ?, ?)"
          ).bind(userId, username, hashedPassword, role || 'user', Math.floor(Date.now() / 1000)).run();
          return new Response(JSON.stringify({ id: userId }), { status: 201 });
        } catch (e: any) {
          if (e.message?.includes("UNIQUE constraint failed")) {
            return new Response("该用户名已被占用", { status: 400 });
          }
          return new Response("数据库错误", { status: 500 });
        }
      }

      // DELETE /api/admin/users/:id
      if (request.method === 'DELETE' && pathParts[3]) {
        const targetId = pathParts[3];
        if (targetId === user.id) return new Response("不能删除自己", { status: 400 });
        
        await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
        return new Response(null, { status: 204 });
      }
    }
  }

  return new Response("Not Found", { status: 404 });
}

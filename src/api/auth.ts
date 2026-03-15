import { Env } from "../types";
import { initializeLucia } from "../lib/auth";
import { generateId } from "lucia";
import { hashPassword, verifyPassword } from "../utils/crypto";

export async function handleAuthRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const lucia = initializeLucia(env.DB);

  if (url.pathname === '/api/auth/signup' && request.method === 'POST') {
    const { username, password } = await request.json() as any;
    
    if (!/^[a-zA-Z0-9]{5,15}$/.test(username)) {
      return new Response("Username format error: Only 5 to 15 English letters or numbers are allowed.", { status: 400 });
    }

    if (!password || password.length < 8 || password.length > 100 || !/(?=.*[a-zA-Z])(?=.*[0-9])/.test(password)) {
      return new Response("Password format error: Length must be at least 8 characters and include both letters and numbers.", { status: 400 });
    }

    const hashedPassword = await hashPassword(password);
    const userId = generateId(15);
    
    try {
      // 检查是否为系统中第一个用户，如果是，则赋予管理员角色
      const { results: existingUsers } = await env.DB.prepare("SELECT id FROM users LIMIT 1").all();
      const role = existingUsers.length === 0 ? 'admin' : 'user';

      await env.DB.prepare(
        "INSERT INTO users (id, username, hashed_password, role, created_at) VALUES (?, ?, ?, ?, ?)"
      ).bind(userId, username, hashedPassword, role, Math.floor(Date.now() / 1000)).run();

      const session = await lucia.createSession(userId, {});
      const sessionCookie = lucia.createSessionCookie(session.id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { 
          "Set-Cookie": sessionCookie.serialize(),
          "Content-Type": "application/json"
        }
      });
    } catch (e: any) {
      if (e.message?.includes("UNIQUE constraint failed")) {
        return new Response("The username is already taken", { status: 400 });
      }
      // 暂时返回具体的错误信息以便排查 500 错误
      return new Response(`Error creating user: ${e.message}`, { status: 500 });
    }
  }

  if (url.pathname === '/api/auth/login' && request.method === 'POST') {
    const { username, password } = await request.json() as any;
    const user = await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first<any>();
    
    if (!user || !(await verifyPassword(password, user.hashed_password))) {
      return new Response("Invalid credentials", { status: 400 });
    }

    const session = await lucia.createSession(user.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);
    return new Response(JSON.stringify({ success: true }), {
      headers: { 
        "Set-Cookie": sessionCookie.serialize(),
        "Content-Type": "application/json"
      }
    });
  }

  if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
    const cookieHeader = request.headers.get("Cookie") || "";
    const sessionId = lucia.readSessionCookie(cookieHeader);
    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }
    const blankCookie = lucia.createBlankSessionCookie();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 
        "Set-Cookie": blankCookie.serialize(),
        "Content-Type": "application/json"
      }
    });
  }

  return new Response("Not Found", { status: 404 });
}

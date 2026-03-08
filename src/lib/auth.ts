import { Lucia } from "lucia";
import { D1Adapter } from "@lucia-auth/adapter-sqlite";
import { Env, User } from "../types";
import { D1Database } from "@cloudflare/workers-types";

export function initializeLucia(db: D1Database) {
  const adapter = new D1Adapter(db, {
    user: "users",
    session: "sessions"
  });

  return new Lucia(adapter, {
    sessionCookie: {
      attributes: {
        secure: true // Workers use HTTPS
      }
    },
    getUserAttributes: (attributes) => {
      return {
        username: attributes.username,
        role: attributes.role
      };
    }
  });
}

declare module "lucia" {
  interface Register {
    Lucia: ReturnType<typeof initializeLucia>;
    DatabaseUserAttributes: Omit<User, "id">;
  }
}

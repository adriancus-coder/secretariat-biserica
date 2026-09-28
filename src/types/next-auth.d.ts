import type { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    sessionVersion?: number;
  }
  interface Session {
    user: { id: string } & DefaultSession["user"];
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    sv?: number;
  }
}

import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider, { type GoogleProfile } from "next-auth/providers/google";
import { recordMemberLogin } from "@/lib/db";

export const adminEmail = "hi423179@gmail.com";

export function hasGoogleOAuthConfig() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.NEXTAUTH_SECRET,
  );
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, profile }) {
      const googleProfile = profile as GoogleProfile | undefined;
      const email = user.email?.trim().toLowerCase();
      if (!hasGoogleOAuthConfig() || !email || googleProfile?.email_verified !== true) return false;
      await recordMemberLogin(email, user.name?.trim() || email, user.image || null);
      return true;
    },
  },
};

export async function getMemberSession() {
  const session = await getServerSession(authOptions);
  return session?.user?.email ? session : null;
}

export async function isAdminSession() {
  const session = await getMemberSession();
  return session?.user?.email?.toLowerCase() === adminEmail;
}

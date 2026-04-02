import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import prisma from './prisma';

// Extend NextAuth session types to include user.id
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

// ─── In-memory login rate limiter ───────────────────────────────────
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();

function checkLoginRateLimit(email: string): void {
  const now = Date.now();
  const key = email.toLowerCase();
  const entry = loginAttempts.get(key);

  if (entry && now - entry.firstAttempt < LOGIN_WINDOW_MS) {
    if (entry.count >= LOGIN_MAX_ATTEMPTS) {
      throw new Error('Too many login attempts. Please try again later.');
    }
    entry.count += 1;
  } else {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  }
}

function clearLoginRateLimit(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Missing credentials');
        }

        checkLoginRateLimit(credentials.email);

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error('Invalid credentials');
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.password
        );

        if (!isPasswordValid) {
          throw new Error('Invalid credentials');
        }

        clearLoginRateLimit(credentials.email);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  secret: process.env.NEXTAUTH_SECRET,
};

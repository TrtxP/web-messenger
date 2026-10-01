export type User = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  emailVerified: boolean;
  avatarPath?: string;
  about?: string;
};

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  about: string;
  avatarUrl: string | null;
};

export type ChatType = 'direct' | 'group';
export type MemberRole = 'owner' | 'admin' | 'member';

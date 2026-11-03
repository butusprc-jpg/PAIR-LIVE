/** UI boundary for a future LINE OA / WeChat OA integration.
 * LekHub reference reviewed: lib/liff.ts, lib/server/line-member.ts,
 * lib/admin-session.ts and the LINE admin login route.
 * Authentication and member lookup must be implemented separately.
 */
export type MemberProvider = 'line' | 'wechat' | 'demo';
export interface ProviderIdentity {
  provider: MemberProvider;
  providerUserId: string;
  providerChannelId?: string;
  displayName: string;
  avatarUrl?: string;
}
export interface MemberProfile {
  internalMemberId: string;
  identity: ProviderIdentity;
  demoPoints: number;
}
export interface MemberProfileGateway {
  getCurrentMember(): Promise<MemberProfile>;
  findByProviderId(provider: Exclude<MemberProvider, 'demo'>, providerUserId: string, providerChannelId?: string): Promise<MemberProfile | null>;
  /** Resolve a returning OA user to the same internalMemberId; create only if absent. */
  resolveOrCreateMember(identity: ProviderIdentity): Promise<MemberProfile>;
}
export const mockMember: MemberProfile = {
  internalMemberId: 'PL-000148',
  identity: {provider: 'demo', providerUserId: 'demo-member-148', displayName: 'สมาชิก PAIR LIVE'},
  demoPoints: 1250,
};

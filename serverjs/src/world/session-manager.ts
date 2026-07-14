export interface SessionState {
  sessionId: number;
  ip: string;
  authenticated: boolean;
  accountId: number | null;
  characterName: string | null;
  zoneId: number;
  instanceId: number;
}

export class SessionManager {
  private readonly sessions = new Map<number, SessionState>();

  create(sessionId: number, ip: string): SessionState {
    const state: SessionState = {
      sessionId,
      ip,
      authenticated: false,
      accountId: null,
      characterName: null,
      zoneId: -1,
      instanceId: 0,
    };

    this.sessions.set(sessionId, state);
    return state;
  }

  remove(sessionId: number): void {
    this.sessions.delete(sessionId);
  }

  get(sessionId: number): SessionState | undefined {
    return this.sessions.get(sessionId);
  }

  updateZone(sessionId: number, zoneId: number, instanceId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.zoneId = zoneId;
    session.instanceId = instanceId;
  }

  authenticate(sessionId: number, accountId: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.authenticated = true;
    session.accountId = accountId;
  }

  selectCharacter(sessionId: number, characterName: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.characterName = characterName;
  }
}

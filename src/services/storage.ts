import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, deleteCloudImage } from './firebase';
import { Challenge, Trade, Milestone, MilestoneStatus } from '../types';
import { getSavedUserSession, getCachedUsers } from '../data/auth';


function createInitialMilestones(challengeId: string, count: number = 150): Milestone[] {
  const list: Milestone[] = [];
  for (let i = 1; i <= count; i++) {
    list.push({
      id: `${challengeId}_milestone_${i}`,
      challengeId,
      milestoneNumber: i,
      profitCents: null,
      balanceCents: null,
      status: 'PENDING',
      tradeId: null,
      timestamp: null,
      attachmentPath: null,
    });
  }
  return list;
}

function createDefaultChallenge(userId: number, userName: string = '', timestamp: number = Date.now()): Challenge {
  return {
    id: `challenge_u${userId}_${timestamp || 1}`,
    userId,
    userName,
    initialCapitalCents: 10000,
    currentBalanceCents: 10000,
    targetBalanceCents: 300000,
    tradeCount: 0,
    challengeStarted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function rebuildMilestonesFromTrades(challengeId: string, trades: Trade[]): Milestone[] {
  const lossCount = trades.filter((t) => t.type === 'LOSS').length;
  const milestones = createInitialMilestones(challengeId, 150 + lossCount);

  for (const trade of trades) {
    const idx = trade.tradeNumber - 1;
    if (idx >= 0 && idx < milestones.length) {
      milestones[idx] = {
        id: `${challengeId}_milestone_${trade.tradeNumber}`,
        challengeId,
        milestoneNumber: trade.tradeNumber,
        profitCents: trade.resultCents,
        balanceCents: trade.newBalanceCents,
        status: trade.type as MilestoneStatus,
        tradeId: trade.id,
        timestamp: trade.timestamp,
        attachmentPath:
          trade.attachmentPath && !trade.attachmentPath.startsWith('data:')
            ? trade.attachmentPath
            : null,
      };
    }
  }

  return milestones;
}

export class StorageService {
  private static isSubmitting = false;
  private static activeUserId: number = getSavedUserSession()?.id || 0;
  private static activeUserName: string = getSavedUserSession()?.displayName || '';

  private static getChallengeKey(userId: number): string {
    return `sami_u_${userId}_challenge_v3`;
  }

  private static getTradesKey(userId: number): string {
    return `sami_u_${userId}_trades_v3`;
  }

  private static getMilestonesKey(userId: number): string {
    return `sami_u_${userId}_milestones_v3`;
  }

  public static setCurrentUser(userId: number | null, displayName: string = ''): void {
    this.activeUserId = userId ?? 0;
    this.activeUserName = displayName;
  }

  public static getActiveUserId(): number {
    if (!this.activeUserId) {
      const saved = getSavedUserSession();
      if (saved) {
        this.activeUserId = saved.id;
        this.activeUserName = saved.displayName;
      }
    }
    return this.activeUserId;
  }

  public static hasLocalChallenge(userId: number): boolean {
    if (!userId) return false;
    try {
      return Boolean(
        localStorage.getItem(this.getChallengeKey(userId)) ||
        localStorage.getItem(`sami_u_${userId}_challenge_v2`) ||
        localStorage.getItem(`sami_challenge_v2`) ||
        localStorage.getItem(`sami_challenge_v1`)
      );
    } catch {
      return false;
    }
  }

  public static getChallenge(): Challenge {
    const userId = this.getActiveUserId();
    if (!userId) return createDefaultChallenge(0, '', 0);
    try {
      const candidateKeys = [
        this.getChallengeKey(userId),
        `sami_u_${userId}_challenge_v2`,
        `sami_challenge_v2`,
        `sami_challenge_u${userId}`,
        `sami_challenge_v1`,
      ];
      for (const key of candidateKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.id) {
            if (!parsed.userName && this.activeUserName) {
              parsed.userName = this.activeUserName;
            }
            if (parsed.userId === undefined) {
              parsed.userId = userId;
            }
            return parsed;
          }
        }
      }
    } catch (err) {
      console.error('Failed to load user challenge', err);
    }
    return createDefaultChallenge(userId, this.activeUserName, 0);
  }

  public static saveChallenge(challenge: Challenge, skipTimestamp = false): void {
    const userId = this.getActiveUserId();
    if (userId) {
      try {
        if (!skipTimestamp) {
          challenge.updatedAt = Date.now();
        }
        localStorage.setItem(this.getChallengeKey(userId), JSON.stringify(challenge));
        // Backwards compatibility
        localStorage.setItem(`sami_u_${userId}_challenge_v2`, JSON.stringify(challenge));
      } catch (err) {
        console.error('Failed to save user challenge', err);
      }
    }
  }

  public static getTrades(): Trade[] {
    const userId = this.getActiveUserId();
    if (!userId) return [];
    try {
      const candidateKeys = [
        this.getTradesKey(userId),
        `sami_u_${userId}_trades_v2`,
        `sami_trades_v2`,
        `sami_trades_u${userId}`,
        `sami_trades_v1`,
      ];
      for (const key of candidateKeys) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load user trades', err);
    }
    return [];
  }

  public static saveTrades(trades: Trade[]): void {
    const userId = this.getActiveUserId();
    if (userId) {
      try {
        const sanitized = trades.map((t) => ({
          ...t,
          attachmentPath:
            t.attachmentPath && !t.attachmentPath.startsWith('data:')
              ? t.attachmentPath
              : null,
        }));
        localStorage.setItem(this.getTradesKey(userId), JSON.stringify(sanitized));
      } catch (err) {
        console.error('Failed to save user trades', err);
      }
    }
  }

  public static getMilestones(challengeId?: string): Milestone[] {
    const userId = this.getActiveUserId();
    if (!userId) return createInitialMilestones(challengeId || 'inactive');

    const trades = this.getTrades();
    const expectedCount = 150 + trades.filter((t) => t.type === 'LOSS').length;

    try {
      const raw = localStorage.getItem(this.getMilestonesKey(userId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === expectedCount) {
          return parsed;
        }
      }
    } catch (err) {
      console.error('Failed to load user milestones', err);
    }

    const currentChallenge = this.getChallenge();
    const rebuilt = rebuildMilestonesFromTrades(challengeId || currentChallenge.id, trades);
    if (this.hasLocalChallenge(userId)) {
      this.saveMilestones(rebuilt);
    }
    return rebuilt;
  }

  public static saveMilestones(milestones: Milestone[]): void {
    const userId = this.getActiveUserId();
    if (userId) {
      try {
        const sanitized = milestones.map((m) => ({
          ...m,
          attachmentPath:
            m.attachmentPath && !m.attachmentPath.startsWith('data:')
              ? m.attachmentPath
              : null,
        }));
        localStorage.setItem(this.getMilestonesKey(userId), JSON.stringify(sanitized));
      } catch (err) {
        console.error('Failed to save user milestones', err);
      }
    }
  }

  public static async syncToFirestore(
    challenge: Challenge,
    trades: Trade[],
    milestones: Milestone[]
  ): Promise<void> {
    const userId = this.getActiveUserId();
    if (!userId) return;

    const username =
      getCachedUsers().find((u) => u.id === userId)?.username ||
      challenge.userName ||
      this.activeUserName;

    const tradesData = trades.map((t) => ({
      id: t.id,
      challengeId: t.challengeId,
      tradeNumber: t.tradeNumber,
      resultCents: t.resultCents,
      oldBalanceCents: t.oldBalanceCents,
      newBalanceCents: t.newBalanceCents,
      type: t.type,
      attachmentPath:
        t.attachmentPath && !t.attachmentPath.startsWith('data:')
          ? t.attachmentPath
          : null,
      timestamp: t.timestamp,
    }));

    const winCount = tradesData.filter((t) => t.type === 'WIN').length;
    const lossCount = tradesData.filter((t) => t.type === 'LOSS').length;
    const expectedCount = 150 + lossCount;

    const milestonesData = (
      milestones && milestones.length === expectedCount
        ? milestones
        : rebuildMilestonesFromTrades(challenge.id, trades)
    ).map((m) => ({
      id: m.id,
      challengeId: m.challengeId,
      milestoneNumber: m.milestoneNumber,
      profitCents: m.profitCents,
      balanceCents: m.balanceCents,
      status: m.status,
      tradeId: m.tradeId,
      timestamp: m.timestamp,
      attachmentPath:
        m.attachmentPath && !m.attachmentPath.startsWith('data:')
          ? m.attachmentPath
          : null,
    }));

    const remainingWins = Math.max(0, 150 - winCount);
    const now = Math.floor(challenge.updatedAt || Date.now());

    try {
      const docRef = doc(db, 'user_challenges', String(userId));
      await setDoc(docRef, {
        userId,
        username,
        challenge: { ...challenge, updatedAt: now },
        completedCount: winCount,
        remainingCount: remainingWins,
        failedCount: lossCount,
        trades: tradesData,
        milestones: milestonesData,
        settings: {
          userName: challenge.userName || username,
          initialCapitalCents: challenge.initialCapitalCents,
          targetBalanceCents: challenge.targetBalanceCents,
        },
        updatedAt: now,
      });
    } catch (err) {
      console.warn('Firestore user challenge sync error:', err);
    }
  }

  public static applyCloudDataToLocal(data: any): boolean {
    if (!data || !data.challenge) return false;
    const cloudChallenge = data.challenge as Challenge;
    const cloudTrades = (Array.isArray(data.trades) ? data.trades : []) as Trade[];
    const lossCount = cloudTrades.filter((t) => t.type === 'LOSS').length;
    const expectedCount = 150 + lossCount;
    const cloudMilestones = (
      Array.isArray(data.milestones) && data.milestones.length === expectedCount
        ? data.milestones
        : rebuildMilestonesFromTrades(cloudChallenge.id, cloudTrades)
    ) as Milestone[];

    const currentChallenge = this.getChallenge();
    if ((cloudChallenge.updatedAt || 0) >= (currentChallenge.updatedAt || 0)) {
      this.saveChallenge(cloudChallenge, true);
      this.saveTrades(cloudTrades);
      this.saveMilestones(cloudMilestones);
      return true;
    }
    return false;
  }

  public static async loadUserFromCloud(
    userId: number,
    displayName: string = ''
  ): Promise<{ challenge: Challenge; trades: Trade[]; milestones: Milestone[] }> {
    this.setCurrentUser(userId, displayName);
    const docRef = doc(db, 'user_challenges', String(userId));

    try {
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        this.applyCloudDataToLocal(data);
      } else if (this.hasLocalChallenge(userId)) {
        // Document doesn't exist on cloud yet, but user has valid local challenge. Keep local data safe!
        const ch = this.getChallenge();
        const tr = this.getTrades();
        const ml = this.getMilestones(ch.id);
        void this.syncToFirestore(ch, tr, ml);
      } else {
        // Only if truly brand new user with no local challenge
        const newChallenge = createDefaultChallenge(userId, displayName, Date.now());
        const initialMilestones = createInitialMilestones(newChallenge.id);
        this.saveChallenge(newChallenge, true);
        this.saveTrades([]);
        this.saveMilestones(initialMilestones);
        void this.syncToFirestore(newChallenge, [], initialMilestones);
      }
    } catch (err) {
      console.warn('Failed to fetch user cloud data on login (using local cache):', err);
      // CRITICAL: On error (e.g. quota exhausted), NEVER initialize default empty data or overwrite!
    }

    const challenge = this.getChallenge();
    return {
      challenge,
      trades: this.getTrades(),
      milestones: this.getMilestones(challenge.id),
    };
  }

  public static subscribeToUserCloudData(
    userId: number,
    displayName: string,
    onDataUpdated: () => void
  ): () => void {
    this.setCurrentUser(userId, displayName);
    const docRef = doc(db, 'user_challenges', String(userId));

    return onSnapshot(
      docRef,
      (snap) => {
        if (!snap.exists()) {
          // Document does not exist on cloud yet - keep local data safe!
          return;
        }
        const data = snap.data();
        if (this.applyCloudDataToLocal(data)) {
          onDataUpdated();
        }
      },
      (err) => {
        console.warn('Failed to subscribe to user cloud data (quota or offline):', err);
        // CRITICAL: Never reset data or wipe milestones on error!
      }
    );
  }

  public static updateSettings(
    userName: string,
    initialCapitalCents: number,
    targetBalanceCents: number
  ): Challenge {
    const challenge = this.getChallenge();
    challenge.userName = userName.trim() || this.activeUserName;
    challenge.targetBalanceCents = targetBalanceCents;
    if (!challenge.challengeStarted) {
      challenge.initialCapitalCents = initialCapitalCents;
      challenge.currentBalanceCents = initialCapitalCents;
    }
    this.saveChallenge(challenge);
    const trades = this.getTrades();
    const milestones = this.getMilestones(challenge.id);
    void this.syncToFirestore(challenge, trades, milestones);
    return challenge;
  }

  public static startChallenge(initialCapital?: number): Challenge {
    const challenge = this.getChallenge();
    const capital = initialCapital ?? challenge.initialCapitalCents;
    challenge.initialCapitalCents = capital;
    challenge.currentBalanceCents = capital;
    challenge.tradeCount = 0;
    challenge.challengeStarted = true;
    challenge.updatedAt = Date.now();

    const milestones = createInitialMilestones(challenge.id);
    this.saveChallenge(challenge, true);
    this.saveTrades([]);
    this.saveMilestones(milestones);
    void this.syncToFirestore(challenge, [], milestones);
    return challenge;
  }

  public static recordTrade(
    resultCents: number,
    attachmentUrl: string | null = null,
    note?: string
  ): { challenge: Challenge; trade: Trade; milestone: Milestone } {
    if (this.isSubmitting) {
      throw new Error('عملية التسجيل قيد التنفيذ، يرجى الانتظار.');
    }
    this.isSubmitting = true;

    try {
      const challenge = this.getChallenge();
      if (!challenge.challengeStarted) {
        throw new Error('يجب بدء الرحلة أولاً.');
      }
      if (resultCents === 0) {
        throw new Error('لا يمكن أن تكون نتيجة الصفقة صفراً.');
      }

      const trades = this.getTrades();
      if (trades.filter((t) => t.type === 'WIN').length >= 150) {
        throw new Error('تم إكمال جميع محطات الرحلة الـ150.');
      }

      const milestones = this.getMilestones(challenge.id);
      const oldBalance = challenge.currentBalanceCents;
      const newBalance = oldBalance + resultCents;
      const tradeNumber = challenge.tradeCount + 1;
      const type = resultCents > 0 ? 'WIN' : 'LOSS';
      const timestamp = Date.now();
      const tradeId = `trade_${tradeNumber}_${timestamp}`;
      const sanitizedAttachment =
        attachmentUrl && !attachmentUrl.startsWith('data:') ? attachmentUrl : null;

      const trade: Trade = {
        id: tradeId,
        challengeId: challenge.id,
        tradeNumber,
        resultCents,
        oldBalanceCents: oldBalance,
        newBalanceCents: newBalance,
        type,
        attachmentPath: sanitizedAttachment,
        timestamp,
      };

      const milestoneIdx = tradeNumber - 1;
      if (milestones[milestoneIdx]) {
        milestones[milestoneIdx] = {
          ...milestones[milestoneIdx],
          profitCents: resultCents,
          balanceCents: newBalance,
          status: type,
          tradeId,
          timestamp,
          attachmentPath: sanitizedAttachment,
        };
      }

      if (type === 'LOSS') {
        const nextMilestoneNumber = milestones.length + 1;
        milestones.push({
          id: `${challenge.id}_milestone_${nextMilestoneNumber}`,
          challengeId: challenge.id,
          milestoneNumber: nextMilestoneNumber,
          profitCents: null,
          balanceCents: null,
          status: 'PENDING',
          tradeId: null,
          timestamp: null,
          attachmentPath: null,
        });
      }

      challenge.currentBalanceCents = newBalance;
      challenge.tradeCount = tradeNumber;
      challenge.updatedAt = timestamp;

      trades.push(trade);
      this.saveTrades(trades);
      this.saveMilestones(milestones);
      this.saveChallenge(challenge, true);
      void this.syncToFirestore(challenge, trades, milestones);

      return {
        challenge,
        trade,
        milestone: milestones[milestoneIdx],
      };
    } finally {
      this.isSubmitting = false;
    }
  }

  public static async deleteTrade(tradeId: string): Promise<Challenge> {
    const challenge = this.getChallenge();
    const trades = this.getTrades();
    const target = trades.find((t) => t.id === tradeId);
    if (target?.attachmentPath) {
      await deleteCloudImage(target.attachmentPath).catch(() => {});
    }


    const remainingTrades = trades
      .filter((t) => t.id !== tradeId)
      .sort((a, b) => a.tradeNumber - b.tradeNumber);

    let runningBalance = challenge.initialCapitalCents;
    const renumberedTrades: Trade[] = remainingTrades.map((t, idx) => {
      const oldB = runningBalance;
      const newB = oldB + t.resultCents;
      runningBalance = newB;
      return {
        ...t,
        tradeNumber: idx + 1,
        oldBalanceCents: oldB,
        newBalanceCents: newB,
      };
    });

    challenge.currentBalanceCents = runningBalance;
    challenge.tradeCount = renumberedTrades.length;
    challenge.updatedAt = Date.now();

    const rebuiltMilestones = rebuildMilestonesFromTrades(challenge.id, renumberedTrades);
    this.saveChallenge(challenge, true);
    this.saveTrades(renumberedTrades);
    this.saveMilestones(rebuiltMilestones);
    await this.syncToFirestore(challenge, renumberedTrades, rebuiltMilestones);

    return challenge;
  }

  public static resetChallenge(): Challenge {
    const challenge = this.getChallenge();
    challenge.currentBalanceCents = challenge.initialCapitalCents;
    challenge.tradeCount = 0;
    challenge.updatedAt = Date.now();

    const milestones = createInitialMilestones(challenge.id);
    this.saveChallenge(challenge, true);
    this.saveTrades([]);
    this.saveMilestones(milestones);
    void this.syncToFirestore(challenge, [], milestones);
    return challenge;
  }

  public static startNewChallenge(newInitialCapital: number): Challenge {
    const userId = this.getActiveUserId();
    const challenge = this.getChallenge();
    const now = Date.now();

    challenge.id = `challenge_u${userId}_${now}`;
    challenge.initialCapitalCents = newInitialCapital;
    challenge.currentBalanceCents = newInitialCapital;
    challenge.tradeCount = 0;
    challenge.challengeStarted = true;
    challenge.createdAt = now;
    challenge.updatedAt = now;

    const milestones = createInitialMilestones(challenge.id);
    this.saveChallenge(challenge, true);
    this.saveTrades([]);
    this.saveMilestones(milestones);
    void this.syncToFirestore(challenge, [], milestones);
    return challenge;
  }
}

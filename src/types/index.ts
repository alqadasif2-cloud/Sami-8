export type UserRole = 'owner' | 'moderator' | 'user' | 'guest';

export type ActiveTab =
  | 'dashboard'
  | 'admin'
  | 'channels'
  | 'history'
  | 'roadmap'
  | 'settings'
  | 'private_chat';

export type TradeType = 'WIN' | 'LOSS';
export type MilestoneStatus = 'PENDING' | 'WIN' | 'LOSS';

export interface Challenge {
  id: string;
  userId: number;
  userName: string;
  initialCapitalCents: number;
  currentBalanceCents: number;
  targetBalanceCents: number;
  tradeCount: number;
  challengeStarted: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  challengeId: string;
  tradeNumber: number;
  resultCents: number;
  oldBalanceCents: number;
  newBalanceCents: number;
  type: TradeType;
  attachmentPath?: string | null;
  timestamp: number;
}

export interface Milestone {
  id: string;
  challengeId: string;
  milestoneNumber: number;
  profitCents: number | null;
  balanceCents: number | null;
  status: MilestoneStatus;
  tradeId: string | null;
  timestamp: number | null;
  attachmentPath: string | null;
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  isPrivate: boolean;
  visibility: 'public' | 'hidden';
  allowedMemberIds: number[];
  memberIds: number[];
  createdAt: number;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  senderId: number;
  senderName: string;
  senderRole: string;
  senderAvatarUrl?: string | null;
  text?: string;
  imageUrl?: string;
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  fileUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  replyToId?: string | null;
  replyToText?: string | null;
  replyToSenderName?: string | null;
  isDeleted?: boolean;
  timestamp: number;
}

export interface PrivateMessage {
  id: string;
  senderId: number;
  receiverId: number;
  senderName: string;
  senderRole: string;
  text?: string;
  imageUrl?: string;
  storagePath?: string;
  audioUrl?: string;
  fileUrl?: string;
  fileName?: string;
  timestamp: number;
}

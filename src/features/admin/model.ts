export type MemberStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN";

export type MessageReportReason =
  | "ABUSE"
  | "SPAM"
  | "SEXUAL_CONTENT"
  | "OTHER";

export interface PageMetadata {
  size: number;
  number: number;
  totalElements: number;
  totalPages: number;
}

export interface PageResponse<T> {
  content: T[];
  page: PageMetadata;
}

export interface MessageReportSummary {
  reportId: number;
  reason: MessageReportReason;
  reporterId: number;
  reporterNickname: string;
  reportedMemberId: number;
  reportedMemberNickname: string;
  reportedMemberStatus: MemberStatus;
  messageId: number;
  createdAt: string;
}

export interface ReportAttachment {
  attachmentId: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface MessageReportDetail {
  reportId: number;
  reason: MessageReportReason;
  details: string | null;
  reportedAt: string;
  reporterId: number;
  reporterNickname: string;
  reportedMemberId: number;
  reportedMemberEmail: string;
  reportedMemberNickname: string;
  reportedMemberStatus: MemberStatus;
  roomId: number;
  messageId: number;
  messageType: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  messageContent: string | null;
  attachment: ReportAttachment | null;
  messageCreatedAt: string;
  messageEditedAt: string | null;
  messageDeleted: boolean;
}

export const reportReasonLabels: Record<MessageReportReason, string> = {
  ABUSE: "욕설 및 비방",
  SPAM: "스팸",
  SEXUAL_CONTENT: "성적 콘텐츠",
  OTHER: "기타",
};

export const memberStatusLabels: Record<MemberStatus, string> = {
  ACTIVE: "활성",
  SUSPENDED: "정지",
  WITHDRAWN: "탈퇴",
};


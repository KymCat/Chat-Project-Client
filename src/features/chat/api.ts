import { httpClient } from "../../shared/api/httpClient";

export interface ChatRoomCreateRequest {
  name: string;
}

export interface ChatRoomCreateResponse {
  roomId: number;
  type: "GROUP";
  name: string;
}

export interface ChatRoomResponse {
  roomId: number;
  type: "DIRECT" | "GROUP";
  name: string | null;
  role: "OWNER" | "MEMBER";
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface GroupChatRoomResponse {
  roomId: number;
  name: string;
  lastMessageAt: string | null;
}

export interface ChatRoomMemberResponse {
  memberId: number;
  displayName: string;
  role: "OWNER" | "MEMBER";
  joinedAt: string;
}

export interface ChatRoomOwnerTransferRequest {
  newOwnerMemberId: number;
}

export interface ChatRoomNameUpdateRequest {
  name: string;
}

export interface ChatMessage {
  messageId: number;
  roomId: number;
  senderId: number | null;
  senderNickname: string | null;
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export type ChatMessageEventType = "CREATED" | "UPDATED" | "DELETED";

export interface ChatMessageEvent {
  eventType: ChatMessageEventType;
  message: ChatMessage;
}

export interface ChatRoomEvent {
  eventType: "UPDATED" | "DELETED";
  roomId: number;
  name: string | null;
}

export interface CursorPageResponse<T> {
  content: T[];
  nextCursor: number | null;
  hasNext: boolean;
}

export const chatRoomApi = {
  create: (request: ChatRoomCreateRequest) =>
    httpClient.post<ChatRoomCreateResponse>("/chat-rooms", request),
  getAll: () => httpClient.get<ChatRoomResponse[]>("/chat-rooms"),
  getAvailable: () =>
    httpClient.get<GroupChatRoomResponse[]>("/chat-rooms/available"),
  join: (roomId: number) =>
    httpClient.post<void>(`/chat-rooms/${roomId}/members`),
  leave: (roomId: number) =>
    httpClient.delete<void>(`/chat-rooms/${roomId}/members`),
  getMembers: (roomId: number) =>
    httpClient.get<ChatRoomMemberResponse[]>(`/chat-rooms/${roomId}/members`),
  transferOwnership: (
    roomId: number,
    request: ChatRoomOwnerTransferRequest,
  ) => httpClient.patch<void>(`/chat-rooms/${roomId}/owner`, request),
  updateName: (roomId: number, request: ChatRoomNameUpdateRequest) =>
    httpClient.patch<void>(`/chat-rooms/${roomId}`, request),
  deleteRoom: (roomId: number) =>
    httpClient.delete<void>(`/chat-rooms/${roomId}`),
  updateReadPosition: (roomId: number, lastReadMessageId: number) =>
    httpClient.patch<void>(`/chat-rooms/${roomId}/read-position`, {
      lastReadMessageId,
    }),
  deleteMessage: (roomId: number, messageId: number) =>
    httpClient.delete<void>(`/chat-rooms/${roomId}/messages/${messageId}`),
  editMessage: (roomId: number, messageId: number, content: string) =>
    httpClient.patch<void>(`/chat-rooms/${roomId}/messages/${messageId}`, {
      content,
    }),
  getMessages: (
    roomId: number,
    beforeMessageId: number | null = null,
    size = 30,
  ) => {
    const searchParams = new URLSearchParams({ size: String(size) });
    if (beforeMessageId !== null) {
      searchParams.set("beforeMessageId", String(beforeMessageId));
    }

    return httpClient.get<CursorPageResponse<ChatMessage>>(
      `/chat-rooms/${roomId}/messages?${searchParams.toString()}`,
    );
  },
};

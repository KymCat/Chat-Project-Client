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

export interface ChatMessage {
  messageId: number;
  roomId: number;
  senderId: number | null;
  senderNickname: string | null;
  type: "TEXT" | "IMAGE" | "FILE" | "SYSTEM";
  content: string;
  createdAt: string;
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
    httpClient.post<GroupChatRoomResponse>(`/chat-rooms/${roomId}/members`),
  leave: (roomId: number) =>
    httpClient.delete<void>(`/chat-rooms/${roomId}/members`),
  getMembers: (roomId: number) =>
    httpClient.get<ChatRoomMemberResponse[]>(`/chat-rooms/${roomId}/members`),
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

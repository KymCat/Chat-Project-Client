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

export const chatRoomApi = {
  create: (request: ChatRoomCreateRequest) =>
    httpClient.post<ChatRoomCreateResponse>("/chat-rooms", request),
  getAll: () => httpClient.get<ChatRoomResponse[]>("/chat-rooms"),
  getAvailable: () =>
    httpClient.get<GroupChatRoomResponse[]>("/chat-rooms/available"),
  join: (roomId: number) =>
    httpClient.post<GroupChatRoomResponse>(`/chat-rooms/${roomId}/members`),
};

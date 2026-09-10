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

export const chatRoomApi = {
  create: (request: ChatRoomCreateRequest) =>
    httpClient.post<ChatRoomCreateResponse>("/chat-rooms", request),
  getAll: () => httpClient.get<ChatRoomResponse[]>("/chat-rooms"),
};

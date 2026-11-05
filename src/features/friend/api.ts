import { httpClient } from "../../shared/api/httpClient";
import type { MemberStatus } from "../member/api";

export interface FriendListResponse {
  memberId: number;
  displayName: string;
  statusMessage: string | null;
  status: MemberStatus;
}

export interface FriendRequestResponse {
  requestId: number;
  targetMemberId: number;
  targetDisplayName: string;
  createdAt: string;
}

export interface CursorPageResponse<T> {
  content: T[];
  nextCursor: number | null;
  hasNext: boolean;
}

function requestListPath(
  direction: "sent" | "received",
  beforeFriendshipId?: number,
) {
  const query = new URLSearchParams({ size: "30" });
  if (beforeFriendshipId !== undefined) {
    query.set("beforeFriendshipId", String(beforeFriendshipId));
  }

  return `/friends/requests/${direction}?${query.toString()}`;
}

export const friendApi = {
  request: (targetMemberId: number) =>
    httpClient.post<void>("/friends/requests", { targetMemberId }),
  getFriends: () =>
    httpClient.get<FriendListResponse[]>("/friends/me"),
  getSentRequests: (beforeFriendshipId?: number) =>
    httpClient.get<CursorPageResponse<FriendRequestResponse>>(
      requestListPath("sent", beforeFriendshipId),
    ),
  getReceivedRequests: (beforeFriendshipId?: number) =>
    httpClient.get<CursorPageResponse<FriendRequestResponse>>(
      requestListPath("received", beforeFriendshipId),
    ),
  acceptRequest: (requestId: number) =>
    httpClient.post<void>(`/friends/requests/${requestId}/accept`),
  deleteRequest: (requestId: number) =>
    httpClient.delete<void>(`/friends/requests/${requestId}`),
  unfollow: (targetMemberId: number) =>
    httpClient.delete<void>(`/friends/unfollow/${targetMemberId}`),
};

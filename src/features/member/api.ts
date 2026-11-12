import { httpClient } from "../../shared/api/httpClient";

export interface MemberProfileResponse {
  nickname: string;
  email: string;
  statusMessage: string | null;
  status: MemberStatus;
  usesStoredProfileImage: boolean;
}

export type ProfileRelationStatus =
  | "ACCEPTED"
  | "NONE"
  | "PENDING_SENT"
  | "PENDING_RECEIVED"
  | "SELF";

export type MemberStatus = "ACTIVE" | "SUSPENDED" | "WITHDRAWN";

export interface MemberPublicProfileResponse {
  memberId: number;
  displayName: string;
  statusMessage: string | null;
  relationStatus: ProfileRelationStatus;
  status: MemberStatus;
}

export type SocialProvider = "GOOGLE";

export const memberApi = {
  getProfile: () => httpClient.get<MemberProfileResponse>("/member/me"),
  getPublicProfile: (memberId: number) =>
    httpClient.get<MemberPublicProfileResponse>(`/member/${memberId}/profile`),
  getProfileImage: (memberId: number, revision?: number) =>
    httpClient.getBlob(
      `/member/${memberId}/profile-image${revision ? `?v=${revision}` : ""}`,
    ),
  uploadProfileImage: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    return httpClient.putForm<void>("/member/me/profile-image", formData);
  },
  applySocialProfileImage: (provider: SocialProvider) =>
    httpClient.put<void>("/member/me/profile-image/social", { provider }),
  deleteProfileImage: () =>
    httpClient.delete<void>("/member/me/profile-image"),
  updateNickname: (newNickname: string) =>
    httpClient.patch<void>("/member/me/nickname", { newNickname }),
  updateStatusMessage: (newStatusMessage: string | null) =>
    httpClient.patch<void>("/member/me/status-message", { newStatusMessage }),
  changePassword: (
    newPassword: string,
    reauthenticationToken: string,
  ) =>
    httpClient.patch<void>(
      "/member/me/password",
      { newPassword },
      {
        headers: {
          "X-Reauthentication-Token": reauthenticationToken,
        },
        retryOnUnauthorized: false,
      },
    ),
  withdrawAccount: (reauthenticationToken: string) =>
    httpClient.patch<void>(
      "/member/me/withdraw",
      undefined,
      {
        headers: {
          "X-Reauthentication-Token": reauthenticationToken,
        },
        retryOnUnauthorized: false,
      },
    ),
};

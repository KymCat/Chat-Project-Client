import { httpClient } from "../../shared/api/httpClient";

export interface MemberProfileResponse {
  nickname: string;
  email: string;
}

export const memberApi = {
  getProfile: () => httpClient.get<MemberProfileResponse>("/member/me"),
};

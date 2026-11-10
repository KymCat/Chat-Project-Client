import {
  Fragment,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Link } from "react-router-dom";
import "../styles/chat.css";
import { useAuth } from "../app/AuthProvider";
import { EmailVerificationPanel } from "../features/auth/EmailVerificationPanel";
import {
  authApi,
  type ReauthenticationMethodResponse,
} from "../features/auth/api";
import { AttachmentMessageContent } from "../features/chat/AttachmentMessageContent";
import { ChatAvatar } from "../features/chat/ChatAvatar";
import { MessageComposer } from "../features/chat/MessageComposer";
import {
  chatRoomApi,
  type ChatErrorEvent,
  type ChatMessage,
  type ChatMessageEvent,
  type ChatRoomEvent,
  type ChatRoomInviteLinkResponse,
  type ChatRoomMemberResponse,
  type ChatRoomResponse,
  type DirectChatResponse,
  type GroupChatRoomResponse,
  type InviteLinkExpiration,
} from "../features/chat/api";
import { connectChat } from "../features/chat/stompClient";
import {
  friendApi,
  type CursorPageResponse,
  type FriendListResponse,
  type FriendRequestResponse,
} from "../features/friend/api";
import {
  memberApi,
  type MemberProfileResponse,
  type MemberPublicProfileResponse,
  type MemberStatus,
} from "../features/member/api";
import { API_BASE_URL } from "../shared/config/env";
import { readAccessToken } from "../shared/auth/token";
import { ApiError } from "../shared/api/httpClient";

interface MessagePageState {
  initialized: boolean;
  isLoading: boolean;
  hasNext: boolean;
  nextCursor: number | null;
  error: string;
}

interface PendingHistoryScroll {
  roomId: number;
  scrollHeight: number;
  scrollTop: number;
}

type ChatGalleryTab = "joined" | "available" | "friends";
type FriendPanelTab = "accepted" | "received" | "sent";

interface DeletedRoomNotice {
  roomId: number;
  roomName: string;
}

interface PendingAttachment {
  roomId: number;
  file: File;
  previewUrl: string | null;
}

interface PendingProfileImage {
  file: File;
  previewUrl: string;
}

interface ViewedMemberProfile {
  memberId: number;
  displayName: string;
  role: ChatRoomMemberResponse["role"] | null;
  joinedAt: string | null;
  publicProfile: MemberPublicProfileResponse | null;
  isLoading: boolean;
  error: string;
}

interface FriendRemovalTarget {
  memberId: number;
  displayName: string;
}

interface DirectChatTarget {
  memberId: number;
  displayName: string;
  status: MemberStatus;
}

const emptyFriendRequestPage: CursorPageResponse<FriendRequestResponse> = {
  content: [],
  nextCursor: null,
  hasNext: false,
};

const messageTimeFormatter = new Intl.DateTimeFormat("ko-KR", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const messageDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "long",
  day: "numeric",
  weekday: "long",
});

const memberJoinedAtFormatter = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const friendRequestDateFormatter = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const messageAvatarColorClasses = [
  "message-avatar-chihiro",
  "message-avatar-kotama",
  "message-avatar-maki",
  "message-avatar-hare",
] as const;

const ROOM_AVATARS_PER_PAGE = 10;

function getMessageAvatarColorClass(senderId: number | null) {
  const colorIndex = Math.abs(senderId ?? 0) % messageAvatarColorClasses.length;
  return messageAvatarColorClasses[colorIndex];
}

function getMessageGroupAccentClass(senderId: number | null) {
  const colorIndex = Math.abs(senderId ?? 0) % messageAvatarColorClasses.length;
  return `message-group-accent-${colorIndex + 1}`;
}

function getTerminalIdentity(
  senderId: number | null,
  senderNickname: string | null,
) {
  const nickname = senderNickname?.trim() || "unknown";
  const shortId = senderId === null ? "system" : senderId.toString(36);

  return `${nickname}-${shortId}`;
}

function TerminalTypedCommand({ command }: { command: string }) {
  const prefersReducedMotion = useReducedMotion();
  const [displayedCommand, setDisplayedCommand] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayedCommand(command);
      setIsTyping(false);
      return;
    }

    let characterIndex = 0;
    setDisplayedCommand("");
    setIsTyping(true);

    const intervalId = window.setInterval(() => {
      characterIndex += 1;
      setDisplayedCommand(command.slice(0, characterIndex));

      if (characterIndex >= command.length) {
        window.clearInterval(intervalId);
        setIsTyping(false);
      }
    }, 24);

    return () => window.clearInterval(intervalId);
  }, [command, prefersReducedMotion]);

  return (
    <p className="terminal-section-command" aria-label={`$ ${command}`}>
      <span aria-hidden="true">$</span>{" "}
      <span className="terminal-typed-text" aria-hidden="true">
        {displayedCommand}
        <i
          className={isTyping
            ? "terminal-typing-cursor typing"
            : "terminal-typing-cursor settling"}
        >
          █
        </i>
      </span>
    </p>
  );
}

function formatMessageTime(createdAt: string) {
  return messageTimeFormatter.format(new Date(createdAt));
}

function formatMessageDate(createdAt: string) {
  return messageDateFormatter.format(new Date(createdAt));
}

function formatMemberJoinedAt(joinedAt: string) {
  return memberJoinedAtFormatter.format(new Date(joinedAt));
}

function formatSelectedFileSize(sizeBytes: number) {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
}

function getProfileRelationLabel(
  relationStatus: MemberPublicProfileResponse["relationStatus"],
) {
  switch (relationStatus) {
    case "ACCEPTED":
      return "FRIEND";
    case "PENDING_SENT":
      return "REQUEST_SENT";
    case "PENDING_RECEIVED":
      return "REQUEST_RECEIVED";
    case "SELF":
      return "SELF";
    default:
      return "NOT_CONNECTED";
  }
}

function readInvitedRoomId() {
  const value = new URLSearchParams(window.location.search).get("room");
  const roomId = value ? Number(value) : NaN;
  return Number.isSafeInteger(roomId) && roomId > 0 ? roomId : null;
}

function formatInviteExpiration(expiresAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

function isSameMessageDate(left: string, right: string) {
  const leftDate = new Date(left);
  const rightDate = new Date(right);

  return leftDate.getFullYear() === rightDate.getFullYear()
    && leftDate.getMonth() === rightDate.getMonth()
    && leftDate.getDate() === rightDate.getDate();
}

function mergeMessages(
  currentMessages: ChatMessage[],
  receivedMessages: ChatMessage[],
) {
  const messagesById = new Map<number, ChatMessage>();
  [...currentMessages, ...receivedMessages].forEach((item) => {
    messagesById.set(item.messageId, item);
  });

  return [...messagesById.values()].sort((left, right) => {
    const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
    return timeDifference || left.messageId - right.messageId;
  });
}

export function ChatPage() {
  const {
    accessToken,
    forceLogout,
    logout,
    logoutAllSessions,
  } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [openRoomIds, setOpenRoomIds] = useState<number[]>([]);
  const [activeGalleryTab, setActiveGalleryTab] = useState<ChatGalleryTab>("joined");
  const [friendPanelTab, setFriendPanelTab] = useState<FriendPanelTab>("accepted");
  const [friends, setFriends] = useState<FriendListResponse[]>([]);
  const [sentFriendRequests, setSentFriendRequests] =
    useState<CursorPageResponse<FriendRequestResponse>>(emptyFriendRequestPage);
  const [receivedFriendRequests, setReceivedFriendRequests] =
    useState<CursorPageResponse<FriendRequestResponse>>(emptyFriendRequestPage);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [isLoadingSentFriendRequests, setIsLoadingSentFriendRequests] = useState(false);
  const [isLoadingReceivedFriendRequests, setIsLoadingReceivedFriendRequests] = useState(false);
  const [isLoadingMoreSentFriendRequests, setIsLoadingMoreSentFriendRequests] = useState(false);
  const [isLoadingMoreReceivedFriendRequests, setIsLoadingMoreReceivedFriendRequests] = useState(false);
  const [friendListError, setFriendListError] = useState("");
  const [sentFriendRequestError, setSentFriendRequestError] = useState("");
  const [receivedFriendRequestError, setReceivedFriendRequestError] = useState("");
  const [friendProfileActionError, setFriendProfileActionError] = useState("");
  const [friendRemovalError, setFriendRemovalError] = useState("");
  const [friendNotice, setFriendNotice] = useState("");
  const [friendOperationKeys, setFriendOperationKeys] = useState<string[]>([]);
  const [friendRemovalTarget, setFriendRemovalTarget] =
    useState<FriendRemovalTarget | null>(null);
  const [directChatTarget, setDirectChatTarget] =
    useState<DirectChatTarget | null>(null);
  const [directMessageDraft, setDirectMessageDraft] = useState("");
  const [directChatError, setDirectChatError] = useState("");
  const [openingDirectMemberId, setOpeningDirectMemberId] =
    useState<number | null>(null);
  const [isSendingDirectMessage, setIsSendingDirectMessage] = useState(false);
  const [roomAvatarPage, setRoomAvatarPage] = useState(0);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [roomListError, setRoomListError] = useState("");
  const [availableRooms, setAvailableRooms] = useState<GroupChatRoomResponse[]>([]);
  const [isLoadingAvailableRooms, setIsLoadingAvailableRooms] = useState(true);
  const [availableRoomError, setAvailableRoomError] = useState("");
  const [joiningRoomId, setJoiningRoomId] = useState<number | null>(null);
  const [joinRoomError, setJoinRoomError] = useState("");
  const [joinTargetRoom, setJoinTargetRoom] = useState<GroupChatRoomResponse | null>(null);
  const [leaveTargetRoom, setLeaveTargetRoom] = useState<ChatRoomResponse | null>(null);
  const [isLeavingRoom, setIsLeavingRoom] = useState(false);
  const [leaveRoomError, setLeaveRoomError] = useState("");
  const [messagesByRoom, setMessagesByRoom] = useState<Record<number, ChatMessage[]>>({});
  const [messagePagesByRoom, setMessagePagesByRoom] = useState<Record<number, MessagePageState>>({});
  const [chatSendErrorsByRoom, setChatSendErrorsByRoom] =
    useState<Record<number, string>>({});
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingAttachment | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<number | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [isSavingMessageEdit, setIsSavingMessageEdit] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomCreationError, setRoomCreationError] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isCreateRoomModalOpen, setIsCreateRoomModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [viewedMemberProfile, setViewedMemberProfile] =
    useState<ViewedMemberProfile | null>(null);
  const [memberProfile, setMemberProfile] =
    useState<MemberProfileResponse | null>(null);
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState("");
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState("");
  const [isLogoutAllModalOpen, setIsLogoutAllModalOpen] = useState(false);
  const [reauthenticationMethod, setReauthenticationMethod] =
    useState<ReauthenticationMethodResponse | null>(null);
  const [logoutAllPassword, setLogoutAllPassword] = useState("");
  const [logoutAllError, setLogoutAllError] = useState("");
  const [isPreparingLogoutAll, setIsPreparingLogoutAll] = useState(false);
  const [isEditingStatusMessage, setIsEditingStatusMessage] = useState(false);
  const [statusMessageDraft, setStatusMessageDraft] = useState("");
  const [isSavingStatusMessage, setIsSavingStatusMessage] = useState(false);
  const [statusMessageError, setStatusMessageError] = useState("");
  const [profileImageRevision, setProfileImageRevision] = useState(() => Date.now());
  const [isUpdatingProfileImage, setIsUpdatingProfileImage] = useState(false);
  const [isProfileImageSourceOpen, setIsProfileImageSourceOpen] = useState(false);
  const [profileImageError, setProfileImageError] = useState("");
  const [pendingProfileImage, setPendingProfileImage] =
    useState<PendingProfileImage | null>(null);
  const [profileImageAction, setProfileImageAction] =
    useState<"upload" | "social" | "delete" | null>(null);
  const [inviteTargetRoom, setInviteTargetRoom] =
    useState<ChatRoomResponse | null>(null);
  const [inviteLink, setInviteLink] =
    useState<ChatRoomInviteLinkResponse | null>(null);
  const [inviteExpiration, setInviteExpiration] =
    useState<InviteLinkExpiration>("ONE_DAY");
  const [inviteOperation, setInviteOperation] = useState<
    "loading" | "create" | "reissue" | "delete" | "copy" | null
  >(null);
  const [inviteError, setInviteError] = useState("");
  const [inviteNotice, setInviteNotice] = useState("");
  const [isMemberListOpen, setIsMemberListOpen] = useState(false);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState(false);
  const [roomMembers, setRoomMembers] = useState<ChatRoomMemberResponse[]>([]);
  const [isLoadingMembers, setIsLoadingMembers] = useState(false);
  const [memberListError, setMemberListError] = useState("");
  const [ownerTransferTarget, setOwnerTransferTarget] =
    useState<ChatRoomMemberResponse | null>(null);
  const [isTransferringOwnership, setIsTransferringOwnership] = useState(false);
  const [ownerTransferError, setOwnerTransferError] = useState("");
  const [renameTargetRoom, setRenameTargetRoom] = useState<ChatRoomResponse | null>(null);
  const [updatedRoomName, setUpdatedRoomName] = useState("");
  const [isUpdatingRoomName, setIsUpdatingRoomName] = useState(false);
  const [roomNameUpdateError, setRoomNameUpdateError] = useState("");
  const [deleteTargetRoom, setDeleteTargetRoom] = useState<ChatRoomResponse | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);
  const [deleteRoomError, setDeleteRoomError] = useState("");
  const [deletedRoomNotice, setDeletedRoomNotice] = useState<DeletedRoomNotice | null>(null);
  const [roomEventToast, setRoomEventToast] = useState("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const [isMessageSearchOpen, setIsMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchKeyword, setMessageSearchKeyword] = useState("");
  const [messageSearchResults, setMessageSearchResults] =
    useState<ChatMessage[]>([]);
  const [messageSearchIndex, setMessageSearchIndex] = useState(-1);
  const [messageSearchHasNext, setMessageSearchHasNext] = useState(false);
  const [messageSearchNextCursor, setMessageSearchNextCursor] =
    useState<number | null>(null);
  const [isSearchingMessages, setIsSearchingMessages] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState("");
  const [isScrollToBottomVisible, setIsScrollToBottomVisible] = useState(false);
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const profileImageInputRef = useRef<HTMLInputElement>(null);
  const invitedRoomIdRef = useRef(readInvitedRoomId());
  const loadingMessageRoomIdsRef = useRef(new Set<number>());
  const pendingHistoryScrollRef = useRef<PendingHistoryScroll | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const memberRequestIdRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const lastRoomAvatarWheelAtRef = useRef(0);
  const activeRoomIdRef = useRef<number | null>(null);
  const isChatOpenRef = useRef(false);
  const lastReadRequestByRoomRef = useRef(new Map<number, number>());
  const latestMessageIdByRoomRef = useRef(new Map<number, number>());
  const isRecoveringConnectionRef = useRef(false);
  const messageSearchRequestIdRef = useRef(0);
  const pendingSearchScrollMessageIdRef = useRef<number | null>(null);
  const friendListRequestIdRef = useRef(0);
  const sentFriendRequestIdRef = useRef(0);
  const receivedFriendRequestIdRef = useRef(0);
  const receivedFriendRefreshRef = useRef<Promise<void> | null>(null);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = memberProfile?.nickname ?? "사용자";
  const ownProfileImageUrl = memberId === null
    ? null
    : memberApi.getProfileImageUrl(memberId, profileImageRevision);
  const inviteUrl = inviteLink
    ? `${window.location.origin}/invite/${encodeURIComponent(inviteLink.token)}`
    : "";
  const emailVerified = claims?.email_verified === true;
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? null;
  const isActiveRoomDeleted = deletedRoomNotice?.roomId === activeRoomId;
  const activeRoomSendError = activeRoomId === null
    ? ""
    : chatSendErrorsByRoom[activeRoomId] ?? "";
  const isActiveRoomGroupOwner = activeRoom?.type === "GROUP"
    && activeRoom.role === "OWNER";
  const messages = useMemo(
    () => activeRoomId === null ? [] : messagesByRoom[activeRoomId] ?? [],
    [activeRoomId, messagesByRoom],
  );
  const activeMessagePage = activeRoomId === null
    ? null
    : messagePagesByRoom[activeRoomId] ?? null;
  const activeSearchMessageId = messageSearchIndex >= 0
    ? messageSearchResults[messageSearchIndex]?.messageId ?? null
    : null;
  const filteredAvailableRooms = useMemo(() => {
    const query = roomSearchQuery.trim().toLocaleLowerCase();
    if (!query) return availableRooms;

    return availableRooms.filter((room) =>
      room.name.toLocaleLowerCase().includes(query),
    );
  }, [availableRooms, roomSearchQuery]);
  const totalUnreadCount = useMemo(
    () => rooms.reduce((total, room) => total + room.unreadCount, 0),
    [rooms],
  );
  const roomSubscriptionKey = useMemo(
    () => rooms.map((room) => room.roomId).join(","),
    [rooms],
  );
  const activeFriendPanelError = friendPanelTab === "accepted"
    ? friendListError
    : friendPanelTab === "received"
      ? receivedFriendRequestError
      : sentFriendRequestError;
  const isLoadingActiveFriendPanel = friendPanelTab === "accepted"
    ? isLoadingFriends
    : friendPanelTab === "received"
      ? isLoadingReceivedFriendRequests
      : isLoadingSentFriendRequests;
  const isFriendRequestOperationRunning = (requestId: number) =>
    friendOperationKeys.includes(`accept:${requestId}`)
    || friendOperationKeys.includes(`delete:${requestId}`);

  const resetMessageSearch = useCallback(() => {
    messageSearchRequestIdRef.current += 1;
    pendingSearchScrollMessageIdRef.current = null;
    setIsMessageSearchOpen(false);
    setMessageSearchQuery("");
    setMessageSearchKeyword("");
    setMessageSearchResults([]);
    setMessageSearchIndex(-1);
    setMessageSearchHasNext(false);
    setMessageSearchNextCursor(null);
    setIsSearchingMessages(false);
    setMessageSearchError("");
  }, []);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => () => {
    if (pendingProfileImage) {
      URL.revokeObjectURL(pendingProfileImage.previewUrl);
    }
  }, [pendingProfileImage]);

  const roomAvatarPageCount = Math.max(
    1,
    Math.ceil(rooms.length / ROOM_AVATARS_PER_PAGE),
  );
  const visibleRoomAvatars = useMemo(() => {
    const startIndex = roomAvatarPage * ROOM_AVATARS_PER_PAGE;
    return rooms.slice(startIndex, startIndex + ROOM_AVATARS_PER_PAGE);
  }, [roomAvatarPage, rooms]);

  useEffect(() => {
    setRoomAvatarPage((current) => Math.min(current, roomAvatarPageCount - 1));
  }, [roomAvatarPageCount]);

  useEffect(() => {
    resetMessageSearch();
  }, [activeRoomId, resetMessageSearch]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    setIsScrollToBottomVisible(false);
  }, [activeRoomId, isChatOpen]);

  useEffect(() => {
    const previewUrl = pendingAttachment?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pendingAttachment]);

  const isViewingRoomAtBottom = useCallback((roomId: number) => {
    const messageList = messageListRef.current;
    if (
      activeRoomIdRef.current !== roomId
      || !isChatOpenRef.current
      || document.visibilityState !== "visible"
      || !document.hasFocus()
      || !messageList
    ) {
      return false;
    }

    const distanceFromBottom = messageList.scrollHeight
      - messageList.scrollTop
      - messageList.clientHeight;
    return distanceFromBottom <= 48;
  }, []);

  const markRoomAsRead = useCallback(async (
    roomId: number,
    lastReadMessageId: number,
  ) => {
    if (lastReadRequestByRoomRef.current.get(roomId) === lastReadMessageId) {
      return;
    }

    lastReadRequestByRoomRef.current.set(roomId, lastReadMessageId);

    try {
      await chatRoomApi.updateReadPosition(roomId, lastReadMessageId);
      if (latestMessageIdByRoomRef.current.get(roomId) === lastReadMessageId) {
        setRooms((current) => current.map((room) =>
          room.roomId === roomId ? { ...room, unreadCount: 0 } : room,
        ));
      }
    } catch {
      if (lastReadRequestByRoomRef.current.get(roomId) === lastReadMessageId) {
        lastReadRequestByRoomRef.current.delete(roomId);
      }
    }
  }, []);

  const removeRoomState = useCallback((roomId: number) => {
    setRooms((current) => current.filter((room) => room.roomId !== roomId));
    setOpenRoomIds((current) => current.filter((openRoomId) => openRoomId !== roomId));
    setMessagesByRoom((current) => {
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    setMessagePagesByRoom((current) => {
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    setChatSendErrorsByRoom((current) => {
      if (!(roomId in current)) return current;
      const next = { ...current };
      delete next[roomId];
      return next;
    });
    latestMessageIdByRoomRef.current.delete(roomId);
    lastReadRequestByRoomRef.current.delete(roomId);
  }, []);

  const loadRooms = useCallback(async (
    preferredRoomId?: number,
    silent = false,
  ) => {
    if (!silent) {
      setIsLoadingRooms(true);
      setRoomListError("");
    }

    try {
      const response = await chatRoomApi.getAll();
      setRooms(response);
      setOpenRoomIds((current) => current.filter((roomId) =>
        response.some((room) => room.roomId === roomId),
      ));
      setActiveRoomId((currentRoomId) => {
        const nextRoomId = preferredRoomId ?? currentRoomId;
        const roomExists = response.some((room) => room.roomId === nextRoomId);

        return roomExists ? nextRoomId : null;
      });
      return response;
    } catch (loadError) {
      if (!silent) {
        setRoomListError(
          loadError instanceof Error
            ? loadError.message
            : "채팅방 목록을 불러오지 못했습니다.",
        );
      }
      return null;
    } finally {
      if (!silent) setIsLoadingRooms(false);
    }
  }, []);

  const loadAvailableRooms = useCallback(async () => {
    setIsLoadingAvailableRooms(true);
    setAvailableRoomError("");

    try {
      setAvailableRooms(await chatRoomApi.getAvailable());
    } catch (loadError) {
      setAvailableRoomError(
        loadError instanceof Error
          ? loadError.message
          : "참여 가능한 채팅방을 불러오지 못했습니다.",
      );
    } finally {
      setIsLoadingAvailableRooms(false);
    }
  }, []);

  const loadFriends = useCallback(async (silent = false) => {
    const requestId = ++friendListRequestIdRef.current;
    if (!silent) setIsLoadingFriends(true);
    if (!silent) setFriendListError("");

    try {
      const friendList = await friendApi.getFriends();
      if (requestId === friendListRequestIdRef.current) {
        setFriends(friendList);
        setFriendListError("");
      }
    } catch (loadError) {
      if (!silent && requestId === friendListRequestIdRef.current) {
        setFriendListError(
          loadError instanceof Error
            ? loadError.message
            : "친구 목록을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === friendListRequestIdRef.current) {
        setIsLoadingFriends(false);
      }
    }
  }, []);

  const loadSentFriendRequests = useCallback(async (silent = false) => {
    const requestId = ++sentFriendRequestIdRef.current;
    if (!silent) setIsLoadingSentFriendRequests(true);
    setIsLoadingMoreSentFriendRequests(false);
    if (!silent) setSentFriendRequestError("");

    try {
      const response = await friendApi.getSentRequests();
      if (requestId === sentFriendRequestIdRef.current) {
        setSentFriendRequests(response);
        setSentFriendRequestError("");
      }
    } catch (loadError) {
      if (!silent && requestId === sentFriendRequestIdRef.current) {
        setSentFriendRequestError(
          loadError instanceof Error
            ? loadError.message
            : "보낸 친구 요청을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === sentFriendRequestIdRef.current) {
        setIsLoadingSentFriendRequests(false);
      }
    }
  }, []);

  const loadReceivedFriendRequests = useCallback(async (silent = false) => {
    const requestId = ++receivedFriendRequestIdRef.current;
    if (!silent) setIsLoadingReceivedFriendRequests(true);
    setIsLoadingMoreReceivedFriendRequests(false);
    if (!silent) setReceivedFriendRequestError("");

    try {
      const response = await friendApi.getReceivedRequests();
      if (requestId === receivedFriendRequestIdRef.current) {
        setReceivedFriendRequests(response);
        setReceivedFriendRequestError("");
      }
    } catch (loadError) {
      if (!silent && requestId === receivedFriendRequestIdRef.current) {
        setReceivedFriendRequestError(
          loadError instanceof Error
            ? loadError.message
            : "받은 친구 요청을 불러오지 못했습니다.",
        );
      }
    } finally {
      if (requestId === receivedFriendRequestIdRef.current) {
        setIsLoadingReceivedFriendRequests(false);
      }
    }
  }, []);

  const refreshReceivedFriendRequests = useCallback(() => {
    if (receivedFriendRefreshRef.current) {
      return receivedFriendRefreshRef.current;
    }

    const refresh = loadReceivedFriendRequests(true).finally(() => {
      if (receivedFriendRefreshRef.current === refresh) {
        receivedFriendRefreshRef.current = null;
      }
    });
    receivedFriendRefreshRef.current = refresh;
    return refresh;
  }, [loadReceivedFriendRequests]);

  const loadFriendPanel = useCallback((tab: FriendPanelTab, silent = false) => {
    if (tab === "accepted") return loadFriends(silent);
    if (tab === "received") return loadReceivedFriendRequests(silent);
    return loadSentFriendRequests(silent);
  }, [loadFriends, loadReceivedFriendRequests, loadSentFriendRequests]);

  const loadMoreFriendRequests = async (direction: "sent" | "received") => {
    const isSent = direction === "sent";
    const currentPage = isSent ? sentFriendRequests : receivedFriendRequests;
    const isLoading = isSent
      ? isLoadingMoreSentFriendRequests
      : isLoadingMoreReceivedFriendRequests;
    if (isLoading || !currentPage.hasNext || currentPage.nextCursor === null) return;

    const requestId = isSent
      ? ++sentFriendRequestIdRef.current
      : ++receivedFriendRequestIdRef.current;
    const setLoading = isSent
      ? setIsLoadingMoreSentFriendRequests
      : setIsLoadingMoreReceivedFriendRequests;
    const setError = isSent
      ? setSentFriendRequestError
      : setReceivedFriendRequestError;
    const updatePage = isSent ? setSentFriendRequests : setReceivedFriendRequests;

    setLoading(true);
    setError("");

    try {
      const nextPage = isSent
        ? await friendApi.getSentRequests(currentPage.nextCursor)
        : await friendApi.getReceivedRequests(currentPage.nextCursor);
      const isLatest = isSent
        ? requestId === sentFriendRequestIdRef.current
        : requestId === receivedFriendRequestIdRef.current;
      if (!isLatest) return;

      updatePage((current) => ({
        ...nextPage,
        content: [...current.content, ...nextPage.content],
      }));
    } catch (loadError) {
      const isLatest = isSent
        ? requestId === sentFriendRequestIdRef.current
        : requestId === receivedFriendRequestIdRef.current;
      if (isLatest) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "친구 요청을 추가로 불러오지 못했습니다.",
        );
      }
    } finally {
      const isLatest = isSent
        ? requestId === sentFriendRequestIdRef.current
        : requestId === receivedFriendRequestIdRef.current;
      if (isLatest) setLoading(false);
    }
  };

  const loadMessages = useCallback(async (
    roomId: number,
    beforeMessageId: number | null = null,
  ) => {
    if (loadingMessageRoomIdsRef.current.has(roomId)) return false;

    loadingMessageRoomIdsRef.current.add(roomId);
    setMessagePagesByRoom((current) => ({
      ...current,
      [roomId]: {
        initialized: current[roomId]?.initialized ?? false,
        isLoading: true,
        hasNext: current[roomId]?.hasNext ?? false,
        nextCursor: current[roomId]?.nextCursor ?? null,
        error: "",
      },
    }));

    try {
      const response = await chatRoomApi.getMessages(roomId, beforeMessageId);
      if (beforeMessageId === null && response.content.length > 0) {
        latestMessageIdByRoomRef.current.set(
          roomId,
          response.content[response.content.length - 1].messageId,
        );
      }
      shouldScrollToBottomRef.current = beforeMessageId === null;
      setMessagesByRoom((current) => ({
        ...current,
        [roomId]: mergeMessages(current[roomId] ?? [], response.content),
      }));
      setMessagePagesByRoom((current) => ({
        ...current,
        [roomId]: {
          initialized: true,
          isLoading: false,
          hasNext: response.hasNext,
          nextCursor: response.nextCursor,
          error: "",
        },
      }));
      return true;
    } catch (loadError) {
      setMessagePagesByRoom((current) => ({
        ...current,
        [roomId]: {
          initialized: current[roomId]?.initialized ?? false,
          isLoading: false,
          hasNext: current[roomId]?.hasNext ?? false,
          nextCursor: current[roomId]?.nextCursor ?? null,
          error: loadError instanceof Error
            ? loadError.message
            : "메시지를 불러오지 못했습니다.",
        },
      }));
      return false;
    } finally {
      loadingMessageRoomIdsRef.current.delete(roomId);
    }
  }, []);

  const recoverAfterReconnect = useCallback(async () => {
    if (isRecoveringConnectionRef.current) return;

    isRecoveringConnectionRef.current = true;
    const previousRoomId = activeRoomIdRef.current;

    try {
      const [refreshedRooms] = await Promise.all([
        loadRooms(previousRoomId ?? undefined),
        loadAvailableRooms(),
      ]);

      if (refreshedRooms === null) {
        setError("연결은 복구됐지만 최신 채팅 정보를 불러오지 못했습니다.");
        return;
      }

      pendingHistoryScrollRef.current = null;
      shouldScrollToBottomRef.current = true;
      loadingMessageRoomIdsRef.current.clear();
      latestMessageIdByRoomRef.current.clear();
      lastReadRequestByRoomRef.current.clear();
      setMessagesByRoom({});
      setMessagePagesByRoom({});
      setEditingMessageId(null);
      setEditingMessageContent("");
      setError("");
    } finally {
      isRecoveringConnectionRef.current = false;
    }
  }, [loadAvailableRooms, loadRooms]);

  const handleIncomingDirectMessage = useCallback((response: DirectChatResponse) => {
    const receivedMessage = response.message;
    setMessagesByRoom((current) => ({
      ...current,
      [response.roomId]: mergeMessages(
        current[response.roomId] ?? [],
        [receivedMessage],
      ),
    }));
    latestMessageIdByRoomRef.current.set(
      response.roomId,
      receivedMessage.messageId,
    );
    setChatSendErrorsByRoom((current) => {
      if (!(response.roomId in current)) return current;
      const next = { ...current };
      delete next[response.roomId];
      return next;
    });

    const isViewingRoom = isViewingRoomAtBottom(response.roomId);
    shouldScrollToBottomRef.current = isViewingRoom;
    void loadRooms(undefined, true);

    if (isViewingRoom) {
      void markRoomAsRead(response.roomId, receivedMessage.messageId);
    }
  }, [isViewingRoomAtBottom, loadRooms, markRoomAsRead]);

  useEffect(() => {
    if (!accessToken) {
      setMemberProfile(null);
      setFriends([]);
      setSentFriendRequests(emptyFriendRequestPage);
      setReceivedFriendRequests(emptyFriendRequestPage);
      setFriendListError("");
      setSentFriendRequestError("");
      setReceivedFriendRequestError("");
      setFriendProfileActionError("");
      setFriendRemovalError("");
      setFriendNotice("");
      setFriendOperationKeys([]);
      setDirectChatTarget(null);
      setDirectMessageDraft("");
      setDirectChatError("");
      setOpeningDirectMemberId(null);
      setIsSendingDirectMessage(false);
      setRooms([]);
      setActiveRoomId(null);
      setOpenRoomIds([]);
      setIsChatOpen(false);
      setIsLoadingRooms(false);
      setAvailableRooms([]);
      setIsLoadingAvailableRooms(false);
      setMessagesByRoom({});
      setMessagePagesByRoom({});
      setChatSendErrorsByRoom({});
      loadingMessageRoomIdsRef.current.clear();
      return;
    }

    void memberApi.getProfile().then(setMemberProfile).catch(() => {
      setMemberProfile(null);
    });
    const invitedRoomId = invitedRoomIdRef.current;
    void loadRooms(invitedRoomId ?? undefined).then((loadedRooms) => {
      if (
        invitedRoomId === null
        || !loadedRooms?.some((room) => room.roomId === invitedRoomId)
      ) {
        return;
      }

      invitedRoomIdRef.current = null;
      setOpenRoomIds((current) => current.includes(invitedRoomId)
        ? current
        : [...current, invitedRoomId].slice(-3));
      setIsChatOpen(true);
      window.history.replaceState({}, document.title, "/chat");
    });
    void loadAvailableRooms();
    void refreshReceivedFriendRequests();
  }, [
    accessToken,
    loadAvailableRooms,
    loadRooms,
    refreshReceivedFriendRequests,
  ]);

  useEffect(() => {
    if (!accessToken || activeGalleryTab !== "friends") return;

    void loadFriendPanel(friendPanelTab);
    if (friendPanelTab !== "received") {
      void refreshReceivedFriendRequests();
    }
  }, [
    accessToken,
    activeGalleryTab,
    friendPanelTab,
    loadFriendPanel,
    refreshReceivedFriendRequests,
  ]);

  useEffect(() => {
    if (!friendNotice) return;

    const timeoutId = window.setTimeout(() => setFriendNotice(""), 3_000);
    return () => window.clearTimeout(timeoutId);
  }, [friendNotice]);

  useEffect(() => {
    if (!accessToken) return;

    const refreshVisibleFriendPanel = () => {
      if (document.visibilityState !== "visible") return;

      if (activeGalleryTab === "friends" && friendPanelTab !== "received") {
        void loadFriendPanel(friendPanelTab, true);
      }
      void refreshReceivedFriendRequests();
    };

    window.addEventListener("focus", refreshVisibleFriendPanel);
    document.addEventListener("visibilitychange", refreshVisibleFriendPanel);

    return () => {
      window.removeEventListener("focus", refreshVisibleFriendPanel);
      document.removeEventListener("visibilitychange", refreshVisibleFriendPanel);
    };
  }, [
    accessToken,
    activeGalleryTab,
    friendPanelTab,
    loadFriendPanel,
    refreshReceivedFriendRequests,
  ]);

  useEffect(() => {
    if (!accessToken) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshReceivedFriendRequests();
      }
    }, 20_000);

    return () => window.clearInterval(intervalId);
  }, [accessToken, refreshReceivedFriendRequests]);

  useEffect(() => {
    if (
      activeRoomId === null
      || activeMessagePage?.initialized
      || activeMessagePage?.isLoading
    ) {
      return;
    }

    void loadMessages(activeRoomId);
  }, [activeMessagePage, activeRoomId, loadMessages]);

  useEffect(() => {
    if (!accessToken) {
      setIsConnected(false);
      return;
    }

    setError("");
    const connection = connectChat({
      accessToken,
      onMessage: (event: ChatMessageEvent) => {
        const receivedMessage = event.message;
        const isCreated = event.eventType === "CREATED";

        setMessagesByRoom((current) => {
          const roomMessages = current[receivedMessage.roomId] ?? [];
          if (
            !isCreated
            && !roomMessages.some((item) => item.messageId === receivedMessage.messageId)
          ) {
            return current;
          }

          return {
            ...current,
            [receivedMessage.roomId]: mergeMessages(roomMessages, [receivedMessage]),
          };
        });

        if (!isCreated) return;

        setChatSendErrorsByRoom((current) => {
          if (!(receivedMessage.roomId in current)) return current;
          const next = { ...current };
          delete next[receivedMessage.roomId];
          return next;
        });

        latestMessageIdByRoomRef.current.set(
          receivedMessage.roomId,
          receivedMessage.messageId,
        );
        const isViewingRoom = isViewingRoomAtBottom(receivedMessage.roomId);
        const countsAsUnread = receivedMessage.senderId === null
          || receivedMessage.senderId !== memberId;
        shouldScrollToBottomRef.current = isViewingRoom;
        setRooms((current) => current.map((room) =>
          room.roomId === receivedMessage.roomId
            ? {
                ...room,
                lastMessageAt: receivedMessage.createdAt,
                unreadCount: isViewingRoom || !countsAsUnread
                  ? room.unreadCount
                  : room.unreadCount + 1,
              }
            : room,
        ));

        if (isViewingRoom) {
          void markRoomAsRead(receivedMessage.roomId, receivedMessage.messageId);
        }
      },
      onDirectMessage: handleIncomingDirectMessage,
      onChatError: (chatError: ChatErrorEvent) => {
        if (chatError.code !== "FRIENDSHIP-007") {
          setError(chatError.message);
          return;
        }

        setChatSendErrorsByRoom((current) => ({
          ...current,
          [chatError.roomId]: `${chatError.message} 메시지를 보내려면 먼저 친구 관계를 다시 맺어주세요.`,
        }));
        if (activeRoomIdRef.current === chatError.roomId) {
          setError("");
        }
      },
      onRoomEvent: (event: ChatRoomEvent) => {
        if (event.eventType === "UPDATED" && event.name !== null) {
          setRooms((current) => current.map((room) =>
            room.roomId === event.roomId
              ? { ...room, name: event.name }
              : room,
          ));
          return;
        }

        if (event.eventType !== "DELETED") return;

        const roomName = event.name ?? "채팅방";
        if (activeRoomIdRef.current === event.roomId) {
          setIsMemberListOpen(false);
          setIsRoomMenuOpen(false);
          setLeaveTargetRoom(null);
          setOwnerTransferTarget(null);
          setRenameTargetRoom(null);
          setDeleteTargetRoom(null);
          setDeletedRoomNotice({ roomId: event.roomId, roomName });
          return;
        }

        removeRoomState(event.roomId);
        setRoomEventToast(`'${roomName}' 채팅방이 삭제되었습니다.`);
      },
      onStatusChange: setIsConnected,
      onReconnect: () => {
        void recoverAfterReconnect();
      },
      onForceLogout: forceLogout,
      onError: setError,
    });
    chatRef.current = connection;

    return () => {
      connection.disconnect();
      chatRef.current = null;
    };
  }, [
    accessToken,
    forceLogout,
    handleIncomingDirectMessage,
    isViewingRoomAtBottom,
    markRoomAsRead,
    memberId,
    removeRoomState,
    recoverAfterReconnect,
  ]);

  useEffect(() => {
    if (!roomEventToast) return;

    const timeoutId = window.setTimeout(() => setRoomEventToast(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [roomEventToast]);

  useEffect(() => {
    const roomIds = roomSubscriptionKey
      ? roomSubscriptionKey.split(",").map(Number)
      : [];
    chatRef.current?.syncSubscriptions(roomIds);
  }, [roomSubscriptionKey]);

  useLayoutEffect(() => {
    const messageId = pendingSearchScrollMessageIdRef.current;
    if (messageId === null) return;

    const target = messageListRef.current?.querySelector<HTMLElement>(
      `[data-message-id="${messageId}"]`,
    );
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingSearchScrollMessageIdRef.current = null;
  }, [activeSearchMessageId, messages]);

  useLayoutEffect(() => {
    const pendingScroll = pendingHistoryScrollRef.current;
    const messageList = messageListRef.current;

    if (pendingScroll && pendingScroll.roomId === activeRoomId && messageList) {
      messageList.scrollTop = pendingScroll.scrollTop
        + messageList.scrollHeight
        - pendingScroll.scrollHeight;
      pendingHistoryScrollRef.current = null;
      shouldScrollToBottomRef.current = true;
      return;
    }

    if (shouldScrollToBottomRef.current) {
      messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    shouldScrollToBottomRef.current = true;
  }, [messages]);

  useEffect(() => {
    if (activeRoomId === null || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    const frameId = window.requestAnimationFrame(() => {
      if (isViewingRoomAtBottom(activeRoomId)) {
        void markRoomAsRead(activeRoomId, latestMessage.messageId);
      }
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activeRoomId, isViewingRoomAtBottom, markRoomAsRead, messages]);

  useEffect(() => {
    const markVisibleRoomAsRead = () => {
      if (activeRoomId === null || messages.length === 0) return;

      const latestMessage = messages[messages.length - 1];
      if (isViewingRoomAtBottom(activeRoomId)) {
        void markRoomAsRead(activeRoomId, latestMessage.messageId);
      }
    };

    window.addEventListener("focus", markVisibleRoomAsRead);
    document.addEventListener("visibilitychange", markVisibleRoomAsRead);

    return () => {
      window.removeEventListener("focus", markVisibleRoomAsRead);
      document.removeEventListener("visibilitychange", markVisibleRoomAsRead);
    };
  }, [activeRoomId, isViewingRoomAtBottom, markRoomAsRead, messages]);

  const handleMessageListScroll = () => {
    const messageList = messageListRef.current;
    if (!messageList) return;

    const distanceFromBottom = messageList.scrollHeight
      - messageList.scrollTop
      - messageList.clientHeight;
    setIsScrollToBottomVisible(distanceFromBottom > 160);

    if (activeRoomId === null || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (isViewingRoomAtBottom(activeRoomId)) {
      void markRoomAsRead(activeRoomId, latestMessage.messageId);
    }
  };

  const handleScrollToBottom = () => {
    shouldScrollToBottomRef.current = true;
    messageEndRef.current?.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "end",
    });
    setIsScrollToBottomVisible(false);
  };

  const handleLoadOlderMessages = async () => {
    if (
      activeRoomId === null
      || !activeMessagePage?.hasNext
      || activeMessagePage.nextCursor === null
      || activeMessagePage.isLoading
    ) {
      return;
    }

    const messageList = messageListRef.current;
    if (messageList) {
      pendingHistoryScrollRef.current = {
        roomId: activeRoomId,
        scrollHeight: messageList.scrollHeight,
        scrollTop: messageList.scrollTop,
      };
    }

    const loaded = await loadMessages(activeRoomId, activeMessagePage.nextCursor);
    if (!loaded) {
      pendingHistoryScrollRef.current = null;
    }
  };

  const handleSend = (content: string) => {
    try {
      if (activeRoomId === null || chatSendErrorsByRoom[activeRoomId]) return false;

      chatRef.current?.send(activeRoomId, content);
      setError("");
      return true;
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "메시지 전송에 실패했습니다.");
      return false;
    }
  };

  const handleAttachmentSelection = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const roomId = activeRoomId;
    input.value = "";
    if (
      !file
      || roomId === null
      || isUploadingAttachment
      || chatSendErrorsByRoom[roomId]
    ) return;

    setPendingAttachment({
      roomId,
      file,
      previewUrl: file.type.startsWith("image/")
        ? URL.createObjectURL(file)
        : null,
    });
    setError("");
  };

  const handleCloseAttachmentConfirmation = () => {
    if (isUploadingAttachment) return;
    setPendingAttachment(null);
  };

  const handleConfirmAttachment = async () => {
    if (!pendingAttachment || isUploadingAttachment) return;
    if (chatSendErrorsByRoom[pendingAttachment.roomId]) {
      setError(chatSendErrorsByRoom[pendingAttachment.roomId]);
      return;
    }

    setIsUploadingAttachment(true);
    setError("");

    try {
      const response = await chatRoomApi.uploadAttachment(
        pendingAttachment.roomId,
        pendingAttachment.file,
      );
      const connection = chatRef.current;
      if (!connection) {
        throw new Error("채팅 서버에 연결되어 있지 않습니다.");
      }

      connection.sendAttachment(
        pendingAttachment.roomId,
        response.attachmentId,
      );
      setPendingAttachment(null);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "첨부파일을 전송하지 못했습니다.",
      );
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const handleDeleteMessage = async (targetMessage: ChatMessage) => {
    if (
      targetMessage.senderId !== memberId
      || targetMessage.type === "SYSTEM"
      || targetMessage.deleted
      || deletingMessageId !== null
    ) {
      return;
    }

    const isAttachmentMessage = targetMessage.type === "IMAGE"
      || targetMessage.type === "FILE";
    const confirmationMessage = isAttachmentMessage
      ? "이 첨부파일 메시지를 삭제하시겠습니까? 삭제한 파일은 다시 다운로드할 수 없습니다."
      : "이 메시지를 삭제하시겠습니까?";

    if (!window.confirm(confirmationMessage)) return;

    setDeletingMessageId(targetMessage.messageId);
    setError("");

    try {
      await chatRoomApi.deleteMessage(
        targetMessage.roomId,
        targetMessage.messageId,
      );
      setMessagesByRoom((current) => ({
        ...current,
        [targetMessage.roomId]: (current[targetMessage.roomId] ?? []).map((item) =>
          item.messageId === targetMessage.messageId
            ? { ...item, content: null, attachment: null, deleted: true }
            : item,
        ),
      }));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "메시지를 삭제하지 못했습니다.",
      );
    } finally {
      setDeletingMessageId(null);
    }
  };

  const handleStartMessageEdit = (targetMessage: ChatMessage) => {
    if (
      targetMessage.senderId !== memberId
      || targetMessage.type !== "TEXT"
      || targetMessage.deleted
      || targetMessage.content === null
    ) {
      return;
    }

    setEditingMessageId(targetMessage.messageId);
    setEditingMessageContent(targetMessage.content);
    setError("");
  };

  const handleCancelMessageEdit = () => {
    if (isSavingMessageEdit) return;

    setEditingMessageId(null);
    setEditingMessageContent("");
  };

  const handleEditMessage = async (
    event: FormEvent<HTMLFormElement>,
    targetMessage: ChatMessage,
  ) => {
    event.preventDefault();
    if (isSavingMessageEdit) return;

    const content = editingMessageContent.trim();
    if (!content || content === targetMessage.content) return;

    setIsSavingMessageEdit(true);
    setError("");

    try {
      await chatRoomApi.editMessage(
        targetMessage.roomId,
        targetMessage.messageId,
        content,
      );
      setMessagesByRoom((current) => ({
        ...current,
        [targetMessage.roomId]: (current[targetMessage.roomId] ?? []).map((item) => {
          if (item.messageId !== targetMessage.messageId) return item;
          if (item.content === content && item.editedAt !== null) return item;

          return {
            ...item,
            content,
            editedAt: new Date().toISOString(),
          };
        }),
      }));
      setEditingMessageId(null);
      setEditingMessageContent("");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "메시지를 수정하지 못했습니다.",
      );
    } finally {
      setIsSavingMessageEdit(false);
    }
  };

  const handleCreateRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = roomName.trim();
    if (!name) return;

    setIsCreatingRoom(true);
    setRoomCreationError("");

    try {
      const response = await chatRoomApi.create({ name });
      setRoomName("");
      await Promise.all([
        loadRooms(response.roomId),
        loadAvailableRooms(),
      ]);
      handleOpenRoom(response.roomId);
      setIsCreateRoomModalOpen(false);
    } catch (createError) {
      setRoomCreationError(
        createError instanceof Error
          ? createError.message
          : "채팅방 생성에 실패했습니다.",
      );
    } finally {
      setIsCreatingRoom(false);
    }
  };

  const handleJoinRoom = async (roomId: number) => {
    if (joiningRoomId !== null) return;

    setJoiningRoomId(roomId);
    setJoinRoomError("");

    try {
      await chatRoomApi.join(roomId);
      await Promise.all([
        loadRooms(roomId),
        loadAvailableRooms(),
      ]);
      handleOpenRoom(roomId);
      setJoinTargetRoom(null);
    } catch (joinError) {
      setJoinRoomError(
        joinError instanceof Error
          ? joinError.message
          : "채팅방 참여에 실패했습니다.",
      );
    } finally {
      setJoiningRoomId(null);
    }
  };

  const handleOpenJoinRoomModal = (room: GroupChatRoomResponse) => {
    setJoinRoomError("");
    setJoinTargetRoom(room);
  };

  const handleCloseJoinRoomModal = () => {
    if (joiningRoomId !== null) return;

    setJoinRoomError("");
    setJoinTargetRoom(null);
  };

  const handleOpenLeaveRoomModal = () => {
    if (!activeRoom || isActiveRoomGroupOwner) return;

    setIsRoomMenuOpen(false);
    setLeaveRoomError("");
    setLeaveTargetRoom(activeRoom);
  };

  const handleCloseLeaveRoomModal = () => {
    if (isLeavingRoom) return;

    setLeaveRoomError("");
    setLeaveTargetRoom(null);
  };

  const handleOpenRoomNameUpdateModal = () => {
    if (!activeRoom || activeRoom.role !== "OWNER") return;

    setIsRoomMenuOpen(false);
    setUpdatedRoomName(activeRoom.name ?? "");
    setRoomNameUpdateError("");
    setRenameTargetRoom(activeRoom);
  };

  const handleCloseRoomNameUpdateModal = () => {
    if (isUpdatingRoomName) return;

    setRenameTargetRoom(null);
    setUpdatedRoomName("");
    setRoomNameUpdateError("");
  };

  const handleUpdateRoomName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!renameTargetRoom || isUpdatingRoomName) return;

    const normalizedName = updatedRoomName.trim();
    if (!normalizedName || normalizedName.length > 30) {
      setRoomNameUpdateError("채팅방 이름은 1자 이상 30자 이하여야 합니다.");
      return;
    }

    setIsUpdatingRoomName(true);
    setRoomNameUpdateError("");

    try {
      await chatRoomApi.updateName(renameTargetRoom.roomId, {
        name: normalizedName,
      });
      setRooms((current) => current.map((room) =>
        room.roomId === renameTargetRoom.roomId
          ? { ...room, name: normalizedName }
          : room,
      ));
      setRenameTargetRoom(null);
      setUpdatedRoomName("");
    } catch (updateError) {
      setRoomNameUpdateError(
        updateError instanceof Error
          ? updateError.message
          : "채팅방 이름을 변경하지 못했습니다.",
      );
    } finally {
      setIsUpdatingRoomName(false);
    }
  };

  const handleOpenDeleteRoomModal = () => {
    if (!activeRoom || activeRoom.role !== "OWNER" || isActiveRoomDeleted) return;

    setIsRoomMenuOpen(false);
    setDeleteRoomError("");
    setDeleteTargetRoom(activeRoom);
  };

  const handleCloseDeleteRoomModal = () => {
    if (isDeletingRoom) return;

    setDeleteTargetRoom(null);
    setDeleteRoomError("");
  };

  const handleDeleteRoom = async () => {
    if (!deleteTargetRoom || isDeletingRoom) return;

    setIsDeletingRoom(true);
    setDeleteRoomError("");

    try {
      await chatRoomApi.deleteRoom(deleteTargetRoom.roomId);
      setDeletedRoomNotice({
        roomId: deleteTargetRoom.roomId,
        roomName: deleteTargetRoom.name ?? "채팅방",
      });
      setDeleteTargetRoom(null);
    } catch (deleteError) {
      setDeleteRoomError(
        deleteError instanceof Error
          ? deleteError.message
          : "채팅방을 삭제하지 못했습니다.",
      );
    } finally {
      setIsDeletingRoom(false);
    }
  };

  const handleConfirmDeletedRoom = () => {
    if (!deletedRoomNotice) return;

    const roomId = deletedRoomNotice.roomId;
    removeRoomState(roomId);
    if (activeRoomIdRef.current === roomId) {
      activeRoomIdRef.current = null;
      isChatOpenRef.current = false;
      setActiveRoomId(null);
      setIsChatOpen(false);
      setRoomMembers([]);
      setMemberListError("");
      setError("");
    }
    setDeletedRoomNotice(null);
  };

  const handleLeaveRoom = async () => {
    if (!leaveTargetRoom || isLeavingRoom) return;

    const roomId = leaveTargetRoom.roomId;
    setIsLeavingRoom(true);
    setLeaveRoomError("");

    try {
      await chatRoomApi.leave(roomId);

      removeRoomState(roomId);
      if (activeRoomIdRef.current === roomId) {
        activeRoomIdRef.current = null;
        isChatOpenRef.current = false;
        setActiveRoomId(null);
        setIsChatOpen(false);
        setIsMemberListOpen(false);
        setIsRoomMenuOpen(false);
        setRoomMembers([]);
        setMemberListError("");
      }
      setError("");
      setLeaveTargetRoom(null);
      await loadAvailableRooms();
    } catch (leaveError) {
      setLeaveRoomError(
        leaveError instanceof Error
          ? leaveError.message
          : "채팅방을 나가지 못했습니다.",
      );
    } finally {
      setIsLeavingRoom(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // AuthProvider가 local 인증 상태를 제거하므로 로그인 화면으로 이동합니다.
    }
  };

  const handleProfileLogout = async () => {
    setIsProfileModalOpen(false);
    await handleLogout();
  };

  const handleOpenLogoutAll = async () => {
    if (isPreparingLogoutAll) return;

    setIsProfileModalOpen(false);
    setIsLogoutAllModalOpen(true);
    setReauthenticationMethod(null);
    setLogoutAllPassword("");
    setLogoutAllError("");
    setIsPreparingLogoutAll(true);

    try {
      const method = await authApi.getReauthenticationMethod();
      setReauthenticationMethod(method);
    } catch (requestError) {
      setLogoutAllError(
        requestError instanceof Error
          ? requestError.message
          : "재인증 방법을 확인하지 못했습니다.",
      );
    } finally {
      setIsPreparingLogoutAll(false);
    }
  };

  const handleCloseLogoutAll = () => {
    if (isPreparingLogoutAll) return;
    setIsLogoutAllModalOpen(false);
    setReauthenticationMethod(null);
    setLogoutAllPassword("");
    setLogoutAllError("");
  };

  const handlePasswordLogoutAll = async () => {
    if (isPreparingLogoutAll || !logoutAllPassword) return;

    setIsPreparingLogoutAll(true);
    setLogoutAllError("");

    try {
      const reauthenticationToken =
        await authApi.reauthenticateWithPassword({
          password: logoutAllPassword,
          purpose: "LOGOUT_ALL",
        });
      await logoutAllSessions(reauthenticationToken);
    } catch (requestError) {
      setLogoutAllError(
        requestError instanceof Error
          ? requestError.message
          : "모든 기기에서 로그아웃하지 못했습니다.",
      );
      setIsPreparingLogoutAll(false);
    }
  };

  const handleSocialLogoutAll = async () => {
    if (
      isPreparingLogoutAll
      || reauthenticationMethod?.type !== "SOCIAL"
      || !reauthenticationMethod.provider
    ) {
      return;
    }

    setIsPreparingLogoutAll(true);
    setLogoutAllError("");

    try {
      await authApi.startSocialReauthentication({
        provider: reauthenticationMethod.provider,
        purpose: "LOGOUT_ALL",
      });
      window.location.assign(`${API_BASE_URL}/oauth2/authorization/google`);
    } catch (requestError) {
      setLogoutAllError(
        requestError instanceof Error
          ? requestError.message
          : "Google 재인증을 시작하지 못했습니다.",
      );
      setIsPreparingLogoutAll(false);
    }
  };

  const handleOpenOwnProfile = () => {
    setViewedMemberProfile(null);
    setIsEditingNickname(false);
    setNicknameDraft(memberProfile?.nickname ?? "");
    setNicknameError("");
    setIsEditingStatusMessage(false);
    setStatusMessageDraft(memberProfile?.statusMessage ?? "");
    setStatusMessageError("");
    setIsProfileModalOpen(true);
  };

  const handleOpenMemberProfile = (
    targetMemberId: number,
    displayName: string,
  ) => {
    setIsMemberListOpen(false);
    setFriendProfileActionError("");
    setDirectChatError("");

    if (targetMemberId === memberId) {
      handleOpenOwnProfile();
      return;
    }

    const roomMember = roomMembers.find(
      (candidate) => candidate.memberId === targetMemberId,
    );

    setIsProfileModalOpen(false);
    setViewedMemberProfile({
      memberId: targetMemberId,
      displayName: roomMember?.displayName ?? displayName,
      role: roomMember?.role ?? null,
      joinedAt: roomMember?.joinedAt ?? null,
      publicProfile: null,
      isLoading: true,
      error: "",
    });

    void memberApi.getPublicProfile(targetMemberId)
      .then((profile) => {
        setViewedMemberProfile((current) => current?.memberId === targetMemberId
          ? {
              ...current,
              displayName: profile.displayName,
              publicProfile: profile,
              isLoading: false,
            }
          : current);
      })
      .catch((profileError) => {
        setViewedMemberProfile((current) => current?.memberId === targetMemberId
          ? {
              ...current,
              isLoading: false,
              error: profileError instanceof Error
                ? profileError.message
                : "프로필을 불러오지 못했습니다.",
            }
          : current);
      });
  };

  const refreshViewedMemberProfile = async (targetMemberId: number) => {
    try {
      const profile = await memberApi.getPublicProfile(targetMemberId);
      setViewedMemberProfile((current) => current?.memberId === targetMemberId
        ? {
            ...current,
            displayName: profile.displayName,
            publicProfile: profile,
            isLoading: false,
            error: "",
          }
        : current);
    } catch (profileError) {
      setViewedMemberProfile((current) => current?.memberId === targetMemberId
        ? {
            ...current,
            error: profileError instanceof Error
              ? profileError.message
              : "프로필을 갱신하지 못했습니다.",
          }
        : current);
    }
  };

  const handleRequestFriend = async (targetMemberId: number) => {
    const operationKey = `request:${targetMemberId}`;
    if (friendOperationKeys.includes(operationKey)) return;

    setFriendOperationKeys((current) => [...current, operationKey]);
    setFriendProfileActionError("");
    setFriendNotice("");

    try {
      await friendApi.request(targetMemberId);
      setViewedMemberProfile((current) => current?.memberId === targetMemberId
        && current.publicProfile
        ? {
            ...current,
            publicProfile: {
              ...current.publicProfile,
              relationStatus: "PENDING_SENT",
            },
          }
        : current);
      void loadSentFriendRequests(true);
      setFriendNotice("친구 요청을 보냈습니다.");
    } catch (requestError) {
      setFriendProfileActionError(
        requestError instanceof Error
          ? requestError.message
          : "친구 요청을 보내지 못했습니다.",
      );
    } finally {
      setFriendOperationKeys((current) => current.filter((key) => key !== operationKey));
    }
  };

  const handleAcceptFriendRequest = async (request: FriendRequestResponse) => {
    const operationKey = `accept:${request.requestId}`;
    if (isFriendRequestOperationRunning(request.requestId)) return;

    setFriendOperationKeys((current) => [...current, operationKey]);
    setReceivedFriendRequestError("");
    setFriendNotice("");

    try {
      await friendApi.acceptRequest(request.requestId);
      setReceivedFriendRequests((current) => ({
        ...current,
        content: current.content.filter((item) => item.requestId !== request.requestId),
      }));
      void loadReceivedFriendRequests(true);
      void loadFriends(true);
      if (viewedMemberProfile?.memberId === request.targetMemberId) {
        void refreshViewedMemberProfile(request.targetMemberId);
      }
      setFriendNotice(`${request.targetDisplayName}님과 친구가 되었습니다.`);
    } catch (requestError) {
      setReceivedFriendRequestError(
        requestError instanceof Error
          ? requestError.message
          : "친구 요청을 수락하지 못했습니다.",
      );
    } finally {
      setFriendOperationKeys((current) => current.filter((key) => key !== operationKey));
    }
  };

  const handleDeleteFriendRequest = async (
    request: FriendRequestResponse,
    direction: "sent" | "received",
  ) => {
    const operationKey = `delete:${request.requestId}`;
    if (isFriendRequestOperationRunning(request.requestId)) return;

    setFriendOperationKeys((current) => [...current, operationKey]);
    const setRequestError = direction === "sent"
      ? setSentFriendRequestError
      : setReceivedFriendRequestError;
    setRequestError("");
    setFriendNotice("");

    try {
      await friendApi.deleteRequest(request.requestId);
      const updateRequests = direction === "sent"
        ? setSentFriendRequests
        : setReceivedFriendRequests;
      updateRequests((current) => ({
        ...current,
        content: current.content.filter((item) => item.requestId !== request.requestId),
      }));
      if (direction === "sent") {
        void loadSentFriendRequests(true);
      } else {
        void loadReceivedFriendRequests(true);
      }
      if (viewedMemberProfile?.memberId === request.targetMemberId) {
        void refreshViewedMemberProfile(request.targetMemberId);
      }
      setFriendNotice(direction === "sent"
        ? "보낸 친구 요청을 취소했습니다."
        : "받은 친구 요청을 거절했습니다.");
    } catch (requestError) {
      setRequestError(
        requestError instanceof Error
          ? requestError.message
          : "친구 요청을 삭제하지 못했습니다.",
      );
    } finally {
      setFriendOperationKeys((current) => current.filter((key) => key !== operationKey));
    }
  };

  const handleRequestUnfollow = (target: FriendRemovalTarget) => {
    setFriendRemovalError("");
    setFriendRemovalTarget(target);
  };

  const handleConfirmUnfollow = async () => {
    if (!friendRemovalTarget) return;

    const target = friendRemovalTarget;
    const operationKey = `unfollow:${target.memberId}`;
    if (friendOperationKeys.includes(operationKey)) return;

    setFriendOperationKeys((current) => [...current, operationKey]);
    setFriendRemovalError("");
    setFriendNotice("");

    try {
      await friendApi.unfollow(target.memberId);
      setFriends((current) => current.filter((friend) => friend.memberId !== target.memberId));
      void loadFriends(true);
      if (viewedMemberProfile?.memberId === target.memberId) {
        void refreshViewedMemberProfile(target.memberId);
      }
      setFriendRemovalTarget(null);
      setFriendNotice(`${target.displayName}님과의 친구 관계를 해제했습니다.`);
    } catch (requestError) {
      setFriendRemovalError(
        requestError instanceof Error
          ? requestError.message
          : "친구 관계를 해제하지 못했습니다.",
      );
    } finally {
      setFriendOperationKeys((current) => current.filter((key) => key !== operationKey));
    }
  };

  const refreshMemberProfile = async () => {
    const profile = await memberApi.getProfile();
    setMemberProfile(profile);
    setProfileImageRevision(Date.now());
  };

  const handleStartNicknameEdit = () => {
    setNicknameDraft(memberProfile?.nickname ?? "");
    setNicknameError("");
    setIsEditingStatusMessage(false);
    setStatusMessageError("");
    setIsEditingNickname(true);
  };

  const handleCancelNicknameEdit = () => {
    if (isSavingNickname) return;
    setNicknameDraft(memberProfile?.nickname ?? "");
    setNicknameError("");
    setIsEditingNickname(false);
  };

  const handleSaveNickname = async () => {
    if (isSavingNickname) return;

    const normalizedNickname = nicknameDraft.trim();
    if (normalizedNickname.length < 2 || normalizedNickname.length > 30) {
      setNicknameError("닉네임은 2자 이상 30자 이하여야 합니다.");
      return;
    }
    if (!/^[a-zA-Z0-9가-힣]+$/.test(normalizedNickname)) {
      setNicknameError("닉네임은 한글, 영어, 숫자만 가능합니다.");
      return;
    }
    if (normalizedNickname === memberProfile?.nickname) {
      setNicknameError("");
      setIsEditingNickname(false);
      return;
    }

    setIsSavingNickname(true);
    setNicknameError("");

    try {
      await memberApi.updateNickname(normalizedNickname);
      setMemberProfile((current) => current
        ? { ...current, nickname: normalizedNickname }
        : current);
      if (memberId !== null) {
        setMessagesByRoom((current) => {
          const next = { ...current };
          Object.entries(next).forEach(([roomId, roomMessages]) => {
            next[Number(roomId)] = roomMessages.map((message) =>
              message.senderId === memberId
                ? { ...message, senderNickname: normalizedNickname }
                : message);
          });
          return next;
        });
        setRoomMembers((current) => current.map((roomMember) =>
          roomMember.memberId === memberId
            ? { ...roomMember, displayName: normalizedNickname }
            : roomMember));
      }
      setNicknameDraft(normalizedNickname);
      setIsEditingNickname(false);
    } catch (requestError) {
      setNicknameError(
        requestError instanceof Error
          ? requestError.message
          : "닉네임을 변경하지 못했습니다.",
      );
    } finally {
      setIsSavingNickname(false);
    }
  };

  const handleStartStatusMessageEdit = () => {
    setStatusMessageDraft(memberProfile?.statusMessage ?? "");
    setStatusMessageError("");
    setIsEditingNickname(false);
    setNicknameError("");
    setIsEditingStatusMessage(true);
  };

  const handleCancelStatusMessageEdit = () => {
    if (isSavingStatusMessage) return;
    setStatusMessageDraft(memberProfile?.statusMessage ?? "");
    setStatusMessageError("");
    setIsEditingStatusMessage(false);
  };

  const handleSaveStatusMessage = async () => {
    if (isSavingStatusMessage) return;

    const normalizedStatusMessage = statusMessageDraft.trim();
    setIsSavingStatusMessage(true);
    setStatusMessageError("");

    try {
      await memberApi.updateStatusMessage(normalizedStatusMessage || null);
      await refreshMemberProfile();
      setStatusMessageDraft(normalizedStatusMessage);
      setIsEditingStatusMessage(false);
    } catch (requestError) {
      setStatusMessageError(
        requestError instanceof Error
          ? requestError.message
          : "상태 메시지를 변경하지 못했습니다.",
      );
    } finally {
      setIsSavingStatusMessage(false);
    }
  };

  const handleProfileImageChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file || isUpdatingProfileImage) return;

    event.target.value = "";
    setProfileImageError("");

    if (file.type !== "image/jpeg" && file.type !== "image/png") {
      setProfileImageError("JPEG 또는 PNG 이미지만 선택할 수 있습니다.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setProfileImageError("프로필 사진은 5MB 이하만 선택할 수 있습니다.");
      return;
    }

    setPendingProfileImage({
      file,
      previewUrl: URL.createObjectURL(file),
    });
    setProfileImageAction("upload");
  };

  const handleOpenProfileImageSource = () => {
    if (isUpdatingProfileImage) return;

    setProfileImageError("");
    setIsProfileImageSourceOpen(true);
  };

  const handleSelectProfileImageUpload = () => {
    setIsProfileImageSourceOpen(false);
    profileImageInputRef.current?.click();
  };

  const handleRequestSocialProfileImage = () => {
    setIsProfileImageSourceOpen(false);
    setPendingProfileImage(null);
    setProfileImageError("");
    setProfileImageAction("social");
  };

  const handleRequestDeleteProfileImage = () => {
    if (isUpdatingProfileImage) return;

    setIsProfileImageSourceOpen(false);
    setPendingProfileImage(null);
    setProfileImageError("");
    setProfileImageAction("delete");
  };

  const handleCloseProfileImageConfirmation = () => {
    if (isUpdatingProfileImage) return;

    setPendingProfileImage(null);
    setProfileImageAction(null);
  };

  const handleConfirmProfileImageAction = async () => {
    if (!profileImageAction || isUpdatingProfileImage) return;
    if (profileImageAction === "upload" && !pendingProfileImage) return;

    setIsUpdatingProfileImage(true);
    setProfileImageError("");

    try {
      if (profileImageAction === "upload" && pendingProfileImage) {
        await memberApi.uploadProfileImage(pendingProfileImage.file);
      } else if (profileImageAction === "social") {
        await memberApi.applySocialProfileImage("GOOGLE");
      } else {
        await memberApi.deleteProfileImage();
      }

      await refreshMemberProfile();
      setPendingProfileImage(null);
      setProfileImageAction(null);
    } catch (requestError) {
      setProfileImageError(
        requestError instanceof Error
          ? requestError.message
          : profileImageAction === "upload"
            ? "프로필 사진을 변경하지 못했습니다."
            : profileImageAction === "social"
              ? "Google 프로필 사진을 적용하지 못했습니다."
              : "프로필 사진을 삭제하지 못했습니다.",
      );
    } finally {
      setIsUpdatingProfileImage(false);
    }
  };

  const handleOpenCreateRoomModal = () => {
    setRoomCreationError("");
    setIsCreateRoomModalOpen(true);
  };

  const handleCloseCreateRoomModal = () => {
    if (isCreatingRoom) return;

    setRoomName("");
    setRoomCreationError("");
    setIsCreateRoomModalOpen(false);
  };

  const loadRoomMembers = useCallback(async (roomId: number) => {
    const requestId = ++memberRequestIdRef.current;
    setIsLoadingMembers(true);
    setMemberListError("");

    try {
      const response = await chatRoomApi.getMembers(roomId);
      if (memberRequestIdRef.current === requestId) {
        setRoomMembers(response);
      }
    } catch (loadError) {
      if (memberRequestIdRef.current === requestId) {
        setRoomMembers([]);
        setMemberListError(
          loadError instanceof Error
            ? loadError.message
            : "채팅방 멤버를 불러오지 못했습니다.",
        );
      }
    } finally {
      if (memberRequestIdRef.current === requestId) {
        setIsLoadingMembers(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeRoomId === null || activeRoom?.type !== "GROUP") {
      memberRequestIdRef.current += 1;
      setRoomMembers([]);
      setIsLoadingMembers(false);
      setMemberListError("");
      setIsMemberListOpen(false);
      return;
    }

    void loadRoomMembers(activeRoomId);
  }, [activeRoom?.type, activeRoomId, loadRoomMembers]);

  const handleToggleMemberList = () => {
    if (isMemberListOpen) {
      setIsMemberListOpen(false);
      return;
    }

    setIsRoomMenuOpen(false);
    setIsMemberListOpen(true);
  };

  const handleToggleRoomMenu = () => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen((isOpen) => !isOpen);
  };

  const handleOpenInviteLinkModal = async () => {
    if (!activeRoom) return;

    setIsRoomMenuOpen(false);
    setInviteTargetRoom(activeRoom);
    setInviteLink(null);
    setInviteError("");
    setInviteNotice("");
    setInviteOperation("loading");

    try {
      setInviteLink(await chatRoomApi.getInviteLink(activeRoom.roomId));
    } catch (loadError) {
      if (!(loadError instanceof ApiError && loadError.status === 404)) {
        setInviteError(
          loadError instanceof Error
            ? loadError.message
            : "초대 링크를 불러오지 못했습니다.",
        );
      }
    } finally {
      setInviteOperation(null);
    }
  };

  const handleCloseInviteLinkModal = () => {
    if (inviteOperation !== null) return;

    setInviteTargetRoom(null);
    setInviteLink(null);
    setInviteError("");
    setInviteNotice("");
  };

  const handleCreateInviteLink = async () => {
    if (!inviteTargetRoom || inviteOperation !== null) return;

    setInviteOperation("create");
    setInviteError("");
    setInviteNotice("");

    try {
      setInviteLink(await chatRoomApi.createInviteLink(
        inviteTargetRoom.roomId,
        { expiration: inviteExpiration },
      ));
      setInviteNotice("초대 링크를 생성했습니다.");
    } catch (createError) {
      setInviteError(
        createError instanceof Error
          ? createError.message
          : "초대 링크를 생성하지 못했습니다.",
      );
    } finally {
      setInviteOperation(null);
    }
  };

  const handleReissueInviteLink = async () => {
    if (!inviteTargetRoom || inviteOperation !== null) return;

    setInviteOperation("reissue");
    setInviteError("");
    setInviteNotice("");

    try {
      setInviteLink(await chatRoomApi.reissueInviteLink(
        inviteTargetRoom.roomId,
        { expiration: inviteExpiration },
      ));
      setInviteNotice("초대 링크를 재발급했습니다.");
    } catch (reissueError) {
      setInviteError(
        reissueError instanceof Error
          ? reissueError.message
          : "초대 링크를 재발급하지 못했습니다.",
      );
    } finally {
      setInviteOperation(null);
    }
  };

  const handleDeleteInviteLink = async () => {
    if (!inviteTargetRoom || inviteOperation !== null) return;

    setInviteOperation("delete");
    setInviteError("");
    setInviteNotice("");

    try {
      await chatRoomApi.deleteInviteLink(inviteTargetRoom.roomId);
      setInviteLink(null);
      setInviteNotice("초대 링크를 삭제했습니다.");
    } catch (deleteError) {
      setInviteError(
        deleteError instanceof Error
          ? deleteError.message
          : "초대 링크를 삭제하지 못했습니다.",
      );
    } finally {
      setInviteOperation(null);
    }
  };

  const handleCopyInviteLink = async () => {
    if (!inviteUrl || inviteOperation !== null) return;

    setInviteOperation("copy");
    setInviteError("");
    setInviteNotice("");

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteNotice("초대 링크를 복사했습니다.");
    } catch {
      setInviteError("초대 링크를 복사하지 못했습니다.");
    } finally {
      setInviteOperation(null);
    }
  };

  const handleOpenOwnerTransferModal = (target: ChatRoomMemberResponse) => {
    if (
      !activeRoom
      || activeRoom.role !== "OWNER"
      || target.memberId === memberId
      || target.role === "OWNER"
    ) {
      return;
    }

    setIsMemberListOpen(false);
    setOwnerTransferError("");
    setOwnerTransferTarget(target);
  };

  const handleCloseOwnerTransferModal = () => {
    if (isTransferringOwnership) return;

    setOwnerTransferError("");
    setOwnerTransferTarget(null);
  };

  const handleTransferOwnership = async () => {
    if (!activeRoom || !ownerTransferTarget || isTransferringOwnership) return;

    const roomId = activeRoom.roomId;
    setIsTransferringOwnership(true);
    setOwnerTransferError("");

    try {
      await chatRoomApi.transferOwnership(roomId, {
        newOwnerMemberId: ownerTransferTarget.memberId,
      });
      await Promise.all([
        loadRooms(roomId),
        loadRoomMembers(roomId),
      ]);
      setOwnerTransferTarget(null);
      setIsMemberListOpen(true);
    } catch (transferError) {
      setOwnerTransferError(
        transferError instanceof Error
          ? transferError.message
          : "방장 위임에 실패했습니다.",
      );
    } finally {
      setIsTransferringOwnership(false);
    }
  };

  const revealMessageSearchResult = (
    target: ChatMessage,
    index: number,
  ) => {
    if (activeRoomId === null) return;

    pendingSearchScrollMessageIdRef.current = target.messageId;
    shouldScrollToBottomRef.current = false;
    setMessageSearchIndex(index);
    setMessagesByRoom((current) => ({
      ...current,
      [activeRoomId]: mergeMessages(
        current[activeRoomId] ?? [],
        [target],
      ),
    }));
  };

  const handleToggleMessageSearch = () => {
    if (isMessageSearchOpen) {
      resetMessageSearch();
      return;
    }

    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setIsMessageSearchOpen(true);
    setMessageSearchError("");
  };

  const handleSearchMessages = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeRoom || isSearchingMessages) return;

    const normalizedKeyword = messageSearchQuery.trim();
    if (!normalizedKeyword) {
      setMessageSearchError("검색어를 입력해주세요.");
      return;
    }

    const roomId = activeRoom.roomId;
    const requestId = ++messageSearchRequestIdRef.current;
    setIsSearchingMessages(true);
    setMessageSearchError("");

    try {
      const response = await chatRoomApi.searchMessages(
        roomId,
        normalizedKeyword,
      );
      if (
        requestId !== messageSearchRequestIdRef.current
        || activeRoomIdRef.current !== roomId
      ) {
        return;
      }

      setMessageSearchKeyword(normalizedKeyword);
      setMessageSearchResults(response.content);
      setMessageSearchHasNext(response.hasNext);
      setMessageSearchNextCursor(response.nextCursor);

      const firstResult = response.content[0];
      if (firstResult) {
        revealMessageSearchResult(firstResult, 0);
      } else {
        setMessageSearchIndex(-1);
      }
    } catch (searchError) {
      if (requestId !== messageSearchRequestIdRef.current) return;

      setMessageSearchResults([]);
      setMessageSearchIndex(-1);
      setMessageSearchHasNext(false);
      setMessageSearchNextCursor(null);
      setMessageSearchError(
        searchError instanceof Error
          ? searchError.message
          : "메시지를 검색하지 못했습니다.",
      );
    } finally {
      if (requestId === messageSearchRequestIdRef.current) {
        setIsSearchingMessages(false);
      }
    }
  };

  const handlePreviousSearchResult = () => {
    const previousIndex = messageSearchIndex - 1;
    const target = messageSearchResults[previousIndex];
    if (!target) return;

    revealMessageSearchResult(target, previousIndex);
  };

  const handleNextSearchResult = async () => {
    if (!activeRoom || messageSearchIndex < 0 || isSearchingMessages) return;

    const nextIndex = messageSearchIndex + 1;
    const loadedTarget = messageSearchResults[nextIndex];
    if (loadedTarget) {
      revealMessageSearchResult(loadedTarget, nextIndex);
      return;
    }

    if (
      !messageSearchHasNext
      || messageSearchNextCursor === null
      || !messageSearchKeyword
    ) {
      return;
    }

    const roomId = activeRoom.roomId;
    const requestId = ++messageSearchRequestIdRef.current;
    setIsSearchingMessages(true);
    setMessageSearchError("");

    try {
      const response = await chatRoomApi.searchMessages(
        roomId,
        messageSearchKeyword,
        messageSearchNextCursor,
      );
      if (
        requestId !== messageSearchRequestIdRef.current
        || activeRoomIdRef.current !== roomId
      ) {
        return;
      }

      const existingIds = new Set(
        messageSearchResults.map((item) => item.messageId),
      );
      const additionalResults = response.content.filter(
        (item) => !existingIds.has(item.messageId),
      );
      const combinedResults = [
        ...messageSearchResults,
        ...additionalResults,
      ];

      setMessageSearchResults(combinedResults);
      setMessageSearchHasNext(response.hasNext);
      setMessageSearchNextCursor(response.nextCursor);

      const firstAdditionalResult = additionalResults[0];
      if (firstAdditionalResult) {
        revealMessageSearchResult(
          firstAdditionalResult,
          messageSearchResults.length,
        );
      }
    } catch (searchError) {
      if (requestId !== messageSearchRequestIdRef.current) return;

      setMessageSearchError(
        searchError instanceof Error
          ? searchError.message
          : "다음 검색 결과를 불러오지 못했습니다.",
      );
    } finally {
      if (requestId === messageSearchRequestIdRef.current) {
        setIsSearchingMessages(false);
      }
    }
  };

  const handleMinimizeRoom = useCallback(() => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setOwnerTransferTarget(null);
    setOwnerTransferError("");
    activeRoomIdRef.current = null;
    isChatOpenRef.current = false;
    setActiveRoomId(null);
    setIsChatOpen(false);
  }, []);

  const handleSelectGalleryTab = (tab: ChatGalleryTab) => {
    if (isChatOpenRef.current) {
      handleMinimizeRoom();
    }

    setViewedMemberProfile(null);
    setFriendNotice("");
    setDirectChatError("");
    setActiveGalleryTab(tab);

    if (tab === "friends" && activeGalleryTab === "friends") {
      void loadFriendPanel(friendPanelTab);
      if (friendPanelTab !== "received") {
        void loadReceivedFriendRequests(true);
      }
    }
  };

  const handleSelectFriendPanel = (tab: FriendPanelTab) => {
    setFriendNotice("");

    if (tab === friendPanelTab) {
      void loadFriendPanel(tab);
      return;
    }

    setFriendPanelTab(tab);
  };

  const handleOpenFriendRequests = (tab: "sent" | "received") => {
    const shouldRefreshCurrentPanel = activeGalleryTab === "friends"
      && friendPanelTab === tab;

    if (isChatOpenRef.current) {
      handleMinimizeRoom();
    }

    setViewedMemberProfile(null);
    setFriendNotice("");
    setActiveGalleryTab("friends");

    if (shouldRefreshCurrentPanel) {
      void loadFriendPanel(tab);
    } else if (friendPanelTab !== tab) {
      setFriendPanelTab(tab);
    }
  };

  const handleOpenRoom = (roomId: number, toggleIfActive = true) => {
    if (
      toggleIfActive
      && activeRoomIdRef.current === roomId
      && isChatOpenRef.current
    ) {
      handleMinimizeRoom();
      return;
    }

    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setOwnerTransferTarget(null);
    setOwnerTransferError("");
    activeRoomIdRef.current = roomId;
    isChatOpenRef.current = true;
    setOpenRoomIds((current) => current.includes(roomId)
      ? current
      : [...current, roomId].slice(-3));
    setActiveRoomId(roomId);
    setIsChatOpen(true);
  };

  const handleCloseDirectChatModal = () => {
    if (isSendingDirectMessage) return;
    setDirectChatTarget(null);
    setDirectMessageDraft("");
    setDirectChatError("");
  };

  const handleRequestDirectChat = async (target: DirectChatTarget) => {
    if (openingDirectMemberId !== null) return;

    setOpeningDirectMemberId(target.memberId);
    setDirectChatError("");

    try {
      const response = await chatRoomApi.findDirect(target.memberId);
      if (response.roomId !== null) {
        const loadedRooms = await loadRooms(response.roomId, true);
        if (!loadedRooms?.some((room) => room.roomId === response.roomId)) {
          throw new Error("1:1 채팅방을 불러오지 못했습니다.");
        }

        setViewedMemberProfile(null);
        setActiveGalleryTab("joined");
        handleOpenRoom(response.roomId, false);
        return;
      }

      if (target.status !== "ACTIVE") {
        setDirectChatError("비활성화된 회원과는 새 1:1 채팅을 시작할 수 없습니다.");
        return;
      }

      setDirectChatTarget(target);
      setDirectMessageDraft("");
    } catch (requestError) {
      setDirectChatError(
        requestError instanceof Error
          ? requestError.message
          : "1:1 채팅방을 확인하지 못했습니다.",
      );
    } finally {
      setOpeningDirectMemberId(null);
    }
  };

  const handleSendFirstDirectMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!directChatTarget || isSendingDirectMessage) return;

    const content = directMessageDraft.trim();
    if (!content) return;

    setIsSendingDirectMessage(true);
    setDirectChatError("");

    try {
      const response = await chatRoomApi.sendDirectMessage({
        targetMemberId: directChatTarget.memberId,
        content,
      });
      setMessagesByRoom((current) => ({
        ...current,
        [response.roomId]: mergeMessages(
          current[response.roomId] ?? [],
          [response.message],
        ),
      }));
      latestMessageIdByRoomRef.current.set(
        response.roomId,
        response.message.messageId,
      );

      const loadedRooms = await loadRooms(response.roomId, true);
      if (!loadedRooms?.some((room) => room.roomId === response.roomId)) {
        setDirectChatTarget(null);
        setDirectMessageDraft("");
        setDirectChatError(
          "첫 메시지는 전송되었지만 채팅방 목록을 갱신하지 못했습니다. 잠시 후 다시 확인해주세요.",
        );
        return;
      }

      setDirectChatTarget(null);
      setDirectMessageDraft("");
      setViewedMemberProfile(null);
      setActiveGalleryTab("joined");
      handleOpenRoom(response.roomId, false);
    } catch (requestError) {
      setDirectChatError(
        requestError instanceof Error
          ? requestError.message
          : "첫 메시지를 보내지 못했습니다.",
      );
    } finally {
      setIsSendingDirectMessage(false);
    }
  };

  const handleCloseRoom = () => {
    if (activeRoomId !== null) {
      setOpenRoomIds((current) => current.filter((roomId) => roomId !== activeRoomId));
    }
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    activeRoomIdRef.current = null;
    isChatOpenRef.current = false;
    setActiveRoomId(null);
    setIsChatOpen(false);
    setError("");
  };

  const moveRoomAvatarPage = (offset: number) => {
    setRoomAvatarPage((current) => Math.min(
      roomAvatarPageCount - 1,
      Math.max(0, current + offset),
    ));
  };

  const handleRoomAvatarKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    moveRoomAvatarPage(event.key === "ArrowRight" ? 1 : -1);
  };

  const handleRoomAvatarWheel = (event: ReactWheelEvent<HTMLElement>) => {
    if (roomAvatarPageCount <= 1) return;

    event.preventDefault();
    const now = performance.now();
    if (now - lastRoomAvatarWheelAtRef.current < 240) return;

    const direction = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? Math.sign(event.deltaX)
      : Math.sign(event.deltaY);
    if (direction !== 0) {
      lastRoomAvatarWheelAtRef.current = now;
      moveRoomAvatarPage(direction);
    }
  };

  return (
    <main
      className={[
        "chat-shell",
        `gallery-tab-${activeGalleryTab}`,
        isChatOpen ? "chat-view-active" : "room-browser",
      ].filter(Boolean).join(" ")}
    >
      <aside className="chat-sidebar">
        <div className="terminal-dashboard-bar">
          <div className="terminal-dashboard-controls" aria-hidden="true">
            <span className="terminal-control close" />
            <span className="terminal-control minimize" />
            <span className="terminal-control maximize" />
          </div>
          <strong>VERITAS TERMINAL</strong>
          <span className={isConnected ? "online" : ""}>
            {isConnected ? "ONLINE" : "CONNECTING"}
          </span>
        </div>
        <div className="room-sidebar-header">
          <div className="terminal-dashboard-intro">
            <p className="terminal-dashboard-command">
              <span>{nickname}@veritas:~$</span> workspace --status
            </p>
            <h1>VERITAS NETWORK</h1>
            <p className="terminal-dashboard-status">
              {isConnected ? "secure session established" : "establishing secure session..."}
            </p>
          </div>
          <div className="room-header-actions">
            <button
              className="open-create-room-button"
              type="button"
              onClick={handleOpenCreateRoomModal}
              aria-label="채팅방 생성 열기"
            >
              <span className="plus-icon" aria-hidden="true" />
              <span className="dashboard-action-label">create room</span>
            </button>
            <button
              className="profile-trigger gallery-profile-trigger"
              type="button"
              onClick={handleOpenOwnProfile}
              aria-haspopup="dialog"
              aria-label="내 프로필 열기"
            >
              <ChatAvatar
                name={nickname}
                imageUrl={ownProfileImageUrl}
                className="profile-trigger-avatar"
              />
              <span className="dashboard-action-label">whoami</span>
            </button>
          </div>
        </div>

        <nav className="chat-gallery-tabs" aria-label="채팅 메뉴">
          <button
            className={activeGalleryTab === "joined" ? "active" : ""}
            type="button"
            onClick={() => handleSelectGalleryTab("joined")}
            aria-label="참여 중인 채팅방"
            aria-current={activeGalleryTab === "joined" ? "page" : undefined}
          >
            {activeGalleryTab === "joined" && <motion.span className="chat-tab-indicator" layoutId="chat-gallery-tab" />}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5.5 5.5h13A2.5 2.5 0 0 1 21 8v7a2.5 2.5 0 0 1-2.5 2.5H11L6 21v-3.5h-.5A2.5 2.5 0 0 1 3 15V8a2.5 2.5 0 0 1 2.5-2.5Z" />
            </svg>
            <span className="chat-tab-command">rooms --joined</span>
            {totalUnreadCount > 0 && (
              <em aria-label={`읽지 않은 메시지 ${totalUnreadCount}개`}>
                {totalUnreadCount > 99 ? "99+" : totalUnreadCount}
              </em>
            )}
            <span className="chat-tab-tooltip">참여 중인 채팅방</span>
          </button>
          <button
            className={activeGalleryTab === "available" ? "active" : ""}
            type="button"
            onClick={() => handleSelectGalleryTab("available")}
            aria-label="참여 가능한 채팅방"
            aria-current={activeGalleryTab === "available" ? "page" : undefined}
          >
            {activeGalleryTab === "available" && <motion.span className="chat-tab-indicator" layoutId="chat-gallery-tab" />}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5.5 5.5h9A2.5 2.5 0 0 1 17 8v2M11 17.5H9L5 21v-3.5A2.5 2.5 0 0 1 3 15V8a2.5 2.5 0 0 1 2.5-2.5M18 13v8M14 17h8" />
            </svg>
            <span className="chat-tab-command">rooms --discover</span>
            <span className="chat-tab-tooltip">참여 가능한 채팅방</span>
          </button>
          <button
            className={activeGalleryTab === "friends" ? "active" : ""}
            type="button"
            onClick={() => handleSelectGalleryTab("friends")}
            aria-label={receivedFriendRequests.content.length > 0
              ? "친구, 받은 친구 요청 있음"
              : "친구"}
            aria-current={activeGalleryTab === "friends" ? "page" : undefined}
          >
            {activeGalleryTab === "friends" && <motion.span className="chat-tab-indicator" layoutId="chat-gallery-tab" />}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 19v-1.2c0-2.1-1.7-3.8-3.8-3.8H6.8A3.8 3.8 0 0 0 3 17.8V19M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 1 0 0-6M17 14c2.3 0 4 1.7 4 4v1" />
            </svg>
            <span className="chat-tab-command">friends --list</span>
            {receivedFriendRequests.content.length > 0 && (
              <span
                className="friend-request-signal top-level"
                aria-label="받은 친구 요청 있음"
              />
            )}
            <span className="chat-tab-tooltip">친구</span>
          </button>
        </nav>

        {activeGalleryTab === "joined" && (
          <section className="joined-room-gallery" aria-label="참여 중인 채팅방">
            <TerminalTypedCommand command="rooms --joined" />
            {isLoadingRooms && (
              <p className="room-list-status">채팅방을 불러오는 중...</p>
            )}
            {!isLoadingRooms && roomListError && (
              <div className="room-list-error" role="alert">
                <p>{roomListError}</p>
                <button type="button" onClick={() => void loadRooms()}>
                  다시 시도
                </button>
              </div>
            )}
            {!isLoadingRooms && !roomListError && rooms.length === 0 && (
              <p className="room-list-status">참여 중인 채팅방이 없습니다.</p>
            )}
            {!isLoadingRooms && !roomListError && rooms.length > 0 && (
              <nav
                className="terminal-room-sessions"
                aria-label="참여 중인 채팅방 선택"
                tabIndex={0}
                onKeyDown={handleRoomAvatarKeyDown}
                onWheel={handleRoomAvatarWheel}
              >
                <div className="terminal-room-session-header" aria-hidden="true">
                  <span className="terminal-session-cursor" />
                  <span className="terminal-session-id">ID</span>
                  <span className="terminal-session-type">TYPE</span>
                  <span className="terminal-session-name">ROOM</span>
                  <span className="terminal-session-unread">UNREAD</span>
                </div>
                <div className="terminal-room-session-list">
                  {visibleRoomAvatars.map((room, index) => {
                    const roomName = room.name ?? "Direct";
                    const isActive = room.roomId === activeRoomId && isChatOpen;
                    const sessionNumber = roomAvatarPage * ROOM_AVATARS_PER_PAGE + index + 1;
                    return (
                      <motion.button
                        className={[
                          "terminal-room-session-row",
                          isActive ? "active" : "",
                        ].filter(Boolean).join(" ")}
                        key={room.roomId}
                        type="button"
                        onClick={() => handleOpenRoom(room.roomId)}
                        aria-label={`${room.type === "DIRECT" ? "1대1" : "그룹"} 채팅방 ${roomName} 열기`}
                        aria-current={isActive ? "true" : undefined}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{
                          duration: 0.14,
                          delay: prefersReducedMotion ? 0 : 0.18 + index * 0.025,
                        }}
                      >
                        <span className="terminal-session-cursor" aria-hidden="true">
                          {isActive ? ">" : ""}
                        </span>
                        <span className="terminal-session-id">
                          [{String(sessionNumber).padStart(2, "0")}]
                        </span>
                        <span
                          className={[
                            "terminal-session-type",
                            room.type === "DIRECT" ? "direct" : "group",
                          ].join(" ")}
                        >
                          [{room.type}]
                        </span>
                        <strong className="terminal-session-name">{roomName}</strong>
                        <span
                          key={room.unreadCount}
                          className={[
                            "terminal-session-unread",
                            room.unreadCount > 0 ? "has-unread" : "",
                          ].filter(Boolean).join(" ")}
                          aria-label={room.unreadCount > 0
                            ? `읽지 않은 메시지 ${room.unreadCount}개`
                            : "읽지 않은 메시지 없음"}
                        >
                          {room.unreadCount > 0
                            ? `● ${room.unreadCount > 99 ? "99+" : room.unreadCount}`
                            : "-"}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
                {roomAvatarPageCount > 1 && (
                  <div className="terminal-session-pagination">
                    <button
                      type="button"
                      onClick={() => moveRoomAvatarPage(-1)}
                      disabled={roomAvatarPage === 0}
                      aria-label="이전 채팅방 보기"
                    >
                      ← prev
                    </button>
                    <span aria-live="polite">
                      page {roomAvatarPage + 1}/{roomAvatarPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => moveRoomAvatarPage(1)}
                      disabled={roomAvatarPage >= roomAvatarPageCount - 1}
                      aria-label="다음 채팅방 보기"
                    >
                      next →
                    </button>
                  </div>
                )}
              </nav>
            )}
          </section>
        )}

        {activeGalleryTab === "available" && (
          <section className="available-room-section" aria-label="참여 가능한 채팅방">
            <TerminalTypedCommand command="rooms --discover" />
            <label className="terminal-search-command" htmlFor="room-search">
              <span>$</span> scan --name
            </label>
            <div className="room-search compact-room-search">
              <div>
                <span aria-hidden="true">⌕</span>
                <input
                  id="room-search"
                  type="search"
                  value={roomSearchQuery}
                  onChange={(event) => setRoomSearchQuery(event.target.value)}
                  placeholder="참여할 채팅방 검색"
                  aria-label="참여 가능한 채팅방 검색"
                />
              </div>
            </div>
          {isLoadingAvailableRooms && (
            <p className="room-list-status">참여 가능한 방을 불러오는 중...</p>
          )}
          {!isLoadingAvailableRooms && availableRoomError && (
            <div className="room-list-error" role="alert">
              <p>{availableRoomError}</p>
              <button type="button" onClick={() => void loadAvailableRooms()}>
                다시 시도
              </button>
            </div>
          )}
          {!isLoadingAvailableRooms
            && !availableRoomError
            && availableRooms.length === 0 && (
              <p className="room-list-status">참여 가능한 채팅방이 없습니다.</p>
          )}
          {!isLoadingAvailableRooms
            && !availableRoomError
            && availableRooms.length > 0
            && filteredAvailableRooms.length === 0 && (
              <p className="room-list-status">검색 결과가 없습니다.</p>
          )}
          {filteredAvailableRooms.map((room, index) => (
            <motion.button
              className="available-room-card"
              key={room.roomId}
              type="button"
              onClick={() => handleOpenJoinRoomModal(room)}
              disabled={joiningRoomId !== null}
              aria-haspopup="dialog"
              aria-label={`${room.name} 참여 가능 채팅방`}
              initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.14,
                delay: prefersReducedMotion ? 0 : 0.18 + Math.min(index, 7) * 0.025,
              }}
            >
              <span className="room-card-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M5.5 5.5h9A2.5 2.5 0 0 1 17 8v2M11 17.5H9L5 21v-3.5A2.5 2.5 0 0 1 3 15V8a2.5 2.5 0 0 1 2.5-2.5M18 13v8M14 17h8" />
                </svg>
              </span>
              <span className="room-gallery-copy">
                <strong>{room.name}</strong>
                <small>참여하기</small>
              </span>
            </motion.button>
          ))}
          </section>
        )}

        {activeGalleryTab === "friends" && (
          <section className="friends-section" aria-label="친구">
            <TerminalTypedCommand command="friends --list" />
            <nav className="friend-panel-tabs" aria-label="친구 목록 구분">
              <button
                className={friendPanelTab === "accepted" ? "active" : ""}
                type="button"
                onClick={() => handleSelectFriendPanel("accepted")}
                aria-current={friendPanelTab === "accepted" ? "page" : undefined}
              >
                friends
              </button>
              <button
                className={friendPanelTab === "received" ? "active" : ""}
                type="button"
                onClick={() => handleSelectFriendPanel("received")}
                aria-current={friendPanelTab === "received" ? "page" : undefined}
              >
                requests --received
                {receivedFriendRequests.content.length > 0 && (
                  <span
                    className="friend-request-signal"
                    aria-label="받은 친구 요청 있음"
                  />
                )}
              </button>
              <button
                className={friendPanelTab === "sent" ? "active" : ""}
                type="button"
                onClick={() => handleSelectFriendPanel("sent")}
                aria-current={friendPanelTab === "sent" ? "page" : undefined}
              >
                requests --sent
              </button>
            </nav>

            {friendNotice && (
              <p className="friend-notice" role="status">{friendNotice}</p>
            )}
            {directChatError && !directChatTarget && (
              <div className="friend-error" role="alert">
                <p>{directChatError}</p>
              </div>
            )}
            {activeFriendPanelError && (
              <div className="friend-error" role="alert">
                <p>{activeFriendPanelError}</p>
                <button type="button" onClick={() => void loadFriendPanel(friendPanelTab)}>
                  다시 시도
                </button>
              </div>
            )}

            {isLoadingActiveFriendPanel && (
              <p className="friend-list-status">친구 정보를 불러오는 중...</p>
            )}

            {!isLoadingActiveFriendPanel && !activeFriendPanelError && friendPanelTab === "accepted" && (
              <motion.div
                className="terminal-friend-list"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16 }}
              >
                {friends.length === 0 ? (
                  <p className="friend-list-status">아직 연결된 친구가 없습니다.</p>
                ) : friends.map((friend) => (
                  <article className="terminal-friend-row" key={friend.memberId}>
                    <button
                      className="friend-identity-button"
                      type="button"
                      onClick={() => handleOpenMemberProfile(friend.memberId, friend.displayName)}
                    >
                      <ChatAvatar
                        name={friend.displayName}
                        imageUrl={memberApi.getProfileImageUrl(friend.memberId)}
                        className="friend-list-avatar"
                      />
                      <span>
                        <strong>{friend.displayName}</strong>
                        <small>
                          {friend.statusMessage?.trim() || "상태 메시지 없음"}
                        </small>
                      </span>
                    </button>
                    <div className="friend-request-actions">
                      <button
                        className="friend-row-action"
                        type="button"
                        onClick={() => void handleRequestDirectChat({
                          memberId: friend.memberId,
                          displayName: friend.displayName,
                          status: friend.status,
                        })}
                        disabled={openingDirectMemberId !== null}
                      >
                        {openingDirectMemberId === friend.memberId
                          ? "opening..."
                          : "message"}
                      </button>
                      <button
                        className="friend-row-action danger"
                        type="button"
                        onClick={() => handleRequestUnfollow({
                          memberId: friend.memberId,
                          displayName: friend.displayName,
                        })}
                        disabled={friendOperationKeys.includes(`unfollow:${friend.memberId}`)}
                      >
                        disconnect
                      </button>
                    </div>
                  </article>
                ))}
              </motion.div>
            )}

            {!isLoadingActiveFriendPanel && !activeFriendPanelError && friendPanelTab === "received" && (
              <div className="terminal-friend-list">
                {receivedFriendRequests.content.length === 0 ? (
                  <p className="friend-list-status">받은 친구 요청이 없습니다.</p>
                ) : receivedFriendRequests.content.map((request) => (
                  <article className="terminal-friend-row request" key={request.requestId}>
                    <button
                      className="friend-identity-button"
                      type="button"
                      onClick={() => handleOpenMemberProfile(
                        request.targetMemberId,
                        request.targetDisplayName,
                      )}
                    >
                      <ChatAvatar
                        name={request.targetDisplayName}
                        imageUrl={memberApi.getProfileImageUrl(request.targetMemberId)}
                        className="friend-list-avatar"
                      />
                      <span>
                        <strong>{request.targetDisplayName}</strong>
                        <small>
                          received {friendRequestDateFormatter.format(new Date(request.createdAt))}
                        </small>
                      </span>
                    </button>
                    <div className="friend-request-actions">
                      <button
                        className="friend-row-action"
                        type="button"
                        onClick={() => void handleAcceptFriendRequest(request)}
                        disabled={isFriendRequestOperationRunning(request.requestId)}
                      >
                        accept
                      </button>
                      <button
                        className="friend-row-action danger"
                        type="button"
                        onClick={() => void handleDeleteFriendRequest(request, "received")}
                        disabled={isFriendRequestOperationRunning(request.requestId)}
                      >
                        reject
                      </button>
                    </div>
                  </article>
                ))}
                {receivedFriendRequests.hasNext && (
                  <button
                    className="friend-load-more"
                    type="button"
                    onClick={() => void loadMoreFriendRequests("received")}
                    disabled={isLoadingMoreReceivedFriendRequests}
                  >
                    {isLoadingMoreReceivedFriendRequests ? "loading..." : "more --received"}
                  </button>
                )}
              </div>
            )}

            {!isLoadingActiveFriendPanel && !activeFriendPanelError && friendPanelTab === "sent" && (
              <div className="terminal-friend-list">
                {sentFriendRequests.content.length === 0 ? (
                  <p className="friend-list-status">보낸 친구 요청이 없습니다.</p>
                ) : sentFriendRequests.content.map((request) => (
                  <article className="terminal-friend-row request" key={request.requestId}>
                    <button
                      className="friend-identity-button"
                      type="button"
                      onClick={() => handleOpenMemberProfile(
                        request.targetMemberId,
                        request.targetDisplayName,
                      )}
                    >
                      <ChatAvatar
                        name={request.targetDisplayName}
                        imageUrl={memberApi.getProfileImageUrl(request.targetMemberId)}
                        className="friend-list-avatar"
                      />
                      <span>
                        <strong>{request.targetDisplayName}</strong>
                        <small>
                          sent {friendRequestDateFormatter.format(new Date(request.createdAt))}
                        </small>
                      </span>
                    </button>
                    <button
                      className="friend-row-action danger"
                      type="button"
                      onClick={() => void handleDeleteFriendRequest(request, "sent")}
                      disabled={isFriendRequestOperationRunning(request.requestId)}
                    >
                      cancel
                    </button>
                  </article>
                ))}
                {sentFriendRequests.hasNext && (
                  <button
                    className="friend-load-more"
                    type="button"
                    onClick={() => void loadMoreFriendRequests("sent")}
                    disabled={isLoadingMoreSentFriendRequests}
                  >
                    {isLoadingMoreSentFriendRequests ? "loading..." : "more --sent"}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

      </aside>

      <section
        className="chat-workspace"
        inert={!isChatOpen}
      >
        <header className="chat-header">
          <div className="chat-room-heading">
            <button
              className="return-to-sessions-button"
              type="button"
              onClick={handleMinimizeRoom}
              aria-label="채팅방 목록으로 돌아가기"
            >
              <span aria-hidden="true">←</span> sessions
            </button>
            <span className="terminal-chat-command" aria-hidden="true">
              <strong>$</strong>
              <span>attach</span>
              <span className="terminal-chat-command-option">--room</span>
            </span>
            <h1>"{activeRoom?.name ?? "채팅방 없음"}"</h1>
            {activeRoom?.type === "GROUP" && (
              <div className="members-popover-anchor">
                <button
                  className="member-summary-button"
                  type="button"
                  onClick={handleToggleMemberList}
                  disabled={!activeRoom}
                  aria-expanded={isMemberListOpen}
                  aria-controls="chat-room-members"
                  aria-label="채팅방 멤버 목록"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M16 20v-1.5c0-2.2-1.8-4-4-4H7c-2.2 0-4 1.8-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 0 0 0-6M18 14.7c1.8.5 3 2.1 3 3.8V20"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{isLoadingMembers ? "…" : roomMembers.length}</span>
                </button>

                {isMemberListOpen && activeRoom && (
                  <section
                    className="members-dropdown"
                    id="chat-room-members"
                    aria-label={`${activeRoom.name ?? "Direct"} 멤버 목록`}
                  >
                    <div className="members-dropdown-header">
                      <strong>$ members --list</strong>
                      {!isLoadingMembers && !memberListError && (
                        <span>{roomMembers.length}명</span>
                      )}
                    </div>

                    {isLoadingMembers && (
                      <p className="members-status">멤버를 불러오는 중...</p>
                    )}

                    {!isLoadingMembers && memberListError && (
                      <div className="members-error" role="alert">
                        <p>{memberListError}</p>
                        <button
                          type="button"
                          onClick={() => void loadRoomMembers(activeRoom.roomId)}
                        >
                          다시 시도
                        </button>
                      </div>
                    )}

                    {!isLoadingMembers && !memberListError && roomMembers.length === 0 && (
                      <p className="members-status">표시할 멤버가 없습니다.</p>
                    )}

                    {!isLoadingMembers && !memberListError && roomMembers.length > 0 && (
                      <ul className="members-list">
                        {roomMembers.map((roomMember) => (
                          <li key={roomMember.memberId}>
                            <button
                              className="member-profile-trigger"
                              type="button"
                              onClick={() => handleOpenMemberProfile(
                                roomMember.memberId,
                                roomMember.displayName,
                              )}
                              aria-label={`${roomMember.displayName} 프로필 열기`}
                            >
                              <ChatAvatar
                                name={roomMember.displayName}
                                imageUrl={memberApi.getProfileImageUrl(roomMember.memberId)}
                                className="member-list-avatar"
                              />
                              <span className="member-list-identity">
                                <strong>{roomMember.displayName}</strong>
                                <small>
                                  {roomMember.role === "OWNER" ? "방장" : "멤버"}
                                  {roomMember.memberId === memberId ? " · 나" : ""}
                                </small>
                              </span>
                            </button>
                            {activeRoom.role === "OWNER"
                              && roomMember.role === "MEMBER"
                              && roomMember.memberId !== memberId && (
                                <button
                                  className="owner-transfer-button"
                                  type="button"
                                  onClick={() => handleOpenOwnerTransferModal(roomMember)}
                                >
                                  방장 위임
                                </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>
          <div className="chat-header-actions">
            <button
              className="message-search-button"
              type="button"
              onClick={handleToggleMessageSearch}
              disabled={!activeRoom || isActiveRoomDeleted}
              aria-expanded={isMessageSearchOpen}
              aria-controls="message-search-panel"
              aria-label="메시지 검색"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="4.5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="m12 12 4 4"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            {activeRoom && (
              <div className="room-menu-anchor">
              <button
                className="room-menu-button"
                type="button"
                onClick={handleToggleRoomMenu}
                disabled={!activeRoom || isActiveRoomDeleted}
                aria-expanded={isRoomMenuOpen}
                aria-controls="chat-room-menu"
                aria-label="채팅방 메뉴"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 6h12M4 10h12M4 14h12"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              {isRoomMenuOpen && activeRoom && (
                <div className="room-menu-dropdown" id="chat-room-menu">
                  <p className="terminal-menu-command">$ room --menu</p>
                  {activeRoom.type === "GROUP" && (
                    <>
                      <button
                        className="invite-link-menu-button"
                        type="button"
                        onClick={() => void handleOpenInviteLinkModal()}
                      >
                        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                          <path
                            d="M8.2 11.8 11.8 8.2M6.4 13.6l-1.1 1.1a2.55 2.55 0 0 1-3.6-3.6l2.2-2.2a2.55 2.55 0 0 1 3.6 0M13.6 6.4l1.1-1.1a2.55 2.55 0 0 1 3.6 3.6l-2.2 2.2a2.55 2.55 0 0 1-3.6 0"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        초대 링크
                      </button>
                      {activeRoom.role === "OWNER" && (
                        <>
                          <button
                            className="room-name-update-button"
                            type="button"
                            onClick={handleOpenRoomNameUpdateModal}
                          >
                            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                              <path
                                d="m4 13.5-.5 3 3-.5L15 7.5 12.5 5 4 13.5ZM11.5 6l2.5 2.5"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            채팅방 이름 변경
                          </button>
                          <button
                            className="delete-room-button"
                            type="button"
                            onClick={handleOpenDeleteRoomModal}
                          >
                            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                              <path
                                d="M4.5 6h11M8 3.5h4M6.5 6l.6 10h5.8l.6-10M8.5 8.5v5M11.5 8.5v5"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            채팅방 삭제
                          </button>
                        </>
                      )}
                    </>
                  )}
                  <button
                    className="leave-chat-button"
                    type="button"
                    onClick={handleOpenLeaveRoomModal}
                    disabled={isActiveRoomGroupOwner}
                    title={isActiveRoomGroupOwner
                      ? "방장은 소유권을 위임한 후 나갈 수 있습니다."
                      : "채팅방 나가기"}
                  >
                    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                      <path
                        d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8M12.5 6.5 16 10l-3.5 3.5M16 10H8"
                        stroke="currentColor"
                        strokeWidth="1.7"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    채팅방 나가기
                  </button>
                </div>
              )}
              </div>
            )}
            <button
              className="minimize-chat-button"
              type="button"
              onClick={handleMinimizeRoom}
              aria-label="채팅방 최소화"
              title="최소화"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path
                  d="M4 10h12"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <button
              className="close-chat-button"
              type="button"
              onClick={handleCloseRoom}
              aria-label="채팅방 닫기"
              title="닫기"
            >
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                <path
                  d="m5 5 10 10M15 5 5 15"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </header>

        {isMessageSearchOpen && activeRoom && (
          <section
            className="message-search-panel"
            id="message-search-panel"
            aria-label="채팅 메시지 검색"
          >
            <span className="terminal-message-search-command" aria-hidden="true">
              <strong>$</strong> grep --messages
            </span>
            <form onSubmit={(event) => void handleSearchMessages(event)}>
              <span className="message-search-input-icon" aria-hidden="true">
                <svg viewBox="0 0 20 20" fill="none">
                  <circle
                    cx="8.5"
                    cy="8.5"
                    r="4.5"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  />
                  <path
                    d="m12 12 4 4"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
              <input
                type="search"
                value={messageSearchQuery}
                onChange={(event) => setMessageSearchQuery(event.target.value)}
                maxLength={100}
                placeholder="메시지 검색"
                aria-label="메시지 검색어"
                autoFocus
              />
              <button
                className="message-search-submit"
                type="submit"
                disabled={isSearchingMessages || !messageSearchQuery.trim()}
              >
                {isSearchingMessages ? "검색 중" : "검색"}
              </button>
            </form>

            <div className="message-search-navigation">
              <span aria-live="polite">
                {messageSearchResults.length === 0
                  ? messageSearchKeyword
                    ? "검색 결과 없음"
                    : "검색어를 입력하세요"
                  : `${messageSearchIndex + 1} / ${messageSearchResults.length}${
                    messageSearchHasNext ? "+" : ""
                  }`}
              </span>
              <button
                type="button"
                onClick={() => void handleNextSearchResult()}
                disabled={
                  messageSearchIndex < 0
                  || isSearchingMessages
                  || (
                    messageSearchIndex >= messageSearchResults.length - 1
                    && !messageSearchHasNext
                  )
                }
                aria-label="더 이전 검색 결과"
                title="더 이전 검색 결과"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={handlePreviousSearchResult}
                disabled={messageSearchIndex <= 0 || isSearchingMessages}
                aria-label="더 최신 검색 결과"
                title="더 최신 검색 결과"
              >
                ↓
              </button>
              <button
                className="message-search-close"
                type="button"
                onClick={resetMessageSearch}
                aria-label="메시지 검색 닫기"
              >
                ×
              </button>
            </div>

            {messageSearchError && (
              <p className="message-search-error" role="alert">
                {messageSearchError}
              </p>
            )}
          </section>
        )}

        <div className="email-verification-area">
          {!emailVerified && <EmailVerificationPanel />}
        </div>

        <div className="message-list-shell">
          <div
            className="message-list"
            aria-live="polite"
            ref={messageListRef}
            onScroll={handleMessageListScroll}
          >
          {isLoadingRooms && (
            <div className="empty-chat">
              <span>•••</span>
              <h2>채팅방을 불러오는 중입니다.</h2>
            </div>
          )}

          {!isLoadingRooms && !activeRoom && (
            <div className="empty-chat">
              <span>•••</span>
              <h2>참여 중인 채팅방이 없습니다.</h2>
              <p>갤러리에서 새로운 채팅방을 만들어보세요.</p>
            </div>
          )}

          {activeRoom && !activeMessagePage?.initialized && activeMessagePage?.isLoading && (
            <p className="message-history-status">메시지를 불러오는 중...</p>
          )}

          {activeRoom && activeMessagePage?.error && (
            <div className="message-history-error" role="alert">
              <p>{activeMessagePage.error}</p>
              <button
                type="button"
                onClick={() => activeMessagePage.initialized
                  ? void handleLoadOlderMessages()
                  : void loadMessages(activeRoom.roomId)}
              >
                다시 시도
              </button>
            </div>
          )}

          {activeRoom
            && activeMessagePage?.initialized
            && activeMessagePage.hasNext
            && !activeMessagePage.error && (
            <div className="message-history-control">
              <button
                type="button"
                onClick={() => void handleLoadOlderMessages()}
                disabled={activeMessagePage.isLoading}
              >
                {activeMessagePage.isLoading ? "불러오는 중..." : "이전 메시지 불러오기"}
              </button>
            </div>
          )}

          {!isLoadingRooms
            && activeRoom
            && activeMessagePage?.initialized
            && messages.length === 0 && (
            <div className="empty-chat">
              <span>•••</span>
              <h2>{activeRoom.name ?? "Direct"}의 첫 메시지를 보내세요.</h2>
              <p>이 채팅방의 대화는 지금부터 시작됩니다.</p>
            </div>
          )}

          {messages.map((item, index) => {
            const previousMessage = messages[index - 1];
            const nextMessage = messages[index + 1];
            const shouldShowDate = !previousMessage
              || !isSameMessageDate(previousMessage.createdAt, item.createdAt);
            const continuesPreviousGroup = item.type !== "SYSTEM"
              && previousMessage?.type !== "SYSTEM"
              && previousMessage?.senderId === item.senderId
              && isSameMessageDate(previousMessage.createdAt, item.createdAt);
            const continuesNextGroup = item.type !== "SYSTEM"
              && nextMessage?.type !== "SYSTEM"
              && nextMessage?.senderId === item.senderId
              && isSameMessageDate(item.createdAt, nextMessage.createdAt);
            const shouldShowSenderHeader = !continuesPreviousGroup;
            const messageGroupPosition = continuesPreviousGroup
              ? continuesNextGroup ? "middle" : "end"
              : continuesNextGroup ? "start" : "single";
            const isLatestMessage = index === messages.length - 1;

            return (
              <Fragment key={item.messageId}>
                {shouldShowDate && (
                  <div className="message-date-divider">
                    <span>{formatMessageDate(item.createdAt)}</span>
                  </div>
                )}

                {item.type === "TEXT" ? (
                  <article
                    className={[
                      item.senderId === memberId ? "message own" : "message",
                      item.messageId === activeSearchMessageId
                        ? "search-target"
                        : "",
                      `message-group-${messageGroupPosition}`,
                      getMessageGroupAccentClass(item.senderId),
                      isLatestMessage ? "is-latest-message" : "",
                    ].filter(Boolean).join(" ")}
                    data-message-id={item.messageId}
                  >
                    <div className="message-content">
                      {shouldShowSenderHeader && (
                        <button
                          className="message-profile-trigger"
                          type="button"
                          onClick={() => item.senderId !== null && handleOpenMemberProfile(
                            item.senderId,
                            item.senderNickname ?? "알 수 없는 사용자",
                          )}
                          disabled={item.senderId === null}
                          aria-label={`${item.senderNickname ?? "알 수 없는 사용자"} 프로필 열기`}
                        >
                          <ChatAvatar
                            name={item.senderNickname ?? "알 수 없는 사용자"}
                            imageUrl={item.senderId === null
                              ? null
                              : memberApi.getProfileImageUrl(item.senderId)}
                            className={`message-author-avatar ${getMessageAvatarColorClass(item.senderId)}`}
                          />
                        </button>
                      )}
                      {shouldShowSenderHeader && (
                        <div className="terminal-prompt">
                          <button
                            className="message-author-name"
                            type="button"
                            onClick={() => item.senderId !== null && handleOpenMemberProfile(
                              item.senderId,
                              item.senderNickname ?? "알 수 없는 사용자",
                            )}
                            disabled={item.senderId === null}
                          >
                            @veritas:{getTerminalIdentity(item.senderId, item.senderNickname)}$
                          </button>
                        </div>
                      )}
                      {editingMessageId === item.messageId ? (
                        <form
                          className="message-edit-form"
                          onSubmit={(event) => void handleEditMessage(event, item)}
                        >
                          <input
                            value={editingMessageContent}
                            onChange={(event) => setEditingMessageContent(event.target.value)}
                            maxLength={1000}
                            autoFocus
                            aria-label="메시지 수정 내용"
                          />
                          <div>
                            <button
                              type="button"
                              onClick={handleCancelMessageEdit}
                              disabled={isSavingMessageEdit}
                            >
                              취소
                            </button>
                            <button
                              type="submit"
                              disabled={
                                isSavingMessageEdit
                                || !editingMessageContent.trim()
                                || editingMessageContent.trim() === item.content
                              }
                            >
                              {isSavingMessageEdit ? "저장 중..." : "저장"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="message-bubble-row">
                          <p className={item.deleted ? "deleted-message" : undefined}>
                            {item.deleted ? "삭제된 메시지입니다." : item.content}
                          </p>
                          <time dateTime={item.createdAt}>
                            {formatMessageTime(item.createdAt)}
                          </time>
                          {item.editedAt && !item.deleted && (
                            <span className="message-edited-label">수정됨</span>
                          )}
                          {item.senderId === memberId && !item.deleted && (
                            <span className="message-actions">
                              <button
                                className="message-edit-button"
                                type="button"
                                onClick={() => handleStartMessageEdit(item)}
                                disabled={editingMessageId !== null || deletingMessageId !== null}
                                aria-label="메시지 수정"
                                title="메시지 수정"
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path
                                    d="m4 16.5-.5 4 4-.5L19 8.5 15.5 5 4 16.5ZM13.5 7l3.5 3.5"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                              <button
                                className="message-delete-button"
                                type="button"
                                onClick={() => void handleDeleteMessage(item)}
                                disabled={editingMessageId !== null || deletingMessageId !== null}
                                aria-label="메시지 삭제"
                                title="메시지 삭제"
                              >
                                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                  <path
                                    d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                                    stroke="currentColor"
                                    strokeWidth="1.7"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              </button>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                ) : item.type === "SYSTEM" ? (
                  <p className="system-message">
                    <span /> {item.deleted ? "삭제된 메시지입니다." : item.content}
                  </p>
                ) : (
                  <article
                    className={[
                      item.senderId === memberId ? "message own" : "message",
                      `message-group-${messageGroupPosition}`,
                      getMessageGroupAccentClass(item.senderId),
                      isLatestMessage ? "is-latest-message" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <div className="message-content">
                      {shouldShowSenderHeader && (
                        <button
                          className="message-profile-trigger"
                          type="button"
                          onClick={() => item.senderId !== null && handleOpenMemberProfile(
                            item.senderId,
                            item.senderNickname ?? "알 수 없는 사용자",
                          )}
                          disabled={item.senderId === null}
                          aria-label={`${item.senderNickname ?? "알 수 없는 사용자"} 프로필 열기`}
                        >
                          <ChatAvatar
                            name={item.senderNickname ?? "알 수 없는 사용자"}
                            imageUrl={item.senderId === null
                              ? null
                              : memberApi.getProfileImageUrl(item.senderId)}
                            className={`message-author-avatar ${getMessageAvatarColorClass(item.senderId)}`}
                          />
                        </button>
                      )}
                      {shouldShowSenderHeader && (
                        <div className="terminal-prompt">
                          <button
                            className="message-author-name"
                            type="button"
                            onClick={() => item.senderId !== null && handleOpenMemberProfile(
                              item.senderId,
                              item.senderNickname ?? "알 수 없는 사용자",
                            )}
                            disabled={item.senderId === null}
                          >
                            @veritas:{getTerminalIdentity(item.senderId, item.senderNickname)}$
                          </button>
                        </div>
                      )}
                      <div className="message-bubble-row attachment-message-row">
                        <AttachmentMessageContent message={item} />
                        <time dateTime={item.createdAt}>
                          {formatMessageTime(item.createdAt)}
                        </time>
                        {item.senderId === memberId && !item.deleted && (
                          <span className="message-actions">
                            <button
                              className="message-delete-button"
                              type="button"
                              onClick={() => void handleDeleteMessage(item)}
                              disabled={editingMessageId !== null || deletingMessageId !== null}
                              aria-label="첨부파일 메시지 삭제"
                              title="첨부파일 메시지 삭제"
                            >
                              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path
                                  d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                )}
              </Fragment>
            );
          })}
            <div ref={messageEndRef} />
          </div>

          {isScrollToBottomVisible && (
            <button
              className="scroll-to-bottom-button"
              type="button"
              onClick={handleScrollToBottom}
              aria-label="마지막 메시지로 이동"
              title="마지막 메시지로 이동"
            >
              <span aria-hidden="true">↓</span> latest
            </button>
          )}
        </div>

        <MessageComposer
          key={`${activeRoomId ?? "none"}:${isActiveRoomDeleted}`}
          activeRoom={activeRoom}
          isConnected={isConnected}
          isActiveRoomDeleted={isActiveRoomDeleted}
          isUploadingAttachment={isUploadingAttachment}
          sendBlockedReason={activeRoomSendError}
          nickname={nickname}
          ownProfileImageUrl={ownProfileImageUrl}
          error={error}
          onSend={handleSend}
          onAttachmentSelection={handleAttachmentSelection}
        />
      </section>

      {openRoomIds.length > 0 && (
        <nav className="terminal-session-dock" aria-label="활성화된 채팅방">
          {openRoomIds.map((roomId) => {
            const room = rooms.find((item) => item.roomId === roomId);
            if (!room) return null;

            const roomName = room.name ?? "Direct";
            const isActive = roomId === activeRoomId && isChatOpen;

            return (
              <div
                className={isActive
                  ? "terminal-session-item active"
                  : "terminal-session-item"}
                key={roomId}
              >
                <button
                  className="terminal-session-open"
                  type="button"
                  onClick={() => handleOpenRoom(roomId)}
                  aria-label={`${roomName} 채팅방 열기`}
                  aria-current={isActive ? "true" : undefined}
                >
                  <ChatAvatar name={roomName} />
                  <span className="terminal-session-tooltip">{roomName}</span>
                  {room.unreadCount > 0 && (
                    <em
                      key={room.unreadCount}
                      aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}
                    >
                      {room.unreadCount > 9 ? "9+" : room.unreadCount}
                    </em>
                  )}
                </button>
                <button
                  className="terminal-session-close"
                  type="button"
                  onClick={() => {
                    if (isActive) {
                      handleCloseRoom();
                      return;
                    }
                    setOpenRoomIds((current) => current.filter((id) => id !== roomId));
                  }}
                  aria-label={`${roomName} 활성 목록에서 닫기`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </nav>
      )}

      {pendingAttachment && (
        <div
          className="attachment-preview-modal"
          role="presentation"
          onClick={handleCloseAttachmentConfirmation}
        >
          <section
            className="attachment-preview-dialog attachment-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="attachment-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <p className="eyebrow">$ attachment --send</p>
                <strong id="attachment-confirm-title">
                  {pendingAttachment.previewUrl
                    ? "이 이미지를 보내시겠습니까?"
                    : "이 파일을 보내시겠습니까?"}
                </strong>
              </div>
              <button
                type="button"
                onClick={handleCloseAttachmentConfirmation}
                disabled={isUploadingAttachment}
                aria-label="첨부파일 전송 취소"
              >
                ×
              </button>
            </header>

            {pendingAttachment.previewUrl ? (
              <div className="attachment-preview-image attachment-confirm-image">
                <img
                  src={pendingAttachment.previewUrl}
                  alt={pendingAttachment.file.name}
                />
              </div>
            ) : (
              <div className="attachment-confirm-file">
                <span className="attachment-file-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 3h7l4 4v14H7V3Zm7 0v5h5"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <strong title={pendingAttachment.file.name}>
                    {pendingAttachment.file.name}
                  </strong>
                  <small>{formatSelectedFileSize(pendingAttachment.file.size)}</small>
                </div>
              </div>
            )}

            {pendingAttachment.previewUrl && (
              <div className="attachment-confirm-info">
                <div className="attachment-confirm-name">
                  <span>IMAGE</span>
                  <strong title={pendingAttachment.file.name}>
                    {pendingAttachment.file.name}
                  </strong>
                </div>
                <span className="attachment-confirm-size">
                  {formatSelectedFileSize(pendingAttachment.file.size)}
                </span>
              </div>
            )}

            {error && (
              <p className="attachment-confirm-error" role="alert">{error}</p>
            )}

            <footer className="attachment-confirm-actions">
              <button
                className="attachment-confirm-cancel"
                type="button"
                onClick={handleCloseAttachmentConfirmation}
                disabled={isUploadingAttachment}
              >
                취소
              </button>
              <button
                className="attachment-confirm-send"
                type="button"
                onClick={() => void handleConfirmAttachment()}
                disabled={isUploadingAttachment}
              >
                <span>{isUploadingAttachment ? "보내는 중..." : "보내기"}</span>
                {!isUploadingAttachment && (
                  <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <path
                      d="m7.5 4.5 5.5 5.5-5.5 5.5M12.5 10H3.5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}

      {isCreateRoomModalOpen && (
        <div className="create-room-modal" role="presentation">
          <section
            className="create-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-room-title"
          >
            <header>
              <div>
                <p className="eyebrow">$ room --create</p>
                <h2 id="create-room-title">새 채팅방 만들기</h2>
              </div>
              <button
                className="close-create-room-button"
                type="button"
                onClick={handleCloseCreateRoomModal}
                disabled={isCreatingRoom}
                aria-label="채팅방 생성 닫기"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path
                    d="m5 5 10 10M15 5 5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <form className="room-create-form" onSubmit={(event) => void handleCreateRoom(event)}>
              <label htmlFor="room-name">채팅방 이름</label>
              <div>
                <input
                  id="room-name"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="1~30자로 입력해주세요"
                  maxLength={30}
                  autoFocus
                  disabled={isCreatingRoom}
                />
              </div>
              {roomCreationError && (
                <p className="room-create-error" role="alert">
                  {roomCreationError}
                </p>
              )}
              <footer>
                <button
                  className="cancel-create-room-button"
                  type="button"
                  onClick={handleCloseCreateRoomModal}
                  disabled={isCreatingRoom}
                >
                  취소
                </button>
                <button
                  className="submit-create-room-button"
                  type="submit"
                  disabled={isCreatingRoom || !roomName.trim()}
                >
                  {isCreatingRoom ? "생성 중..." : "채팅방 생성"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {renameTargetRoom && (
        <div className="create-room-modal" role="presentation">
          <section
            className="create-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-room-name-title"
          >
            <header>
              <div>
                <p className="eyebrow">$ room --rename</p>
                <h2 id="update-room-name-title">채팅방 이름 변경</h2>
              </div>
              <button
                className="close-create-room-button"
                type="button"
                onClick={handleCloseRoomNameUpdateModal}
                disabled={isUpdatingRoomName}
                aria-label="채팅방 이름 변경 닫기"
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none">
                  <path
                    d="m5 5 10 10M15 5 5 15"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </header>

            <form className="room-create-form" onSubmit={handleUpdateRoomName}>
              <label htmlFor="updated-room-name">채팅방 이름</label>
              <div>
                <input
                  id="updated-room-name"
                  value={updatedRoomName}
                  onChange={(event) => setUpdatedRoomName(event.target.value)}
                  placeholder="1~30자로 입력해주세요"
                  maxLength={30}
                  autoFocus
                  disabled={isUpdatingRoomName}
                />
              </div>
              {roomNameUpdateError && (
                <p className="room-create-error" role="alert">
                  {roomNameUpdateError}
                </p>
              )}
              <footer>
                <button
                  className="cancel-create-room-button"
                  type="button"
                  onClick={handleCloseRoomNameUpdateModal}
                  disabled={isUpdatingRoomName}
                >
                  취소
                </button>
                <button
                  className="submit-create-room-button"
                  type="submit"
                  disabled={isUpdatingRoomName || !updatedRoomName.trim()}
                >
                  {isUpdatingRoomName ? "변경 중..." : "이름 변경"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {deleteTargetRoom && (
        <div className="leave-room-modal" role="presentation">
          <section
            className="leave-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-room-dialog-title"
          >
            <span className="leave-room-symbol" aria-hidden="true">×</span>
            <p className="eyebrow">$ room --delete</p>
            <h2 id="delete-room-dialog-title">
              {deleteTargetRoom.name ?? "채팅방"}을 삭제하시겠습니까?
            </h2>
            <p className="leave-room-description">
              참여 중인 모든 멤버에게 채팅방이 삭제되며,<br />
              더 이상 메시지를 조회하거나 전송할 수 없습니다.
            </p>

            {deleteRoomError && (
              <p className="leave-room-error" role="alert">{deleteRoomError}</p>
            )}

            <footer>
              <button
                className="cancel-leave-room-button"
                type="button"
                onClick={handleCloseDeleteRoomModal}
                disabled={isDeletingRoom}
              >
                취소
              </button>
              <button
                className="confirm-leave-room-button"
                type="button"
                onClick={() => void handleDeleteRoom()}
                disabled={isDeletingRoom}
              >
                {isDeletingRoom ? "삭제 중..." : "채팅방 삭제"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {deletedRoomNotice && (
        <div className="leave-room-modal" role="presentation">
          <section
            className="leave-room-dialog deleted-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="deleted-room-dialog-title"
          >
            <span className="leave-room-symbol" aria-hidden="true">×</span>
            <p className="eyebrow">$ room --status</p>
            <h2 id="deleted-room-dialog-title">
              {deletedRoomNotice.roomName} 채팅방이 삭제되었습니다.
            </h2>
            <p className="leave-room-description">
              더 이상 이 채팅방에서 메시지를 보내거나 조회할 수 없습니다.
            </p>
            <footer>
              <button
                className="confirm-leave-room-button"
                type="button"
                onClick={handleConfirmDeletedRoom}
                autoFocus
              >
                확인
              </button>
            </footer>
          </section>
        </div>
      )}

      {roomEventToast && (
        <div className="room-event-toast" role="status">
          {roomEventToast}
        </div>
      )}

      {inviteTargetRoom && (
        <div className="invite-link-modal" role="presentation">
          <section
            className="invite-link-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-link-dialog-title"
          >
            <header>
              <div>
                <p className="eyebrow">$ room --invite-link</p>
                <h2 id="invite-link-dialog-title">{inviteTargetRoom.name}</h2>
              </div>
              <button
                className="close-invite-link-button"
                type="button"
                onClick={handleCloseInviteLinkModal}
                disabled={inviteOperation !== null}
                aria-label="초대 링크 닫기"
              >
                ×
              </button>
            </header>

            {inviteOperation === "loading" ? (
              <p className="invite-link-status">초대 링크를 조회하고 있습니다...</p>
            ) : (
              <>
                {inviteLink ? (
                  <div className="invite-link-result">
                    <label htmlFor="invite-link-value">INVITE_URL</label>
                    <div>
                      <input
                        id="invite-link-value"
                        type="text"
                        value={inviteUrl}
                        readOnly
                      />
                      <button
                        type="button"
                        onClick={() => void handleCopyInviteLink()}
                        disabled={inviteOperation !== null}
                      >
                        {inviteOperation === "copy" ? "복사 중" : "복사"}
                      </button>
                    </div>
                    <small>
                      EXPIRES_AT {formatInviteExpiration(inviteLink.expiresAt)}
                    </small>
                  </div>
                ) : (
                  <p className="invite-link-status">
                    현재 활성화된 초대 링크가 없습니다.
                  </p>
                )}

                {inviteTargetRoom.role === "OWNER" && (
                  <div className="invite-link-owner-controls">
                    <label htmlFor="invite-link-expiration">EXPIRES_IN</label>
                    <select
                      id="invite-link-expiration"
                      value={inviteExpiration}
                      onChange={(event) => setInviteExpiration(
                        event.target.value as InviteLinkExpiration,
                      )}
                      disabled={inviteOperation !== null}
                    >
                      <option value="ONE_DAY">1일</option>
                      <option value="THREE_DAYS">3일</option>
                      <option value="SEVEN_DAYS">7일</option>
                    </select>
                  </div>
                )}
              </>
            )}

            {inviteNotice && (
              <p className="invite-link-notice" role="status">{inviteNotice}</p>
            )}
            {inviteError && (
              <p className="invite-link-error" role="alert">{inviteError}</p>
            )}

            <footer className="invite-link-actions">
              <div>
                {inviteTargetRoom.role === "OWNER" && inviteLink && (
                  <button
                    className="invite-link-delete-button"
                    type="button"
                    onClick={() => void handleDeleteInviteLink()}
                    disabled={inviteOperation !== null}
                  >
                    {inviteOperation === "delete" ? "삭제 중..." : "링크 삭제"}
                  </button>
                )}
              </div>
              <div>
                <button
                  className="invite-link-cancel-button"
                  type="button"
                  onClick={handleCloseInviteLinkModal}
                  disabled={inviteOperation !== null}
                >
                  닫기
                </button>
                {inviteTargetRoom.role === "OWNER" && (
                  <button
                    className="invite-link-primary-button"
                    type="button"
                    onClick={() => void (inviteLink
                      ? handleReissueInviteLink()
                      : handleCreateInviteLink())}
                    disabled={inviteOperation !== null}
                  >
                    {inviteLink
                      ? (inviteOperation === "reissue" ? "재발급 중..." : "링크 재발급")
                      : (inviteOperation === "create" ? "생성 중..." : "링크 생성")}
                  </button>
                )}
              </div>
            </footer>
          </section>
        </div>
      )}

      {viewedMemberProfile && (
        <div className="profile-modal" role="presentation">
          <section
            className="profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="member-profile-dialog-title"
          >
            <header>
              <div>
                <p className="eyebrow">$ whois {viewedMemberProfile.displayName}</p>
                <h2 id="member-profile-dialog-title">사용자 프로필</h2>
              </div>
              <button
                className="close-profile-button"
                type="button"
                onClick={() => setViewedMemberProfile(null)}
                aria-label="사용자 프로필 닫기"
              >
                ×
              </button>
            </header>

            <div className="profile-identity profile-identity-public">
              <ChatAvatar
                name={viewedMemberProfile.displayName}
                imageUrl={memberApi.getProfileImageUrl(viewedMemberProfile.memberId)}
                className="profile-identity-avatar"
              />
              <div className="profile-identity-main">
                <div className="profile-identity-heading">
                  <strong>{viewedMemberProfile.displayName}</strong>
                  <span>
                    {viewedMemberProfile.publicProfile
                      ? getProfileRelationLabel(viewedMemberProfile.publicProfile.relationStatus)
                      : "LOOKUP"}
                  </span>
                </div>
                {viewedMemberProfile.isLoading && (
                  <p className="public-profile-status">프로필을 조회하는 중...</p>
                )}
                {viewedMemberProfile.error && (
                  <p className="public-profile-error" role="alert">
                    {viewedMemberProfile.error}
                  </p>
                )}
                {viewedMemberProfile.publicProfile?.statusMessage && (
                  <p className="public-profile-message">
                    {viewedMemberProfile.publicProfile.statusMessage}
                  </p>
                )}
                {(viewedMemberProfile.role || viewedMemberProfile.joinedAt) && (
                  <dl className="public-profile-details">
                    {viewedMemberProfile.role && (
                      <div>
                        <dt>ROLE</dt>
                        <dd>
                          {viewedMemberProfile.role === "OWNER" ? "방장" : "멤버"}
                        </dd>
                      </div>
                    )}
                    {viewedMemberProfile.joinedAt && (
                      <div>
                        <dt>JOINED_AT</dt>
                        <dd>{formatMemberJoinedAt(viewedMemberProfile.joinedAt)}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </div>

            {friendProfileActionError && (
              <p className="public-profile-error" role="alert">
                {friendProfileActionError}
              </p>
            )}
            {directChatError && !directChatTarget && (
              <p className="public-profile-error" role="alert">
                {directChatError}
              </p>
            )}

            <div className="public-profile-relation-panel">
              <div className="public-profile-relation-status">
                <span>RELATION</span>
                <strong>
                  {viewedMemberProfile.publicProfile
                    ? getProfileRelationLabel(viewedMemberProfile.publicProfile.relationStatus)
                    : "LOADING"}
                </strong>
              </div>
              <div className="public-profile-relation-actions">
                {viewedMemberProfile.publicProfile?.status === "ACTIVE"
                  && viewedMemberProfile.publicProfile.relationStatus === "NONE" && (
                    <button
                      className="profile-relation-button primary"
                      type="button"
                      onClick={() => void handleRequestFriend(viewedMemberProfile.memberId)}
                      disabled={friendOperationKeys.includes(
                        `request:${viewedMemberProfile.memberId}`,
                      )}
                    >
                      <span aria-hidden="true">+</span>
                      {friendOperationKeys.includes(`request:${viewedMemberProfile.memberId}`)
                        ? "요청 중..."
                        : "친구 요청"}
                    </button>
                  )}
                {viewedMemberProfile.publicProfile?.relationStatus === "PENDING_SENT" && (
                  <button
                    className="profile-relation-button neutral"
                    type="button"
                    onClick={() => handleOpenFriendRequests("sent")}
                  >
                    <span aria-hidden="true">→</span> 보낸 요청 확인
                  </button>
                )}
                {viewedMemberProfile.publicProfile?.relationStatus === "PENDING_RECEIVED" && (
                  <button
                    className="profile-relation-button primary"
                    type="button"
                    onClick={() => handleOpenFriendRequests("received")}
                  >
                    <span aria-hidden="true">←</span> 받은 요청 확인
                  </button>
                )}
                {viewedMemberProfile.publicProfile?.relationStatus === "ACCEPTED" && (
                  <>
                    <button
                      className="profile-relation-button primary"
                      type="button"
                      onClick={() => void handleRequestDirectChat({
                        memberId: viewedMemberProfile.memberId,
                        displayName: viewedMemberProfile.displayName,
                        status: viewedMemberProfile.publicProfile?.status ?? "ACTIVE",
                      })}
                      disabled={openingDirectMemberId !== null}
                    >
                      <span aria-hidden="true">&gt;</span>
                      {openingDirectMemberId === viewedMemberProfile.memberId
                        ? "연결 중..."
                        : "1:1 채팅"}
                    </button>
                    <button
                      className="profile-relation-button danger"
                      type="button"
                      onClick={() => handleRequestUnfollow({
                        memberId: viewedMemberProfile.memberId,
                        displayName: viewedMemberProfile.displayName,
                      })}
                      disabled={friendOperationKeys.includes(
                        `unfollow:${viewedMemberProfile.memberId}`,
                      )}
                    >
                      <span aria-hidden="true">×</span> 친구 끊기
                    </button>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {directChatTarget && (
        <div className="profile-image-confirm-modal" role="presentation">
          <section
            className="profile-image-confirm-dialog direct-chat-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="direct-chat-dialog-title"
          >
            <p className="eyebrow">$ direct --start</p>
            <div className="direct-chat-recipient">
              <ChatAvatar
                name={directChatTarget.displayName}
                imageUrl={memberApi.getProfileImageUrl(directChatTarget.memberId)}
                className="friend-list-avatar"
              />
              <div>
                <span>RECIPIENT</span>
                <strong id="direct-chat-dialog-title">
                  {directChatTarget.displayName}
                </strong>
              </div>
            </div>
            <form
              className="direct-chat-form"
              onSubmit={(event) => void handleSendFirstDirectMessage(event)}
            >
              <label htmlFor="direct-message">FIRST_MESSAGE</label>
              <div>
                <span aria-hidden="true">$</span>
                <input
                  id="direct-message"
                  type="text"
                  value={directMessageDraft}
                  maxLength={1000}
                  onChange={(event) => setDirectMessageDraft(event.target.value)}
                  placeholder="첫 메시지를 입력하세요"
                  disabled={isSendingDirectMessage}
                  autoFocus
                />
              </div>
              {directChatError && (
                <p className="profile-image-error" role="alert">
                  {directChatError}
                </p>
              )}
              <footer>
                <button
                  className="cancel-profile-image-button"
                  type="button"
                  onClick={handleCloseDirectChatModal}
                  disabled={isSendingDirectMessage}
                >
                  취소
                </button>
                <button
                  className="confirm-profile-image-button"
                  type="submit"
                  disabled={isSendingDirectMessage || !directMessageDraft.trim()}
                >
                  {isSendingDirectMessage ? "전송 중..." : "채팅 시작"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {friendRemovalTarget && (
        <div className="profile-image-confirm-modal" role="presentation">
          <section
            className="profile-image-confirm-dialog friend-removal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="friend-removal-title"
          >
            <p className="eyebrow">$ friends --disconnect</p>
            <h2 id="friend-removal-title">
              {friendRemovalTarget.displayName}님과 친구 관계를 해제하시겠습니까?
            </h2>
            <p className="profile-image-confirm-description">
              다시 연결하려면 새로운 친구 요청이 필요합니다.
            </p>
            {friendRemovalError && (
              <p className="profile-image-error" role="alert">{friendRemovalError}</p>
            )}
            <footer>
              <button
                className="cancel-profile-image-button"
                type="button"
                onClick={() => setFriendRemovalTarget(null)}
                disabled={friendOperationKeys.includes(
                  `unfollow:${friendRemovalTarget.memberId}`,
                )}
              >
                취소
              </button>
              <button
                className="confirm-profile-image-button is-delete"
                type="button"
                onClick={() => void handleConfirmUnfollow()}
                disabled={friendOperationKeys.includes(
                  `unfollow:${friendRemovalTarget.memberId}`,
                )}
              >
                {friendOperationKeys.includes(`unfollow:${friendRemovalTarget.memberId}`)
                  ? "처리 중..."
                  : "친구 끊기"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {isProfileModalOpen && (
        <div className="profile-modal" role="presentation">
          <section
            className="profile-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-dialog-title"
          >
            <header>
              <div>
                <p className="eyebrow">$ whoami</p>
                <h2 id="profile-dialog-title">프로필</h2>
              </div>
              <button
                className="close-profile-button"
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                disabled={isUpdatingProfileImage || isSavingNickname}
                aria-label="프로필 닫기"
              >
                ×
              </button>
            </header>

            <div className="profile-identity">
              <div className="profile-avatar-column">
                <ChatAvatar
                  name={nickname}
                  imageUrl={ownProfileImageUrl}
                  className="profile-identity-avatar"
                />
                <button
                  className="profile-image-manage-button"
                  type="button"
                  onClick={handleOpenProfileImageSource}
                  disabled={isUpdatingProfileImage}
                >
                  {isUpdatingProfileImage ? "처리 중..." : "사진 관리"}
                </button>
              </div>
              <div className="profile-identity-main">
                <div className="profile-nickname-row">
                  {isEditingNickname ? (
                    <div className="profile-nickname-form">
                      <input
                        type="text"
                        value={nicknameDraft}
                        minLength={2}
                        maxLength={30}
                        pattern="[a-zA-Z0-9가-힣]+"
                        onChange={(event) => setNicknameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleSaveNickname();
                          }
                          if (event.key === "Escape") {
                            handleCancelNicknameEdit();
                          }
                        }}
                        disabled={isSavingNickname}
                        placeholder="2~30자, 한글·영문·숫자"
                        aria-label="닉네임"
                        autoFocus
                      />
                      <div>
                        <span>{nicknameDraft.length}/30</span>
                        <button
                          type="button"
                          onClick={handleCancelNicknameEdit}
                          disabled={isSavingNickname}
                        >
                          취소
                        </button>
                        <button
                          className="save"
                          type="button"
                          onClick={() => void handleSaveNickname()}
                          disabled={isSavingNickname}
                        >
                          {isSavingNickname ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="profile-identity-heading">
                        <strong>{nickname}</strong>
                        <span className={isConnected ? "is-online" : "is-connecting"}>
                          {isConnected ? "온라인" : "연결 중"}
                        </span>
                      </div>
                      <button
                        className="profile-nickname-edit-button"
                        type="button"
                        onClick={handleStartNicknameEdit}
                        disabled={isSavingNickname || isSavingStatusMessage}
                      >
                        수정
                      </button>
                    </>
                  )}
                </div>
                {nicknameError && (
                  <p className="profile-nickname-error" role="alert">
                    {nicknameError}
                  </p>
                )}
                <div className="profile-email-row">
                  <p className="profile-identity-email">
                    {memberProfile?.email ?? "이메일 정보 없음"}
                  </p>
                  <span className={emailVerified ? "is-verified" : "is-unverified"}>
                    {emailVerified ? "인증됨" : "미인증"}
                  </span>
                </div>
                <div className="profile-status-message-editor">
                  <div className="profile-status-message-heading">
                    <span>상태 메시지</span>
                    {!isEditingStatusMessage && (
                    <button
                        type="button"
                        onClick={handleStartStatusMessageEdit}
                        disabled={isSavingStatusMessage || isSavingNickname}
                      >
                        수정
                      </button>
                    )}
                  </div>
                  {isEditingStatusMessage ? (
                    <div className="profile-status-message-form">
                      <input
                        type="text"
                        value={statusMessageDraft}
                        maxLength={50}
                        onChange={(event) => setStatusMessageDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleSaveStatusMessage();
                          }
                          if (event.key === "Escape") {
                            handleCancelStatusMessageEdit();
                          }
                        }}
                        disabled={isSavingStatusMessage}
                        placeholder="상태 메시지를 입력하세요"
                        aria-label="상태 메시지"
                        autoFocus
                      />
                      <div>
                        <span>{statusMessageDraft.length}/50</span>
                        <button
                          type="button"
                          onClick={handleCancelStatusMessageEdit}
                          disabled={isSavingStatusMessage}
                        >
                          취소
                        </button>
                        <button
                          className="save"
                          type="button"
                          onClick={() => void handleSaveStatusMessage()}
                          disabled={isSavingStatusMessage}
                        >
                          {isSavingStatusMessage ? "저장 중..." : "저장"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p>{memberProfile?.statusMessage?.trim() || "상태 메시지 없음"}</p>
                  )}
                  {statusMessageError && (
                    <p className="profile-status-message-error" role="alert">
                      {statusMessageError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <input
              ref={profileImageInputRef}
              className="profile-image-input"
              type="file"
              accept="image/jpeg,image/png"
              onChange={handleProfileImageChange}
            />

            {profileImageError && (
              <p className="profile-image-error" role="alert">
                {profileImageError}
              </p>
            )}

            <Link className="profile-privacy-link" to="/privacy">
              <span aria-hidden="true">[i]</span>
              개인정보 안내
              <span aria-hidden="true">→</span>
            </Link>

            <footer className="profile-dialog-footer">
              <button
                className="profile-logout-all-button"
                type="button"
                onClick={() => void handleOpenLogoutAll()}
              >
                모든 기기 로그아웃
              </button>
              <button
                className="profile-logout-button"
                type="button"
                onClick={() => void handleProfileLogout()}
              >
                <span aria-hidden="true">$</span> 로그아웃
              </button>
            </footer>
          </section>
        </div>
      )}

      {isLogoutAllModalOpen && (
        <div className="profile-image-confirm-modal" role="presentation">
          <section
            className="profile-image-confirm-dialog logout-all-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-all-title"
          >
            <p className="eyebrow">$ session --logout-all</p>
            <h2 id="logout-all-title">모든 기기에서 로그아웃</h2>
            <p className="profile-image-confirm-description">
              현재 기기를 포함한 모든 로그인 Session이 종료됩니다.
            </p>

            {isPreparingLogoutAll && !reauthenticationMethod ? (
              <p className="logout-all-status">재인증 방법을 확인하고 있습니다.</p>
            ) : reauthenticationMethod?.type === "PASSWORD" ? (
              <label className="logout-all-password-field">
                <span>현재 비밀번호</span>
                <input
                  type="password"
                  value={logoutAllPassword}
                  minLength={8}
                  maxLength={30}
                  autoComplete="current-password"
                  onChange={(event) => setLogoutAllPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handlePasswordLogoutAll();
                    }
                  }}
                  disabled={isPreparingLogoutAll}
                  autoFocus
                />
              </label>
            ) : reauthenticationMethod?.type === "SOCIAL" ? (
              <p className="logout-all-status">
                연결된 Google 계정으로 본인 확인 후 로그아웃합니다.
              </p>
            ) : null}

            {logoutAllError && (
              <p className="profile-image-error" role="alert">
                {logoutAllError}
              </p>
            )}

            <footer>
              <button
                type="button"
                onClick={handleCloseLogoutAll}
                disabled={isPreparingLogoutAll}
              >
                취소
              </button>
              {reauthenticationMethod?.type === "PASSWORD" && (
                <button
                  className="confirm-logout-all-button"
                  type="button"
                  onClick={() => void handlePasswordLogoutAll()}
                  disabled={isPreparingLogoutAll || !logoutAllPassword}
                >
                  {isPreparingLogoutAll ? "처리 중..." : "모든 기기 로그아웃"}
                </button>
              )}
              {reauthenticationMethod?.type === "SOCIAL" && (
                <button
                  className="confirm-logout-all-button"
                  type="button"
                  onClick={() => void handleSocialLogoutAll()}
                  disabled={isPreparingLogoutAll}
                >
                  {isPreparingLogoutAll ? "이동 중..." : "Google로 본인 확인"}
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {isProfileImageSourceOpen && (
        <div className="profile-image-confirm-modal" role="presentation">
          <section
            className="profile-image-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-image-source-title"
          >
            <p className="eyebrow">$ profile --image --source</p>
            <h2 id="profile-image-source-title">프로필 사진 관리</h2>
            <p className="profile-image-confirm-description">
              사진을 업로드하거나 Google 프로필을 적용하고, 현재 사진을 삭제할 수 있습니다.
            </p>

            <div className="profile-image-source-options">
              <button type="button" onClick={handleSelectProfileImageUpload}>
                <span aria-hidden="true">↑</span>
                <strong>직접 업로드</strong>
                <small>JPEG 또는 PNG · 최대 5MB</small>
              </button>
              <button type="button" onClick={handleRequestSocialProfileImage}>
                <span aria-hidden="true">G</span>
                <strong>Google 프로필</strong>
                <small>연결된 계정의 사진 사용</small>
              </button>
              <button
                className="is-delete"
                type="button"
                onClick={handleRequestDeleteProfileImage}
              >
                <span aria-hidden="true">×</span>
                <strong>현재 사진 삭제</strong>
                <small>기본 프로필 이미지로 변경</small>
              </button>
            </div>

            <footer>
              <button
                className="cancel-profile-image-button"
                type="button"
                onClick={() => setIsProfileImageSourceOpen(false)}
              >
                취소
              </button>
            </footer>
          </section>
        </div>
      )}

      {profileImageAction && (
        <div className="profile-image-confirm-modal" role="presentation">
          <section
            className="profile-image-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-image-confirm-title"
          >
            <p className="eyebrow">
              {profileImageAction === "upload"
                ? "$ profile --image --replace"
                : profileImageAction === "social"
                  ? "$ profile --image --google"
                  : "$ profile --image --delete"}
            </p>
            <h2 id="profile-image-confirm-title">
              {profileImageAction === "upload"
                ? "이 사진으로 변경하시겠습니까?"
                : profileImageAction === "social"
                  ? "Google 프로필 사진을 사용하시겠습니까?"
                  : "현재 프로필 사진을 삭제하시겠습니까?"}
            </h2>

            {profileImageAction === "upload" && pendingProfileImage && (
              <div className="profile-image-preview">
                <img src={pendingProfileImage.previewUrl} alt="선택한 프로필 사진 미리보기" />
                <div>
                  <strong>{pendingProfileImage.file.name}</strong>
                  <small>{formatSelectedFileSize(pendingProfileImage.file.size)}</small>
                </div>
              </div>
            )}

            {profileImageAction === "delete" && (
              <p className="profile-image-confirm-description">
                삭제한 사진은 자동으로 복구되지 않습니다.
              </p>
            )}

            {profileImageAction === "social" && (
              <p className="profile-image-confirm-description">
                현재 사진은 연결된 Google 계정에 저장된 프로필 사진으로 교체됩니다.
              </p>
            )}

            {profileImageError && (
              <p className="profile-image-error" role="alert">
                {profileImageError}
              </p>
            )}

            <footer>
              <button
                className="cancel-profile-image-button"
                type="button"
                onClick={handleCloseProfileImageConfirmation}
                disabled={isUpdatingProfileImage}
              >
                취소
              </button>
              <button
                className={profileImageAction === "delete"
                  ? "confirm-profile-image-button is-delete"
                  : "confirm-profile-image-button"}
                type="button"
                onClick={() => void handleConfirmProfileImageAction()}
                disabled={isUpdatingProfileImage}
              >
                {isUpdatingProfileImage
                  ? "처리 중..."
                  : profileImageAction === "upload"
                    ? "변경"
                    : profileImageAction === "social"
                      ? "Google 사진 적용"
                      : "삭제"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {joinTargetRoom && (
        <div className="join-room-modal" role="presentation">
          <section
            className="join-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="join-room-dialog-title"
          >
            <span className="join-room-symbol" aria-hidden="true">+</span>
            <p className="eyebrow">$ room --join</p>
            <h2 id="join-room-dialog-title">{joinTargetRoom.name}</h2>
            <p className="join-room-description">
              이 채팅방에 참여하시겠습니까?
            </p>

            {joinRoomError && (
              <p className="join-room-error" role="alert">
                {joinRoomError}
              </p>
            )}

            <footer>
              <button
                className="cancel-join-room-button"
                type="button"
                onClick={handleCloseJoinRoomModal}
                disabled={joiningRoomId !== null}
              >
                취소
              </button>
              <button
                className="confirm-join-room-button"
                type="button"
                onClick={() => void handleJoinRoom(joinTargetRoom.roomId)}
                disabled={joiningRoomId !== null}
              >
                {joiningRoomId !== null ? "참여 중..." : "참여하기"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {leaveTargetRoom && (
        <div className="leave-room-modal" role="presentation">
          <section
            className="leave-room-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-room-dialog-title"
          >
            <span className="leave-room-symbol" aria-hidden="true">−</span>
            <p className="eyebrow">$ room --leave</p>
            <h2 id="leave-room-dialog-title">{leaveTargetRoom.name ?? "Direct"}</h2>
            <p className="leave-room-description">
              이 채팅방에서 나가시겠습니까?<br />
              {leaveTargetRoom.type === "DIRECT"
                ? "친구가 새 메시지를 보내면 대화 목록에 다시 표시됩니다."
                : "재참여하기 전까지 새로운 메시지를 받을 수 없습니다."}
            </p>

            {leaveRoomError && (
              <p className="leave-room-error" role="alert">
                {leaveRoomError}
              </p>
            )}

            <footer>
              <button
                className="cancel-leave-room-button"
                type="button"
                onClick={handleCloseLeaveRoomModal}
                disabled={isLeavingRoom}
              >
                취소
              </button>
              <button
                className="confirm-leave-room-button"
                type="button"
                onClick={() => void handleLeaveRoom()}
                disabled={isLeavingRoom}
              >
                {isLeavingRoom ? "나가는 중..." : "채팅방 나가기"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {ownerTransferTarget && activeRoom && (
        <div className="owner-transfer-modal" role="presentation">
          <section
            className="owner-transfer-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="owner-transfer-dialog-title"
          >
            <span className="owner-transfer-symbol" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M12 3 15 8.5l6 .9-4.3 4.3 1 6.1L12 17l-5.7 2.8 1-6.1L3 9.4l6-.9L12 3Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <p className="eyebrow">$ owner --transfer</p>
            <h2 id="owner-transfer-dialog-title">방장을 위임하시겠습니까?</h2>
            <p className="owner-transfer-description">
              <strong>{ownerTransferTarget.displayName}</strong>님이 새로운 방장이 됩니다.<br />
              위임 후에는 일반 멤버로 변경됩니다.
            </p>

            {ownerTransferError && (
              <p className="owner-transfer-error" role="alert">
                {ownerTransferError}
              </p>
            )}

            <footer>
              <button
                className="cancel-owner-transfer-button"
                type="button"
                onClick={handleCloseOwnerTransferModal}
                disabled={isTransferringOwnership}
              >
                취소
              </button>
              <button
                className="confirm-owner-transfer-button"
                type="button"
                onClick={() => void handleTransferOwnership()}
                disabled={isTransferringOwnership}
              >
                {isTransferringOwnership ? "위임 중..." : "방장 위임"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}

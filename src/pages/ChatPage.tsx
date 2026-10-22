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
import "../styles/chat.css";
import { useAuth } from "../app/AuthProvider";
import { EmailVerificationPanel } from "../features/auth/EmailVerificationPanel";
import { AttachmentMessageContent } from "../features/chat/AttachmentMessageContent";
import { ChatAvatar } from "../features/chat/ChatAvatar";
import {
  chatRoomApi,
  type ChatMessage,
  type ChatMessageEvent,
  type ChatRoomEvent,
  type ChatRoomMemberResponse,
  type ChatRoomResponse,
  type GroupChatRoomResponse,
} from "../features/chat/api";
import { connectChat } from "../features/chat/stompClient";
import {
  memberApi,
  type MemberProfileResponse,
} from "../features/member/api";
import { readAccessToken } from "../shared/auth/token";

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

interface DeletedRoomNotice {
  roomId: number;
  roomName: string;
}

interface PendingAttachment {
  roomId: number;
  file: File;
  previewUrl: string | null;
}

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

function getTerminalIdentity(
  senderId: number | null,
  senderNickname: string | null,
) {
  const nickname = senderNickname?.trim() || "unknown";
  const shortId = senderId === null ? "system" : senderId.toString(36);

  return `${nickname}-${shortId}`;
}

function ProfileIcon() {
  return (
    <svg
      className="profile-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path d="M4.75 20a7.25 7.25 0 0 1 14.5 0" />
    </svg>
  );
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

function formatSelectedFileSize(sizeBytes: number) {
  if (sizeBytes < 1_024) return `${sizeBytes} B`;
  if (sizeBytes < 1_048_576) return `${(sizeBytes / 1_024).toFixed(1)} KB`;
  return `${(sizeBytes / 1_048_576).toFixed(1)} MB`;
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
  const { accessToken, logout } = useAuth();
  const prefersReducedMotion = useReducedMotion();
  const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [openRoomIds, setOpenRoomIds] = useState<number[]>([]);
  const [activeGalleryTab, setActiveGalleryTab] = useState<ChatGalleryTab>("joined");
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
  const [message, setMessage] = useState("");
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
  const [memberProfile, setMemberProfile] =
    useState<MemberProfileResponse | null>(null);
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
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const loadingMessageRoomIdsRef = useRef(new Set<number>());
  const pendingHistoryScrollRef = useRef<PendingHistoryScroll | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const memberRequestIdRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const chatWorkspaceRef = useRef<HTMLElement>(null);
  const lastRoomAvatarWheelAtRef = useRef(0);
  const activeRoomIdRef = useRef<number | null>(null);
  const isChatOpenRef = useRef(false);
  const lastReadRequestByRoomRef = useRef(new Map<number, number>());
  const latestMessageIdByRoomRef = useRef(new Map<number, number>());
  const isRecoveringConnectionRef = useRef(false);
  const messageSearchRequestIdRef = useRef(0);
  const pendingSearchScrollMessageIdRef = useRef<number | null>(null);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = memberProfile?.nickname ?? "사용자";
  const emailVerified = claims?.email_verified === true;
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? null;
  const isActiveRoomDeleted = deletedRoomNotice?.roomId === activeRoomId;
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

  useLayoutEffect(() => {
    if (!isChatOpen || activeRoomId === null) return;

    const animationFrameId = window.requestAnimationFrame(() => {
      chatWorkspaceRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [activeRoomId, isChatOpen, prefersReducedMotion]);

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
    latestMessageIdByRoomRef.current.delete(roomId);
    lastReadRequestByRoomRef.current.delete(roomId);
  }, []);

  const loadRooms = useCallback(async (preferredRoomId?: number) => {
    setIsLoadingRooms(true);
    setRoomListError("");

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
      setRoomListError(
        loadError instanceof Error
          ? loadError.message
          : "채팅방 목록을 불러오지 못했습니다.",
      );
      return null;
    } finally {
      setIsLoadingRooms(false);
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

  useEffect(() => {
    if (!accessToken) {
      setMemberProfile(null);
      setRooms([]);
      setActiveRoomId(null);
      setOpenRoomIds([]);
      setIsChatOpen(false);
      setIsLoadingRooms(false);
      setAvailableRooms([]);
      setIsLoadingAvailableRooms(false);
      setMessagesByRoom({});
      setMessagePagesByRoom({});
      loadingMessageRoomIdsRef.current.clear();
      return;
    }

    void memberApi.getProfile().then(setMemberProfile).catch(() => {
      setMemberProfile(null);
    });
    void loadRooms();
    void loadAvailableRooms();
  }, [accessToken, loadAvailableRooms, loadRooms]);

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
          setMessage("");
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
      onError: setError,
    });
    chatRef.current = connection;

    return () => {
      connection.disconnect();
      chatRef.current = null;
    };
  }, [
    accessToken,
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
    chatRef.current?.syncSubscriptions(
      rooms.map((room) => room.roomId),
    );
  }, [rooms]);

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
    if (activeRoomId === null || messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    if (isViewingRoomAtBottom(activeRoomId)) {
      void markRoomAsRead(activeRoomId, latestMessage.messageId);
    }
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

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = message.trim();
    if (!content) return;

    try {
      if (activeRoomId === null) return;

      chatRef.current?.send(activeRoomId, content);
      setMessage("");
      setError("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "메시지 전송에 실패했습니다.");
    }
  };

  const handleAttachmentSelection = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    const roomId = activeRoomId;
    input.value = "";
    if (!file || roomId === null || isUploadingAttachment) return;

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
      || targetMessage.type !== "TEXT"
      || targetMessage.deleted
      || deletingMessageId !== null
    ) {
      return;
    }

    if (!window.confirm("이 메시지를 삭제하시겠습니까?")) return;

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
            ? { ...item, content: null, deleted: true }
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
    if (!activeRoom || activeRoom.role === "OWNER") return;

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
      setMessage("");
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
      setMessage("");
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

      const remainingRooms = rooms.filter((room) => room.roomId !== roomId);
      setRooms(remainingRooms);
      setActiveRoomId(remainingRooms[0]?.roomId ?? null);
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
      setMessage("");
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
    if (activeRoomId === null) {
      memberRequestIdRef.current += 1;
      setRoomMembers([]);
      setIsLoadingMembers(false);
      setMemberListError("");
      return;
    }

    void loadRoomMembers(activeRoomId);
  }, [activeRoomId, loadRoomMembers]);

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

  const handleOpenRoom = (roomId: number) => {
    if (activeRoomIdRef.current === roomId && isChatOpenRef.current) {
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
    setMessage("");
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
        isChatOpen ? "" : "room-browser",
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
              onClick={() => setIsProfileModalOpen(true)}
              aria-haspopup="dialog"
              aria-label="내 프로필 열기"
            >
              <ProfileIcon />
              <span className="dashboard-action-label">whoami</span>
            </button>
          </div>
        </div>

        <nav className="chat-gallery-tabs" aria-label="채팅 메뉴">
          <button
            className={activeGalleryTab === "joined" ? "active" : ""}
            type="button"
            onClick={() => setActiveGalleryTab("joined")}
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
            onClick={() => setActiveGalleryTab("available")}
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
            onClick={() => setActiveGalleryTab("friends")}
            aria-label="친구"
            aria-current={activeGalleryTab === "friends" ? "page" : undefined}
          >
            {activeGalleryTab === "friends" && <motion.span className="chat-tab-indicator" layoutId="chat-gallery-tab" />}
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M14 19v-1.2c0-2.1-1.7-3.8-3.8-3.8H6.8A3.8 3.8 0 0 0 3 17.8V19M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 1 0 0-6M17 14c2.3 0 4 1.7 4 4v1" />
            </svg>
            <span className="chat-tab-command">friends --list</span>
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
                  <span className="terminal-session-state">STATE</span>
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
                        aria-label={`${roomName} 채팅방 열기`}
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
                        <span className="terminal-session-state">
                          {isActive ? "active" : "idle"}
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
          <section className="friends-empty-state">
            <TerminalTypedCommand command="friends --list" />
            <motion.div
              className="terminal-tab-output"
              initial={prefersReducedMotion ? false : { opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, delay: prefersReducedMotion ? 0 : 0.2 }}
            >
              <span aria-hidden="true">•••</span>
              <h2>친구 기능 준비 중</h2>
              <p>친구 API가 연결되면 이 탭에서 친구 목록과 Direct Message를 제공할 예정입니다.</p>
            </motion.div>
          </section>
        )}

      </aside>

      <section
        ref={chatWorkspaceRef}
        className="chat-workspace"
        aria-hidden={!isChatOpen}
        inert={!isChatOpen}
      >
        <header className="chat-header">
          <div className="chat-room-heading">
            <span className="terminal-chat-command" aria-hidden="true">
              <strong>$</strong>
              <span>attach</span>
              <span className="terminal-chat-command-option">--room</span>
            </span>
            <h1>"{activeRoom?.name ?? "채팅방 없음"}"</h1>
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
                            <span className="member-list-avatar" aria-hidden="true">
                              {roomMember.displayName.slice(-2).toUpperCase()}
                            </span>
                            <span className="member-list-identity">
                              <strong>{roomMember.displayName}</strong>
                              <small>
                                {roomMember.role === "OWNER" ? "방장" : "멤버"}
                                {roomMember.memberId === memberId ? " · 나" : ""}
                              </small>
                            </span>
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
                  <button
                    className="leave-chat-button"
                    type="button"
                    onClick={handleOpenLeaveRoomModal}
                    disabled={activeRoom.role === "OWNER"}
                    title={activeRoom.role === "OWNER"
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
            const shouldShowDate = !previousMessage
              || !isSameMessageDate(previousMessage.createdAt, item.createdAt);
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
                      isLatestMessage ? "is-latest-message" : "",
                    ].filter(Boolean).join(" ")}
                    data-message-id={item.messageId}
                  >
                    <div className="message-content">
                      <ChatAvatar
                        name={item.senderNickname ?? "알 수 없는 사용자"}
                        className={`message-author-avatar ${getMessageAvatarColorClass(item.senderId)}`}
                      />
                      <div className="terminal-prompt">
                        <strong>
                          @veritas:{getTerminalIdentity(item.senderId, item.senderNickname)}$
                        </strong>
                      </div>
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
                      isLatestMessage ? "is-latest-message" : "",
                    ].filter(Boolean).join(" ")}
                  >
                    <div className="message-content">
                      <ChatAvatar
                        name={item.senderNickname ?? "알 수 없는 사용자"}
                        className={`message-author-avatar ${getMessageAvatarColorClass(item.senderId)}`}
                      />
                      <div className="terminal-prompt">
                        <strong>
                          @veritas:{getTerminalIdentity(item.senderId, item.senderNickname)}$
                        </strong>
                      </div>
                      <div className="message-bubble-row attachment-message-row">
                        <AttachmentMessageContent message={item} />
                        <time dateTime={item.createdAt}>
                          {formatMessageTime(item.createdAt)}
                        </time>
                      </div>
                    </div>
                  </article>
                )}
              </Fragment>
            );
          })}
          <div ref={messageEndRef} />
        </div>

        <footer className="composer-area">
          {error && <p className="chat-error" role="alert">{error}</p>}
          <form className="message-composer" onSubmit={handleSend}>
            <input
              ref={attachmentInputRef}
              className="attachment-file-input"
              type="file"
              accept=".jpg,.jpeg,.png,.gif,.pdf,.txt,.zip,.docx,.xlsx,.pptx"
              onChange={(event) => void handleAttachmentSelection(event)}
              disabled={
                !activeRoom
                || !isConnected
                || isActiveRoomDeleted
                || isUploadingAttachment
              }
            />
            <ChatAvatar
              name={nickname}
              className="terminal-composer-avatar"
            />
            <span className="terminal-composer-prompt" aria-hidden="true">$</span>
            <label className="sr-only" htmlFor="message">메시지</label>
            <input
              className="terminal-message-input"
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                activeRoom
                  ? `${activeRoom.name ?? "Direct"}에 메시지 보내기`
                  : "채팅방을 선택해주세요"
              }
              disabled={!activeRoom || !isConnected || isActiveRoomDeleted}
            />
            <button
              className="attachment-upload-button"
              type="button"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={
                !activeRoom
                || !isConnected
                || isActiveRoomDeleted
                || isUploadingAttachment
              }
              aria-label="첨부파일 보내기"
              title={isUploadingAttachment ? "업로드 중..." : "첨부파일 보내기"}
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m8.5 12.5 6.9-6.9a3.2 3.2 0 0 1 4.5 4.5l-9.4 9.4a5 5 0 0 1-7.1-7.1l9-9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              className="send-message-button"
              type="submit"
              disabled={
                !activeRoom
                || !isConnected
                || isActiveRoomDeleted
                || !message.trim()
              }
              aria-label="메시지 보내기"
            >
              <span aria-hidden="true">↵</span>
            </button>
          </form>
        </footer>
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
                  이 파일을 보내시겠습니까?
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
                  <strong>{pendingAttachment.file.name}</strong>
                  <small>{formatSelectedFileSize(pendingAttachment.file.size)}</small>
                </div>
              </div>
            )}

            {pendingAttachment.previewUrl && (
              <div className="attachment-confirm-info">
                <strong>{pendingAttachment.file.name}</strong>
                <span>{formatSelectedFileSize(pendingAttachment.file.size)}</span>
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
                {isUploadingAttachment ? "보내는 중..." : "보내기"}
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
                aria-label="프로필 닫기"
              >
                ×
              </button>
            </header>

            <div className="profile-summary">
              <span className="profile-summary-icon" aria-hidden="true">
                <ProfileIcon />
              </span>
              <strong>{nickname}</strong>
              <small>{isConnected ? "온라인" : "연결 중"}</small>
            </div>

            <dl className="profile-details">
              <div>
                <dt>EMAIL</dt>
                <dd>{memberProfile?.email ?? "-"}</dd>
              </div>
              <div>
                <dt>EMAIL_VERIFIED</dt>
                <dd>{emailVerified ? "인증 완료" : "인증 필요"}</dd>
              </div>
            </dl>

            <button
              className="profile-logout-button"
              type="button"
              onClick={() => void handleProfileLogout()}
            >
              로그아웃
            </button>
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
              재참여하기 전까지 새로운 메시지를 받을 수 없습니다.
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

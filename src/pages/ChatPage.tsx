import {
  Fragment,
  type ChangeEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import "../styles/chat.css";
import { useAuth } from "../app/AuthProvider";
import { EmailVerificationPanel } from "../features/auth/EmailVerificationPanel";
import { AttachmentMessageContent } from "../features/chat/AttachmentMessageContent";
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
  const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
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
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const loadingMessageRoomIdsRef = useRef(new Set<number>());
  const pendingHistoryScrollRef = useRef<PendingHistoryScroll | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const memberRequestIdRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const activeRoomIdRef = useRef<number | null>(null);
  const isChatOpenRef = useRef(true);
  const lastReadRequestByRoomRef = useRef(new Map<number, number>());
  const latestMessageIdByRoomRef = useRef(new Map<number, number>());
  const isRecoveringConnectionRef = useRef(false);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = claims?.sub ? `member-${claims.sub}` : "member";
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
  const filteredRooms = useMemo(() => {
    const query = roomSearchQuery.trim().toLocaleLowerCase();
    if (!query) return rooms;

    return rooms.filter((room) =>
      (room.name ?? "Direct").toLocaleLowerCase().includes(query),
    );
  }, [roomSearchQuery, rooms]);
  const filteredAvailableRooms = useMemo(() => {
    const query = roomSearchQuery.trim().toLocaleLowerCase();
    if (!query) return availableRooms;

    return availableRooms.filter((room) =>
      room.name.toLocaleLowerCase().includes(query),
    );
  }, [availableRooms, roomSearchQuery]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

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
      setActiveRoomId((currentRoomId) => {
        const nextRoomId = preferredRoomId ?? currentRoomId;
        const roomExists = response.some((room) => room.roomId === nextRoomId);

        return roomExists ? nextRoomId : response[0]?.roomId ?? null;
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
      setRooms([]);
      setActiveRoomId(null);
      setIsLoadingRooms(false);
      setAvailableRooms([]);
      setIsLoadingAvailableRooms(false);
      setMessagesByRoom({});
      setMessagePagesByRoom({});
      loadingMessageRoomIdsRef.current.clear();
      return;
    }

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
      setActiveRoomId(null);
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

  const handleOpenRoom = (roomId: number) => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setOwnerTransferTarget(null);
    setOwnerTransferError("");
    activeRoomIdRef.current = roomId;
    isChatOpenRef.current = true;
    setActiveRoomId(roomId);
    setIsChatOpen(true);
  };

  const handleOpenEmptyChat = () => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setOwnerTransferTarget(null);
    setOwnerTransferError("");
    activeRoomIdRef.current = null;
    isChatOpenRef.current = true;
    setActiveRoomId(null);
    setIsChatOpen(true);
  };

  const handleCloseRoom = () => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    activeRoomIdRef.current = null;
    isChatOpenRef.current = false;
    setActiveRoomId(null);
    setIsChatOpen(false);
    setMessage("");
    setError("");
  };

  return (
    <main
      className={[
        "chat-shell",
        isChatOpen ? "" : "room-browser",
      ].filter(Boolean).join(" ")}
    >
      <aside className="navigation-rail">
        <div className="brand-lockup navigation-brand">
          <img className="brand-logo" src="/veritas-logo.png" alt="Veritas" />
        </div>

        <nav className="navigation-menu" aria-label="메인 메뉴">
          <div className="navigation-item active">
            <span className="navigation-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M5.5 5.5h13A2.5 2.5 0 0 1 21 8v7a2.5 2.5 0 0 1-2.5 2.5H11L6 21v-3.5h-.5A2.5 2.5 0 0 1 3 15V8a2.5 2.5 0 0 1 2.5-2.5Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8 10h8M8 13.5h5"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <strong>채팅방</strong>
            <em>{rooms.length}</em>
          </div>
          <div className="navigation-item muted">
            <span className="navigation-glyph" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="M14 19v-1.2c0-2.1-1.7-3.8-3.8-3.8H6.8A3.8 3.8 0 0 0 3 17.8V19M8.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 8v6M15 11h6"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <strong>친구</strong>
          </div>
        </nav>

        <div className="account-card navigation-account">
          <button
            className="profile-trigger"
            type="button"
            onClick={() => setIsProfileModalOpen(true)}
            aria-haspopup="dialog"
            aria-label="내 프로필 열기"
          >
            <span className="avatar">{nickname.slice(-2).toUpperCase()}</span>
          </button>
        </div>
      </aside>

      <aside className="chat-sidebar">
        {!isChatOpen && (
          <button
            className="open-empty-chat-button"
            type="button"
            onClick={handleOpenEmptyChat}
            aria-label="빈 채팅 화면 열기"
          >
            ›
          </button>
        )}

        <div className="room-sidebar-header">
          <div>
            <p className="eyebrow">MESSENGER</p>
            <h1>채팅</h1>
          </div>
          <button
            className="open-create-room-button"
            type="button"
            onClick={handleOpenCreateRoomModal}
            aria-label="채팅방 생성 열기"
          >
            <span className="plus-icon" aria-hidden="true" />
          </button>
        </div>

        <div className="room-search">
          <label htmlFor="room-search">채팅방 검색</label>
          <div>
            <span aria-hidden="true">⌕</span>
            <input
              id="room-search"
              type="search"
              value={roomSearchQuery}
              onChange={(event) => setRoomSearchQuery(event.target.value)}
              placeholder="채팅방 이름 검색"
            />
          </div>
        </div>

        <nav className="room-list" aria-label="채팅방 목록">
          <p className="sidebar-label">참여 중인 채팅방</p>
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
          {!isLoadingRooms
            && !roomListError
            && rooms.length > 0
            && filteredRooms.length === 0 && (
              <p className="room-list-status">검색 결과가 없습니다.</p>
          )}
          {filteredRooms.map((room) => (
            <button
              key={room.roomId}
              className={room.roomId === activeRoomId ? "room-button active" : "room-button"}
              type="button"
              onClick={() => handleOpenRoom(room.roomId)}
              aria-label={`${room.name ?? "Direct"} 채팅방`}
            >
              <span className="room-hash">#</span>
              <span className="room-details">
                <strong>{room.name ?? "Direct"}</strong>
                <small>{room.role}</small>
                {room.unreadCount > 0 && (
                  <em className="room-unread-count" aria-label={`읽지 않은 메시지 ${room.unreadCount}개`}>
                    {room.unreadCount > 99 ? "99+" : room.unreadCount}
                  </em>
                )}
              </span>
            </button>
          ))}

          <p className="sidebar-label available-room-label">참여 가능한 채팅방</p>
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
          {filteredAvailableRooms.map((room) => (
            <button
              className="room-button available-room"
              key={room.roomId}
              type="button"
              onClick={() => handleOpenJoinRoomModal(room)}
              disabled={joiningRoomId !== null}
              aria-haspopup="dialog"
              aria-label={`${room.name} 참여 가능 채팅방`}
            >
              <span className="room-hash">#</span>
              <span>
                <strong>{room.name}</strong>
                <small>참여하기</small>
              </span>
            </button>
          ))}
        </nav>

      </aside>

      <section
        className="chat-workspace"
        aria-hidden={!isChatOpen}
        inert={!isChatOpen}
      >
        <header className="chat-header">
          <div className="chat-room-heading">
            <h1>{activeRoom?.name ?? "채팅방 없음"}</h1>
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
                      <strong>참여 중인 멤버</strong>
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
              className="close-chat-button"
              type="button"
              onClick={handleCloseRoom}
              aria-label="채팅방 닫기"
            >
              ×
            </button>
          </div>
        </header>

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
              <span>#</span>
              <h2>채팅방을 불러오는 중입니다.</h2>
            </div>
          )}

          {!isLoadingRooms && !activeRoom && (
            <div className="empty-chat">
              <span>#</span>
              <h2>참여 중인 채팅방이 없습니다.</h2>
              <p>왼쪽에서 새로운 채팅방을 만들어보세요.</p>
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
              <span>#</span>
              <h2>{activeRoom.name ?? "Direct"}의 첫 메시지를 보내세요.</h2>
              <p>이 채널의 대화는 지금부터 시작됩니다.</p>
            </div>
          )}

          {messages.map((item, index) => {
            const previousMessage = messages[index - 1];
            const shouldShowDate = !previousMessage
              || !isSameMessageDate(previousMessage.createdAt, item.createdAt);

            return (
              <Fragment key={item.messageId}>
                {shouldShowDate && (
                  <div className="message-date-divider">
                    <span>{formatMessageDate(item.createdAt)}</span>
                  </div>
                )}

                {item.type === "TEXT" ? (
                  <article
                    className={item.senderId === memberId ? "message own" : "message"}
                  >
                    <span className="message-avatar">
                      {item.senderNickname?.slice(-2).toUpperCase() ?? "!"}
                    </span>
                    <div className="message-content">
                      <strong>{item.senderNickname ?? "알 수 없는 사용자"}</strong>
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
                            <>
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
                            </>
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
                    className={item.senderId === memberId ? "message own" : "message"}
                  >
                    <span className="message-avatar">
                      {item.senderNickname?.slice(-2).toUpperCase() ?? "!"}
                    </span>
                    <div className="message-content">
                      <strong>{item.senderNickname ?? "알 수 없는 사용자"}</strong>
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
            <label className="sr-only" htmlFor="message">메시지</label>
            <input
              id="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                activeRoom
                  ? `#${activeRoom.name ?? "Direct"}에 메시지 보내기`
                  : "채팅방을 선택해주세요"
              }
              disabled={!activeRoom || !isConnected || isActiveRoomDeleted}
            />
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
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M21.2 3.4 10.8 20.1l-2.1-7.2-6.9-2.8L21.2 3.4Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="m8.7 12.9 5.2-3.4"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </form>
        </footer>
      </section>

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
                <p className="eyebrow">SEND ATTACHMENT</p>
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
                <p className="eyebrow">NEW CHANNEL</p>
                <h2 id="create-room-title">새 채팅방 만들기</h2>
              </div>
              <button
                className="close-create-room-button"
                type="button"
                onClick={handleCloseCreateRoomModal}
                disabled={isCreatingRoom}
                aria-label="채팅방 생성 닫기"
              >
                ×
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
                <p className="eyebrow">EDIT CHANNEL</p>
                <h2 id="update-room-name-title">채팅방 이름 변경</h2>
              </div>
              <button
                className="close-create-room-button"
                type="button"
                onClick={handleCloseRoomNameUpdateModal}
                disabled={isUpdatingRoomName}
                aria-label="채팅방 이름 변경 닫기"
              >
                ×
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
            <p className="eyebrow">DELETE CHANNEL</p>
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
            <p className="eyebrow">CHANNEL DELETED</p>
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
                <p className="eyebrow">MY PROFILE</p>
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
              <span className="avatar">{nickname.slice(-2).toUpperCase()}</span>
              <strong>{nickname}</strong>
              <small>{isConnected ? "온라인" : "연결 중"}</small>
            </div>

            <dl className="profile-details">
              <div>
                <dt>회원 ID</dt>
                <dd>{memberId ?? "-"}</dd>
              </div>
              <div>
                <dt>이메일 인증</dt>
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
            <span className="join-room-symbol" aria-hidden="true">#</span>
            <p className="eyebrow">JOIN CHANNEL</p>
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
            <span className="leave-room-symbol" aria-hidden="true">#</span>
            <p className="eyebrow">LEAVE CHANNEL</p>
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
            <p className="eyebrow">TRANSFER OWNER</p>
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

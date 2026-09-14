import {
  Fragment,
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
import {
  chatRoomApi,
  type ChatMessage,
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
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [roomSearchQuery, setRoomSearchQuery] = useState("");
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const loadingMessageRoomIdsRef = useRef(new Set<number>());
  const pendingHistoryScrollRef = useRef<PendingHistoryScroll | null>(null);
  const shouldScrollToBottomRef = useRef(true);
  const memberRequestIdRef = useRef(0);
  const messageListRef = useRef<HTMLDivElement>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = claims?.sub ? `member-${claims.sub}` : "member";
  const emailVerified = claims?.email_verified === true;
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? null;
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
    } catch (loadError) {
      setRoomListError(
        loadError instanceof Error
          ? loadError.message
          : "채팅방 목록을 불러오지 못했습니다.",
      );
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
      onMessage: (receivedMessage) => {
        shouldScrollToBottomRef.current = true;
        setMessagesByRoom((current) => {
          const roomMessages = current[receivedMessage.roomId] ?? [];
          return {
            ...current,
            [receivedMessage.roomId]: mergeMessages(roomMessages, [receivedMessage]),
          };
        });
        setRooms((current) => current.map((room) =>
          room.roomId === receivedMessage.roomId
            ? { ...room, lastMessageAt: receivedMessage.createdAt }
            : room,
        ));
      },
      onStatusChange: setIsConnected,
      onError: setError,
    });
    chatRef.current = connection;

    return () => {
      connection.disconnect();
      chatRef.current = null;
    };
  }, [accessToken]);

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

  const handleOpenRoom = (roomId: number) => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setActiveRoomId(roomId);
    setIsChatOpen(true);
  };

  const handleOpenEmptyChat = () => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
    setActiveRoomId(null);
    setIsChatOpen(true);
  };

  const handleCloseRoom = () => {
    setIsMemberListOpen(false);
    setIsRoomMenuOpen(false);
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
              <span>
                <strong>{room.name ?? "Direct"}</strong>
                <small>{room.role}</small>
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
                disabled={!activeRoom}
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

        <div className="message-list" aria-live="polite" ref={messageListRef}>
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
                      <div className="message-bubble-row">
                        <p>{item.content}</p>
                        <time dateTime={item.createdAt}>
                          {formatMessageTime(item.createdAt)}
                        </time>
                      </div>
                    </div>
                  </article>
                ) : (
                  <p className="system-message">
                    <span /> {item.content}
                  </p>
                )}
              </Fragment>
            );
          })}
          <div ref={messageEndRef} />
        </div>

        <footer className="composer-area">
          {error && <p className="chat-error" role="alert">{error}</p>}
          <form className="message-composer" onSubmit={handleSend}>
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
              disabled={!activeRoom || !isConnected}
            />
            <button
              type="submit"
              disabled={!activeRoom || !isConnected || !message.trim()}
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
    </main>
  );
}

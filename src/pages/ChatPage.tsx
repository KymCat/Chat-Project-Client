import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "../app/AuthProvider";
import { EmailVerificationPanel } from "../features/auth/EmailVerificationPanel";
import {
  chatRoomApi,
  type ChatRoomCreateResponse,
  type ChatRoomResponse,
} from "../features/chat/api";
import { connectChat, type ChatMessage } from "../features/chat/stompClient";
import { readAccessToken } from "../shared/auth/token";

export function ChatPage() {
  const { accessToken, logout } = useAuth();
  const [rooms, setRooms] = useState<ChatRoomResponse[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);
  const [roomListError, setRoomListError] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const [roomName, setRoomName] = useState("");
  const [createdRoom, setCreatedRoom] = useState<ChatRoomCreateResponse | null>(null);
  const [roomCreationError, setRoomCreationError] = useState("");
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = claims?.sub ? `member-${claims.sub}` : "member";
  const emailVerified = claims?.email_verified === true;
  const activeRoom = rooms.find((room) => room.roomId === activeRoomId) ?? null;

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

  useEffect(() => {
    if (!accessToken) {
      setRooms([]);
      setActiveRoomId(null);
      setIsLoadingRooms(false);
      return;
    }

    void loadRooms();
  }, [accessToken, loadRooms]);

  useEffect(() => {
    if (!accessToken || activeRoomId === null) {
      setIsConnected(false);
      return;
    }

    setMessages([]);
    setError("");
    const connection = connectChat({
      roomId: String(activeRoomId),
      accessToken,
      onMessage: (receivedMessage) => {
        setMessages((current) => [...current, receivedMessage]);
      },
      onStatusChange: setIsConnected,
      onError: setError,
    });
    chatRef.current = connection;

    return () => {
      connection.disconnect();
      chatRef.current = null;
    };
  }, [accessToken, activeRoomId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = message.trim();
    if (!content) return;

    try {
      chatRef.current?.send(content);
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
    setCreatedRoom(null);
    setRoomCreationError("");

    try {
      const response = await chatRoomApi.create({ name });
      setCreatedRoom(response);
      setRoomName("");
      await loadRooms(response.roomId);
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

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // AuthProvider가 local 인증 상태를 제거하므로 로그인 화면으로 이동합니다.
    }
  };

  return (
    <main className="chat-shell">
      <aside className="chat-sidebar">
        <div className="brand-lockup chat-brand">
          <span className="brand-mark">S</span>
          <span>SIGNAL CHAT</span>
        </div>

        <form className="room-create-form" onSubmit={(event) => void handleCreateRoom(event)}>
          <label htmlFor="room-name">CREATE CHANNEL</label>
          <div>
            <input
              id="room-name"
              value={roomName}
              onChange={(event) => setRoomName(event.target.value)}
              placeholder="채팅방 이름"
              maxLength={30}
              disabled={isCreatingRoom}
            />
            <button
              type="submit"
              disabled={isCreatingRoom || !roomName.trim()}
            >
              {isCreatingRoom ? "..." : "+"}
            </button>
          </div>
          {createdRoom && (
            <p className="room-create-success">
              #{createdRoom.roomId} {createdRoom.name} · {createdRoom.type}
            </p>
          )}
          {roomCreationError && (
            <p className="room-create-error" role="alert">
              {roomCreationError}
            </p>
          )}
        </form>

        <nav className="room-list" aria-label="채팅방 목록">
          <p className="sidebar-label">CHANNELS</p>
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
          {rooms.map((room) => (
            <button
              key={room.roomId}
              className={room.roomId === activeRoomId ? "room-button active" : "room-button"}
              type="button"
              onClick={() => setActiveRoomId(room.roomId)}
              aria-label={`${room.name ?? "Direct"} 채팅방`}
            >
              <span className="room-hash">#</span>
              <span>
                <strong>{room.name ?? "Direct"}</strong>
                <small>{room.role}</small>
              </span>
            </button>
          ))}
        </nav>

        <div className="account-card">
          <span className="avatar">{nickname.slice(-2).toUpperCase()}</span>
          <div>
            <strong>{nickname}</strong>
            <small>{isConnected ? "온라인" : "연결 중"}</small>
          </div>
          <button type="button" onClick={() => void handleLogout()} aria-label="로그아웃">
            EXIT
          </button>
        </div>
      </aside>

      <section className="chat-workspace">
        <header className="chat-header">
          <div>
            <p className="eyebrow">
              CHANNEL / {activeRoom ? String(activeRoom.roomId).padStart(2, "0") : "--"}
            </p>
            <h1># {activeRoom?.name ?? "채팅방 없음"}</h1>
          </div>
          <span className={isConnected ? "connection online" : "connection"}>
            <i /> {isConnected ? "LIVE" : activeRoom ? "CONNECTING" : "NO CHANNEL"}
          </span>
        </header>

        <div className="message-list" aria-live="polite">
          {!emailVerified && <EmailVerificationPanel />}

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

          {!isLoadingRooms && activeRoom && messages.length === 0 && (
            <div className="empty-chat">
              <span>#</span>
              <h2>{activeRoom.name ?? "Direct"}의 첫 메시지를 보내세요.</h2>
              <p>이 채널의 대화는 지금부터 시작됩니다.</p>
            </div>
          )}

          {messages.map((item, index) =>
            item.type === "CHAT" ? (
              <article
                className={item.senderId === memberId ? "message own" : "message"}
                key={`${item.senderId}-${index}`}
              >
                <span className="message-avatar">
                  {item.senderNickname.slice(-2).toUpperCase()}
                </span>
                <div>
                  <strong>{item.senderNickname}</strong>
                  <p>{item.content}</p>
                </div>
              </article>
            ) : (
              <p
                className="system-message"
                key={`${item.type}-${item.senderId}-${index}`}
              >
                <span /> {item.content}
              </p>
            ),
          )}
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
            >
              SEND <span>↗</span>
            </button>
          </form>
        </footer>
      </section>
    </main>
  );
}

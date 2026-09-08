import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../app/AuthProvider";
import { EmailVerificationPanel } from "../features/auth/EmailVerificationPanel";
import { connectChat, type ChatMessage } from "../features/chat/stompClient";
import { readAccessToken } from "../shared/auth/token";

const rooms = [
  { id: "1", name: "General", description: "모두의 대화방" },
  { id: "2", name: "Backend", description: "서버 개발 이야기" },
  { id: "3", name: "Random", description: "자유로운 대화" },
];

export function ChatPage() {
  const { accessToken, logout } = useAuth();
  const [activeRoomId, setActiveRoomId] = useState(rooms[0].id);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState("");
  const chatRef = useRef<ReturnType<typeof connectChat> | null>(null);
  const messageEndRef = useRef<HTMLDivElement>(null);

  const claims = useMemo(
    () => (accessToken ? readAccessToken(accessToken) : null),
    [accessToken],
  );
  const memberId = claims?.sub ? Number(claims.sub) : null;
  const nickname = claims?.sub ? `member-${claims.sub}` : "member";
  const emailVerified = claims?.email_verified === true;
  const activeRoom = rooms.find((room) => room.id === activeRoomId) ?? rooms[0];

  useEffect(() => {
    if (!accessToken) return;

    setMessages([]);
    setError("");
    const connection = connectChat({
      roomId: activeRoomId,
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

        <nav className="room-list" aria-label="채팅방 목록">
          <p className="sidebar-label">CHANNELS</p>
          {rooms.map((room) => (
            <button
              key={room.id}
              className={room.id === activeRoomId ? "room-button active" : "room-button"}
              type="button"
              onClick={() => setActiveRoomId(room.id)}
            >
              <span className="room-hash">#</span>
              <span>
                <strong>{room.name}</strong>
                <small>{room.description}</small>
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
            <p className="eyebrow">CHANNEL / {activeRoom.id.padStart(2, "0")}</p>
            <h1># {activeRoom.name}</h1>
          </div>
          <span className={isConnected ? "connection online" : "connection"}>
            <i /> {isConnected ? "LIVE" : "CONNECTING"}
          </span>
        </header>

        <div className="message-list" aria-live="polite">
          {!emailVerified && <EmailVerificationPanel />}

          {messages.length === 0 && (
            <div className="empty-chat">
              <span>#</span>
              <h2>{activeRoom.name}의 첫 메시지를 보내세요.</h2>
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
              placeholder={`#${activeRoom.name}에 메시지 보내기`}
              disabled={!isConnected}
            />
            <button type="submit" disabled={!isConnected || !message.trim()}>
              SEND <span>↗</span>
            </button>
          </form>
        </footer>
      </section>
    </main>
  );
}

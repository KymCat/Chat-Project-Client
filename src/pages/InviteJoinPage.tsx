import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { chatRoomApi } from "../features/chat/api";
import { ApiError } from "../shared/api/httpClient";

export function InviteJoinPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const joinStartedRef = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (joinStartedRef.current) return;
    joinStartedRef.current = true;

    if (!token) {
      setError("초대 토큰이 없습니다.");
      return;
    }

    let active = true;
    let navigationTimeoutId: number | undefined;

    const joinRoom = async () => {
      try {
        const roomsBeforeJoin = await chatRoomApi.getAll();
        const previousRoomIds = new Set(
          roomsBeforeJoin.map((room) => room.roomId),
        );

        await chatRoomApi.joinByInviteToken(token);
        const roomsAfterJoin = await chatRoomApi.getAll();
        const joinedRoom = roomsAfterJoin.find(
          (room) => !previousRoomIds.has(room.roomId),
        );

        if (!active) return;

        const destination = joinedRoom
          ? `/chat?room=${joinedRoom.roomId}`
          : "/chat";
        navigationTimeoutId = window.setTimeout(() => {
          navigate(destination, { replace: true });
        }, 650);
      } catch (requestError) {
        if (!active) return;
        setError(
          requestError instanceof ApiError
            ? requestError.message
            : "초대 링크로 채팅방에 참여하지 못했습니다.",
        );
      }
    };

    void joinRoom();

    return () => {
      active = false;
      if (navigationTimeoutId !== undefined) {
        window.clearTimeout(navigationTimeoutId);
      }
    };
  }, [navigate, token]);

  return (
    <main className="invite-join-page">
      <section className="invite-join-terminal" aria-live="polite">
        <p className="eyebrow">$ room --join --invite</p>
        <h1>{error ? "초대 링크를 사용할 수 없습니다." : "채팅방에 참여하고 있습니다."}</h1>
        {error ? (
          <>
            <p className="invite-join-error" role="alert">{error}</p>
            <Link to="/chat">채팅 대시보드로 이동</Link>
          </>
        ) : (
          <p className="invite-join-progress">
            access granted<span aria-hidden="true">_</span>
          </p>
        )}
      </section>
    </main>
  );
}

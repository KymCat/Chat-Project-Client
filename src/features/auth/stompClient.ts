import { Client, type IMessage, type StompSubscription } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { webSocketUrl } from "../../shared/config/env";

interface AuthWebSocketEvent {
  type: "FORCE_LOGOUT";
}

interface ConnectAuthOptions {
  accessToken: string;
  onForceLogout: () => void;
  onError: (message: string) => void;
}

export function connectAuthEvents(options: ConnectAuthOptions) {
  let authSubscription: StompSubscription | null = null;

  const client = new Client({
    webSocketFactory: () => new SockJS(webSocketUrl),
    connectHeaders: {
      Authorization: `Bearer ${options.accessToken}`,
    },
    reconnectDelay: 5000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    onConnect: () => {
      authSubscription = client.subscribe(
        "/user/queue/auth",
        (frame: IMessage) => {
          try {
            const event = JSON.parse(frame.body) as AuthWebSocketEvent;
            if (event.type === "FORCE_LOGOUT") {
              options.onForceLogout();
            }
          } catch {
            options.onError("수신한 인증 정보를 읽을 수 없습니다.");
          }
        },
      );
    },
    onWebSocketClose: () => {
      authSubscription = null;
    },
    onStompError: () => {
      options.onError("인증 서버 연결에 실패했습니다.");
    },
  });

  client.activate();

  return {
    disconnect() {
      authSubscription?.unsubscribe();
      authSubscription = null;
      void client.deactivate();
    },
  };
}

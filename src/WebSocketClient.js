import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const SOCKET_URL = 'http://localhost:8080/ws-stomp'; // 스프링부트 WebSocket 엔드포인트

export const stompClient = new Client({
  webSocketFactory: () => new SockJS(SOCKET_URL),
  reconnectDelay: 5000, // 연결 끊기면 5초 후 재연결
});

stompClient.onConnect = () => {
  console.log('STOMP 연결 성공!');
};

stompClient.activate(); // 연결 시작

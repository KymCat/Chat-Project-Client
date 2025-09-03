import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

const SOCKET_URL = 'http://localhost:8080/ws-stomp'; // 스프링부트 WebSocket 엔드포인트

export const stompClient = new Client({
  webSocketFactory: () => new SockJS(SOCKET_URL),
  reconnectDelay: 5000, // 연결 끊기면 5초 후 재연결
});

export const connectStomp = (onChatMessage, onConnected) => {
    stompClient.onConnect = () => {
        console.log("STOMP CONNECTED");

        // 일반 메세지 구독
        stompClient.subscribe('/sub/msg', (msg) => {
            onChatMessage(JSON.parse(msg.body));
        });

        // 입장 메세지 구독
        stompClient.subscribe('/sub/enter', (msg) => {
            onChatMessage(JSON.parse(msg.body));
        });

        if(onConnected) onConnected();

    };
    stompClient.activate();
}

export const sendMessage = (msg) => {
    if (stompClient.connected) {
        stompClient.publish({
            destination: '/pub/msg',
            body: JSON.stringify(
                {   content: msg.content, 
                    sender: msg.sender,
                    type:msg.type
                })
        });
    }
}

export const enterMessage = (nickname) => {
    if (stompClient.connected) {
        stompClient.publish( {
            destination: "/pub/enter",
            body: JSON.stringify({
                content:'',
                sender: nickname,
                type: 'Enter'
            })
        })
    }
}
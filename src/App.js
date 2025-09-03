import React, {useEffect, useRef, useState} from "react";
import './css/app.css';
import { connectStomp, sendMessage, enterMessage, stompClient } from "./WebSocketClient";

function App() {
  // 채팅 입력칸
  const [input,setInput] = useState({
      sender: '', 
      content: '',
      type: '',
      roomId:''
    });

  // 일반 메세지 리스트 관리
  const [messages, setMessages] = useState([]); 

  // 사용자 구분을 위한 랜덤 사용자 아이디
  const [nickname] = useState(Math.random().toString(36).slice(2, 9));

  // 방 선택
  const [roomId, setRoomId] = useState("room1");

  // 채팅 자동 스크롤을 위한 DOM 요소,값 접근 훅
  const chatBoxRef = useRef(null);
  

  // 메시지 보내기
  const sendHandler = () => {
    if (input.content && input.content.trim() !== '') {
      sendMessage({
          sender: nickname, 
          content: input.content,
          type: "Chat",
          roomId: roomId
        });

      setInput({sender: '', content: '', type: '', roomId: roomId});
    }
  }

  // 최초 웹 렌더링 후 STOMP 구독
  useEffect(() => {
    setMessages([]); 
    console.log(roomId);

    connectStomp(
      (msg) => setMessages(prev => [...prev, msg]),
      () => enterMessage(nickname, roomId),
      roomId
    );

    return () => {
      stompClient.deactivate();
    };
  }, [roomId]); // 방이 바뀔때마다 렌더링


  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]); // 메시지가 추가될 때마다 렌더링

  return (
    <div className="chat-container">
      <h1>채팅 vmfhwprxm</h1>

      {/* 1️⃣ 채팅방 선택 UI */}
      <div className="room-select">
        <label>채팅방 선택: </label>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
          <option value="room1">방 1</option>
          <option value="room2">방 2</option>
          <option value="room3">방 3</option>
        </select>
      </div>

      <div className="chat-box" ref={chatBoxRef}>
        {messages.map((msg, idx) => (
          <div key={idx} 
            className={`chat-message ${
              msg.type === 'Enter' 
                ? "system-message"
                : msg.sender === nickname
                  ? "my-message"
                  : "other-message"
            }`}>

            <strong>{
            msg.type === "Enter" 
              ? "[System]" 
              : msg.sender === nickname 
                ? "[me]" 
                : "[other]"}: 
            </strong>
            {msg.content}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input 
          value={input.content} 
          onChange={(e) => setInput({...input, content: e.target.value, roomId:roomId})}
          onKeyDown={(e) => e.key === 'Enter' && sendHandler()}
          placeholder="메시지 입력"
        />
        <button onClick={sendHandler}>전송</button>
      </div>
    </div>
  );
}

export default App;
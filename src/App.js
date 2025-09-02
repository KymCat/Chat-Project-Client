import React, {useEffect, useRef, useState} from "react";
import './css/app.css';
import { connectStomp, sendMessage } from "./WebSocketClient";

function App() {
  const [input,setInput] = useState('');
  const [messages, setMessages] = useState([]); // 메세지 리스트
  const chatBoxRef = useRef(null); // 특정 DOM 요소,값에 접근하기 위한 훅
  const nickName = 'client'; // 채팅 닉네임

  // 메시지 보내기
  const sendHandler = () => {
    if (input.trim() !== '') {
      sendMessage(input);
      setInput('');
    }
  }

  // 최초 웹 렌더링 후 STOMP 구독
  useEffect(() => {
    connectStomp((msg) => setMessages(prev => [...prev, msg]));
  }, []); // 의존성 빈배열 == useEffect가 한번만 실행, 이후 실행 X


  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [messages]); // 메시지가 추가될 때마다 렌더링

  return (
    <div className="chat-container">
      <h1>채팅 테스트</h1>

      <div className="chat-box">
        {messages.map((msg, idx) => (
          <div key={idx} 
            className={`chat-message ${
              msg.sender === nickName ? 'my-message' : 'other-message'
            }`}>

            <strong>{msg.sender}: </strong>{msg.content}
          </div>
        ))}
      </div>

      <div className="chat-input">
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && sendHandler()}
          placeholder="메시지 입력"
        />
        <button onClick={sendHandler}>전송</button>
      </div>
    </div>
  );
}

export default App;
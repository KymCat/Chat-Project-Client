import React, {useEffect, useState} from "react";
import './css/app.css';
import { connectStomp, sendMessage } from "./WebSocketClient";

function App() {
  const [input,setInput] = useState('');
  const [messages, setMessages] = useState([]); // 메세지 리스트

  const sendHandler = () => {
    if (input.trim() !== '') {
      sendMessage(input);
      setInput('');
    }
  }

  // side-effect
  useEffect(() => {
    connectStomp((msg) => setMessages(prev => [...prev, msg]));
  }, []); // 의존성 빈배열 == useEffect가 한번만 실행, 이후 실행 X

  return (
    <div className="chat-container">
      <h1>채팅 테스트</h1>
      <div className="chat-box">
        {messages.map((msg, idx) => (
          <div key={idx} className="chat-message">
            <strong>{msg.sender}: </strong>{msg.content}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input 
          value={input} 
          onChange={(e) => setInput(e.target.value)} 
          placeholder="메시지 입력"
        />
        <button onClick={sendHandler}>전송</button>
      </div>
    </div>
  );
}

export default App;
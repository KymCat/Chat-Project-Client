import { Link } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";

const EFFECTIVE_DATE = "2026년 10월 27일";

export function PrivacyPage() {
  const { accessToken } = useAuth();
  const returnPath = accessToken ? "/chat" : "/login";

  return (
    <main className="privacy-page">
      <article className="privacy-document">
        <header className="privacy-header">
          <div>
            <p className="privacy-command">$ system --privacy</p>
            <h1>서비스 운영 및 개인정보 안내</h1>
            <p>
              CHAT 서비스가 현재 처리하는 정보와 그 목적을 공개합니다.
              이 문서는 개발 중인 서비스의 실제 구현을 기준으로 작성되었습니다.
            </p>
          </div>
          <Link className="privacy-return-link" to={returnPath}>
            <span aria-hidden="true">←</span>
            {accessToken ? "채팅으로 돌아가기" : "로그인으로 돌아가기"}
          </Link>
        </header>

        <section className="privacy-notice" aria-label="개발 단계 안내">
          <strong>STATUS: DEVELOPMENT</strong>
          <p>
            공개 운영 전에는 보유기간, 회원 탈퇴 절차, 개인정보 관련 문의처를
            실제 운영 정책에 맞게 확정해야 합니다.
          </p>
        </section>

        <nav className="privacy-index" aria-label="문서 목차">
          <a href="#processed-data">01 처리 정보</a>
          <a href="#purpose">02 이용 목적</a>
          <a href="#external-services">03 외부 서비스</a>
          <a href="#retention">04 보관 및 삭제</a>
          <a href="#cookies">05 인증 정보</a>
          <a href="#rights">06 이용자 권리</a>
        </nav>

        <div className="privacy-sections">
          <section id="processed-data" className="privacy-section">
            <p className="privacy-section-number">01</p>
            <div>
              <h2>처리하는 정보</h2>
              <dl className="privacy-data-list">
                <div>
                  <dt>회원 정보</dt>
                  <dd>이메일, 닉네임, password hash, 이메일 인증 및 마지막 로그인 시각</dd>
                </div>
                <div>
                  <dt>소셜 로그인</dt>
                  <dd>Google 계정 식별자, 이메일, 표시 이름, 프로필 사진 URL</dd>
                </div>
                <div>
                  <dt>서비스 이용</dt>
                  <dd>채팅방 참여 정보, 친구 관계, 메시지 내용과 작성·수정·삭제 시각</dd>
                </div>
                <div>
                  <dt>이미지·첨부파일</dt>
                  <dd>프로필 사진, 채팅 첨부파일, 파일명, 형식, 크기와 저장 식별자</dd>
                </div>
                <div>
                  <dt>인증 정보</dt>
                  <dd>Access Token, Session ID, Refresh Token과 인증 만료 정보</dd>
                </div>
              </dl>
            </div>
          </section>

          <section id="purpose" className="privacy-section">
            <p className="privacy-section-number">02</p>
            <div>
              <h2>정보를 이용하는 목적</h2>
              <ul>
                <li>회원 식별, 로그인 유지 및 이메일 인증</li>
                <li>채팅방 참여, 실시간 메시지와 친구 기능 제공</li>
                <li>프로필 사진 및 첨부파일 표시</li>
                <li>초대 링크 발급과 유효기간 관리</li>
                <li>중복 요청 제한, 오류 대응 및 서비스 안정성 유지</li>
              </ul>
            </div>
          </section>

          <section id="external-services" className="privacy-section">
            <p className="privacy-section-number">03</p>
            <div>
              <h2>연동되는 외부 서비스</h2>
              <div className="privacy-service-grid">
                <article>
                  <span>AUTH</span>
                  <h3>Google OAuth</h3>
                  <p>Google 로그인과 사용자가 선택한 소셜 프로필 사진 적용에 사용됩니다.</p>
                </article>
                <article>
                  <span>STORAGE</span>
                  <h3>Amazon S3</h3>
                  <p>업로드한 프로필 이미지와 채팅 첨부파일 저장에 사용됩니다.</p>
                </article>
              </div>
            </div>
          </section>

          <section id="retention" className="privacy-section">
            <p className="privacy-section-number">04</p>
            <div>
              <h2>보관 및 삭제</h2>
              <ul>
                <li>프로필 사진은 사용자가 변경하거나 삭제할 수 있습니다.</li>
                <li>메시지는 작성자가 수정하거나 삭제할 수 있으며, 삭제 상태가 기록됩니다.</li>
                <li>메시지에 연결되지 않은 임시 첨부파일은 현재 24시간 이후 정리 대상이 됩니다.</li>
                <li>초대 링크는 선택한 만료기간이 지나면 더 이상 사용할 수 없습니다.</li>
              </ul>
              <p className="privacy-caution">
                계정·메시지·활성 첨부파일의 최종 보유기간과 물리적 파기 기준은
                공개 운영 전에 별도 정책으로 확정해야 합니다.
              </p>
            </div>
          </section>

          <section id="cookies" className="privacy-section">
            <p className="privacy-section-number">05</p>
            <div>
              <h2>Cookie와 인증 정보</h2>
              <p>
                로그인 유지와 Token 재발급을 위해 Session ID 및 Refresh Token Cookie를
                사용합니다. 해당 Cookie에는 <code>HttpOnly</code>, <code>SameSite=Lax</code>가
                적용되며, 운영 환경의 설정에 따라 <code>Secure</code>가 적용됩니다.
              </p>
            </div>
          </section>

          <section id="rights" className="privacy-section">
            <p className="privacy-section-number">06</p>
            <div>
              <h2>이용자의 선택과 권리</h2>
              <p>
                이용자는 프로필 사진을 직접 업로드하거나 연결된 Google 프로필 사진으로
                변경할 수 있고, 등록된 사진과 본인이 작성한 메시지를 삭제할 수 있습니다.
              </p>
              <p className="privacy-caution">
                계정 탈퇴와 개인정보 열람·정정·삭제 요청을 접수할 공식 문의 채널은
                공개 운영 전에 추가되어야 합니다.
              </p>
            </div>
          </section>
        </div>

        <footer className="privacy-footer">
          <span>문서 기준일 {EFFECTIVE_DATE}</span>
          <span>VERITAS NETWORK / CHAT</span>
        </footer>
      </article>
    </main>
  );
}

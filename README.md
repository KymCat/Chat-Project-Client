# Signal Chat Client

ChatProject backend와 연결되는 React frontend입니다.

## Local development

```bash
npm install
npm run dev
```

개발 서버는 `http://localhost:3000`에서 실행되며 `/auth`, `/member`, `/ws-stomp` 요청을
`http://localhost:8080`으로 proxy합니다.

## Production build

```bash
npm run build
```

배포 환경에서는 `.env.example`을 참고해 `VITE_API_BASE_URL`에 backend HTTPS 주소를 설정합니다.
빌드 결과인 `dist` 폴더를 S3 + CloudFront와 같은 정적 hosting에 배포할 수 있습니다.
